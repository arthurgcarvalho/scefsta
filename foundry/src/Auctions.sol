// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./Accounts.sol";

contract Auctions {
    // initialize accounts contract
    Accounts accountsContract;

    // constants
    uint256 constant MAX_INT = 2**256 - 1;
    uint256 constant REVEAL_PERIOD = 300;

    // enum for various possible tender status's, closed is default
    enum TenderStatus {
        Closed,
        InProgress,
        Open,
        Retracted,
        Reclaimed
    }

    // helper struct for tender details
     struct TenderDetails {
        address payable tenderPoster;
        address payable tenderAccepter;
        uint256 postDate;
        uint256 auctionDate;
        uint256 revealDate;
        uint256 dueDate;
        string addr;
        string city;
        string state;
        string zipcode;
        address[] allowedHospitals;
        uint256 maxBid;
        uint256 penalty;
        // Maps an address to its bid. This enforces one bid per address,
        //so that ambulances do not just bid as many prices as they can,
        //and then reveal lower and lower bids during the reveal period.
        // We use 2 arrays because we can't have nested mappings in Solidity.
        address[] bidders;
        uint[] bidHashArray;
        uint256 finalBid;
        string severity;
    }

    // struct to hold tender information
    struct Tender {
        TenderDetails details;
        TenderStatus status;
        uint256 tenderId;
    }

    // all tenders, indexed by tender ID (the single copy of every tender)
    Tender[] public tenders;

    // Penalty deposits currently held in escrow: tender ID => bidder => held.
    // Every bidder deposits the tender's penalty amount once, when bidding.
    mapping(uint256 => mapping(address => bool)) public depositHeld;

    // constructor, references the Accounts contract address
    constructor(address contractAddress) {
        accountsContract = Accounts(contractAddress);
    }

    /*
    * Function posts new tender from initiator and begins the auction for the tender
    *
    * @param timeLimit - length of the auction period
    * @param deliveryTime - how long the ambulance has to transport the patient after auction and reveal
    * @param addr - address of the tender location
    * @param city - city of the tender location
    * @param state - state of the tender location
    * @param penalty - penalty amount charged for lack of delivery for accepted tender
    * @param severity - severity of the tender patient
    * @param allowedHospitals - list of valid hospitals to be transported to
    * @returns - returns the id of the new tender posted
    * Note: msg.value is the max bid
    */
    function postTender(
        uint256 timeLimit,
        uint256 deliveryTime,
        string memory addr,
        string memory city,
        string memory state,
        string memory zipcode,
        uint256 penalty,
        string memory severity,
        address[] memory allowedHospitals
    ) public payable returns (uint256) {
        require(accountsContract.isInitiator(msg.sender), "Sender not initiator");
        require(msg.value > 0, "Max Value < 0");

        // validate allowed hospitals given are valid hospitals
        for (uint256 i = 0; i < allowedHospitals.length; i++) {
            require(accountsContract.isHospital(allowedHospitals[i]), "Hospital(s) invalid");
        }

        // initalize new tender information
        Tender memory tender;
        tender.tenderId = tenders.length;
        tender.details.tenderPoster = payable(msg.sender);
        tender.status = TenderStatus.Open; // open tender

        // set important dates for tender
        tender.details.postDate = block.timestamp; // set post date to current time
        tender.details.auctionDate = block.timestamp + timeLimit; // sets auction end date w/ time limit given
        tender.details.revealDate = block.timestamp + timeLimit + REVEAL_PERIOD; // sets reveal peiod end date
        tender.details.dueDate = block.timestamp + timeLimit + REVEAL_PERIOD + deliveryTime; // set due date for tender

        // set tender information
        tender.details.finalBid = MAX_INT; // set current bid to max possible integer
        tender.details.maxBid = msg.value; // set maximum bid to msg.value
        tender.details.penalty = penalty;
        tender.details.allowedHospitals = allowedHospitals;

        // patient location and details
        tender.details.addr = addr;
        tender.details.city = city;
        tender.details.state = state;
        tender.details.zipcode = zipcode;
        tender.details.severity = severity;

        tenders.push(tender);
        return tender.tenderId;
    }

    event BidPlaced(uint256 tenderId, uint256 bidId);

    /*
    * Function places a secret bid by an ambulance. Each ambulance receives only 1 bid.
    * The penalty amount is deposited with the bid and held in escrow: the winner
    * gets it back on an on-time delivery, every other bidder can take it back
    * with withdrawDeposit once the reveal period is over.
    *
    * @param tenderId - the ID of the tender being bid on
    * @param bidHashedAmount - the hash value of the bid being places (bid + random salt value)
    * @returns the ID of the ambulances bid, used for revealing
    */
    function secretBid(uint256 tenderId, uint256 bidHashedAmount) public payable returns(uint256 index) {
        Tender storage tender = tenders[tenderId];
        require(accountsContract.isAmbulance(msg.sender), "Sender must be an ambulance");
        require(tender.status == TenderStatus.Open, "Tender not open");
        require (block.timestamp < tender.details.auctionDate, "Auction has passed");
        require(msg.value == tender.details.penalty, "Incorrect penalty amount");
        require(!contains(tender.details.bidders, msg.sender), "Can only bid once");

        // add bid to array and record the deposit
        tender.details.bidders.push(msg.sender);
        tender.details.bidHashArray.push(bidHashedAmount);
        depositHeld[tenderId][msg.sender] = true;

        index = tender.details.bidders.length - 1;
        emit BidPlaced(tenderId, index);
    }

    /*
    * Function is used to reveal bids after the auction period ends. Every bidder
    * can reveal until the reveal period is over; the lowest revealed bid wins
    * (the earlier reveal wins a tie). Bidders who do not reveal cannot win.
    *
    * @param tenderId - ID of tender being revealed
    * @param bidVal - amount bid by the ambulance
    * @param saltVal - the random salt integer used in secretBid
    * @param index - index of placed secret bid
    */
    function revealBid(
        uint256 tenderId,
        uint256 bidVal,
        uint256 salt,
        uint256 index
    ) public {
        Tender storage tender = tenders[tenderId];
        require(accountsContract.isAmbulance(msg.sender), "Sender must be ambulance");
        require(block.timestamp > tender.details.auctionDate, "Tender under auction");
        require(block.timestamp < tender.details.revealDate, "Tender past reveal period");
        // the first valid reveal moves the tender from Open to InProgress
        require(
            tender.status == TenderStatus.Open || tender.status == TenderStatus.InProgress,
            "Tender not open"
        );
        require(bidVal < tender.details.maxBid, "Bid was not below max bid amount");
        require(msg.sender == tender.details.bidders[index], "Wrong bid ID");
        require(tender.details.bidHashArray[index] == uint256(keccak256(abi.encodePacked(bidVal + salt))), "Bid value != Hash Value");

        // the job goes to this bidder only if the bid beats the lowest so far
        if (bidVal < tender.details.finalBid) {
            tender.status = TenderStatus.InProgress;
            tender.details.tenderAccepter = payable(msg.sender);
            tender.details.finalBid = bidVal;
        }
    }

    /*
     * get the winner of an auction
     *
     * @param tenderId - given tender ID
     */
    function getAuctionWinner(uint256 tenderId) public view returns (address tenderWinner) {
        require(
            block.timestamp >
                tenders[tenderId].details.revealDate,
                "Tender not past Reveal"
        );

        require(
            tenders[tenderId].status != TenderStatus.Open, "Tender is open"
        );

        return tenders[tenderId].details.tenderAccepter;
    }

    /*
    * this function is called upon delivery of a patient where the ambulance is then paid for delivery
    *
    * @param tenderId - id of the tender where delivery is being verified
    */
    function verifyDelivery(uint256 tenderId) public {
        Tender storage tender = tenders[tenderId];
        require(accountsContract.isHospital(msg.sender), "Sender must be hospital");
        require(
            tender.status == TenderStatus.InProgress,
            "Tender not in progress"
        );
        require(
            block.timestamp > tender.details.revealDate,
            "Tender is not past reveal date"
        );

        require(contains(tender.details.allowedHospitals, msg.sender), "Sender valid hospital");

        // close the tender and release the winner's deposit before paying out
        tender.status = TenderStatus.Closed;
        depositHeld[tenderId][tender.details.tenderAccepter] = false;

        uint256 payment = tender.details.finalBid;
        uint256 refund = tender.details.maxBid - tender.details.finalBid;

        // delivered on time: the ambulance gets its penalty deposit back with
        // the payment; delivered late: the deposit goes to the tender poster
        if (block.timestamp < tender.details.dueDate) {
            payment += tender.details.penalty;
        } else {
            refund += tender.details.penalty;
        }

        // transfer agreed upon funds to the tender accepter
        tender.details.tenderAccepter.transfer(payment);

        // transfer the rest of the funds back to the tender poster
        if (refund > 0) {
            tender.details.tenderPoster.transfer(refund);
        }
    }

    /*
     * get all the tenders present in tenders array
     *
     * @returns all tenders on the blockchain
     */
    function getAllTenders() public view returns (Tender[] memory) {
        return tenders;
    }

    /*
     * allows police stations to reclaim their funds + the penalty for failed jobs:
     * the job was accepted but not delivered by its due date
     *
     * @param tenderId - ID of tender being retracted
     */
    function reclaimTender(uint256 tenderId) public {
        Tender storage tender = tenders[tenderId];
        require(
            tender.details.tenderPoster == msg.sender,
            "Sender is not the tender poster"
        );
        require(
            tender.status == TenderStatus.InProgress,
            "Tender not in progress"
        );
        require(
            tender.details.tenderAccepter != address(0),
            "Tender accepter is not the address set"
        );
        require(block.timestamp > tender.details.dueDate, "Delivery is not overdue");

        // update status of the tender; the accepter's deposit is forfeited
        tender.status = TenderStatus.Reclaimed;
        depositHeld[tenderId][tender.details.tenderAccepter] = false;

        tender.details.tenderPoster.transfer(
            tender.details.maxBid + tender.details.penalty
        );
    }

    /*
     * remove a tender with auction in progress from auction period
     *
     * @param tenderId - ID of tender being retracted
     */
    function retractTender(uint256 tenderId) public {
        Tender storage tender = tenders[tenderId];
        require(
            msg.sender == tender.details.tenderPoster,
            "Sender is not the tender poster"
        );
        require(
            tender.status == TenderStatus.Open,
            "Tender not open"
        );

        // update status of the tender (bidders can now withdraw their deposits)
        tender.status = TenderStatus.Retracted;

        // can only retract a tender if bid period is over (need to add)
        tender.details.tenderPoster.transfer(
            tender.details.maxBid
        );
    }

    /*
     * lets a bidder who did not win take the penalty deposit back: once the
     * reveal period is over, or at any time if the tender was retracted. The
     * winner's deposit stays in escrow until the delivery is verified.
     *
     * @param tenderId - ID of the tender the deposit was placed on
     */
    function withdrawDeposit(uint256 tenderId) public {
        Tender storage tender = tenders[tenderId];
        require(depositHeld[tenderId][msg.sender], "No deposit to withdraw");
        require(
            tender.status == TenderStatus.Retracted ||
                block.timestamp > tender.details.revealDate,
            "Reveal period is not over"
        );
        require(
            msg.sender != tender.details.tenderAccepter,
            "Winner's deposit is held until delivery"
        );

        depositHeld[tenderId][msg.sender] = false;
        payable(msg.sender).transfer(tender.details.penalty);
    }

    // This sucks, but it's one of the consequences of storing everything on the blockchain
    function contains(address[] storage addresses, address addressToFind) private view returns (bool doesContain) {
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i] == addressToFind) {
                return true;
            }
        }
        return false;
    }
}
