// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./Accounts.sol";

/*
 * Sealed-bid (commit-reveal) reverse auctions for transportation tenders.
 *
 * Timeline of a tender posted at block time t0 with a bidding duration Tc and
 * a reveal duration Tr (both fixed when the tender is posted):
 *
 *   t0 <= t < tc = t0 + Tc   providers commit to a bid (secretBid); the hirer
 *                            may still retract the tender
 *   tc <= t < tr = tc + Tr   providers open their commitments (revealBid)
 *   t >= tr                  anyone may trigger winner determination
 *                            (determineWinner)
 *
 * "t" is always the timestamp of the block that includes the transaction.
 * No deposit or penalty is taken from bidders or from the winner. Not opening
 * a commitment is recorded against the provider's address instead, and
 * repeated failures suspend the provider from bidding.
 */
contract Auctions {
    // initialize accounts contract
    Accounts accountsContract;

    // constants
    uint256 constant MAX_INT = 2**256 - 1;

    // enum for various possible tender status's, closed is default
    enum TenderStatus {
        Closed,     // delivered and paid
        InProgress, // winner determined, delivery pending
        Open,       // bidding or reveal phase, or waiting for winner determination
        Retracted,  // withdrawn by the hirer before the commit deadline
        Reclaimed,  // not delivered by the due date; funds returned to the hirer
        Unawarded   // no valid bid was revealed; funds returned to the hirer
    }

    // helper struct for tender details
     struct TenderDetails {
        address payable tenderPoster;
        address payable tenderAccepter;
        uint256 postDate;
        uint256 auctionDate; // commit deadline (tc)
        uint256 revealDate;  // reveal deadline (tr)
        uint256 dueDate;      // scheduled delivery time
        // When the delivery was confirmed (zero until then). It is kept next
        // to the scheduled time: a delivery was late if it is after dueDate.
        uint256 deliveryDate;
        string addr;
        string city;
        string state;
        string zipcode;
        address[] allowedHospitals;
        uint256 maxBid;
        // Every address that committed to a bid, in the order of commitment.
        // The bids themselves are kept in the bids mapping below, which
        // enforces one bid per address, so that ambulances do not just bid as
        // many prices as they can and then reveal lower and lower bids during
        // the reveal period.
        address[] bidders;
        uint256 finalBid;
        string severity;
    }

    // struct to hold tender information
    struct Tender {
        TenderDetails details;
        TenderStatus status;
        uint256 tenderId;
    }

    // one provider's bid on one tender
    struct Bid {
        bytes32 commitment; // zero while the provider has not bid on the tender
        uint248 amount;     // the bid, once revealed
        bool revealed;
    }

    // all tenders, indexed by tender ID (the single copy of every tender)
    Tender[] public tenders;

    // tender ID => bidder => its bid
    mapping(uint256 => mapping(address => Bid)) public bids;

    // Reveal policy, set by the platform's administrators: a provider with
    // failedRevealLimit failed reveals within failedRevealWindow seconds is
    // suspended from bidding for suspensionPeriod seconds.
    uint256 public failedRevealLimit = 3;
    uint256 public failedRevealWindow = 30 days;
    uint256 public suspensionPeriod = 30 days;

    // when each of a provider's failed reveals was recorded, oldest first
    mapping(address => uint256[]) private failedRevealTimes;

    // a provider cannot bid before this time (zero: never suspended)
    mapping(address => uint256) public suspendedUntil;

    event BidPlaced(uint256 tenderId, uint256 bidId);
    event BidRevealed(uint256 tenderId, address bidder, uint256 bidVal);
    // winner is the zero address when no valid bid was revealed
    event WinnerDetermined(uint256 tenderId, address winner, uint256 winningBid);
    event RevealFailed(uint256 tenderId, address bidder);
    event BidderSuspended(address bidder, uint256 until);
    event RevealPolicyChanged(uint256 failedRevealLimit, uint256 failedRevealWindow, uint256 suspensionPeriod);
    // the delivery was late if deliveryDate is after dueDate
    event DeliveryVerified(uint256 tenderId, address provider, uint256 deliveryDate, uint256 dueDate);

    // constructor, references the Accounts contract address
    constructor(address contractAddress) {
        accountsContract = Accounts(contractAddress);
    }

    /*
    * Function posts new tender from initiator and begins the auction for the tender
    *
    * @param timeLimit - length of the bidding (commit) period, in seconds
    * @param revealTime - length of the reveal period that follows it, in seconds
    * @param deliveryTime - how long the ambulance has to transport the patient after auction and reveal
    * @param addr - address of the tender location
    * @param city - city of the tender location
    * @param state - state of the tender location
    * @param severity - severity of the tender patient
    * @param allowedHospitals - list of valid hospitals to be transported to
    * @returns - returns the id of the new tender posted
    * Note: msg.value is the max bid
    */
    function postTender(
        uint256 timeLimit,
        uint256 revealTime,
        uint256 deliveryTime,
        string memory addr,
        string memory city,
        string memory state,
        string memory zipcode,
        string memory severity,
        address[] memory allowedHospitals
    ) public payable returns (uint256) {
        require(accountsContract.isInitiator(msg.sender), "Sender not initiator");
        require(msg.value > 0, "Max Value < 0");
        require(timeLimit > 0 && revealTime > 0, "Bidding and reveal periods must be positive");

        // validate allowed hospitals given are valid hospitals
        for (uint256 i = 0; i < allowedHospitals.length; i++) {
            require(accountsContract.isHospital(allowedHospitals[i]), "Hospital(s) invalid");
        }

        // initalize new tender information
        Tender memory tender;
        tender.tenderId = tenders.length;
        tender.details.tenderPoster = payable(msg.sender);
        tender.status = TenderStatus.Open; // open tender

        // set important dates for tender; they cannot be changed afterwards
        tender.details.postDate = block.timestamp; // set post date to current time
        tender.details.auctionDate = block.timestamp + timeLimit; // commit deadline
        tender.details.revealDate = block.timestamp + timeLimit + revealTime; // reveal deadline
        tender.details.dueDate = block.timestamp + timeLimit + revealTime + deliveryTime; // set due date for tender

        // set tender information
        tender.details.finalBid = MAX_INT; // set current bid to max possible integer
        tender.details.maxBid = msg.value; // set maximum bid to msg.value
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

    /*
    * The commitment that seals a bid: a hash over the tender, the bidder, the
    * bid and a secret nonce. Binding it to the bidder and to the tender means
    * that a commitment copied from another provider, or from another tender,
    * can never be opened.
    *
    * Providers should compute this value on their own machine: asking a
    * network node to evaluate this function would show it the bid.
    *
    * @param tenderId - the ID of the tender being bid on
    * @param bidder - the address placing the bid
    * @param bidVal - the bid amount
    * @param nonce - 256 random bits, kept secret until the reveal
    */
    function commitmentOf(
        uint256 tenderId,
        address bidder,
        uint256 bidVal,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(tenderId, bidder, bidVal, nonce));
    }

    /*
    * Function places a secret bid by an ambulance. Each ambulance receives only 1 bid.
    * Accepted only while the block time is before the commit deadline, and
    * only from providers that are not suspended.
    *
    * @param tenderId - the ID of the tender being bid on
    * @param commitment - commitmentOf(tenderId, msg.sender, bid, nonce)
    * @returns the ID of the ambulances bid (its position among the tender's bidders)
    */
    function secretBid(uint256 tenderId, bytes32 commitment) public returns(uint256 index) {
        Tender storage tender = tenders[tenderId];
        require(accountsContract.isAmbulance(msg.sender), "Sender must be an ambulance");
        require(block.timestamp >= suspendedUntil[msg.sender], "Bidder is suspended");
        require(tender.status == TenderStatus.Open, "Tender not open");
        require(block.timestamp < tender.details.auctionDate, "Auction has passed");
        require(commitment != bytes32(0), "Empty commitment");
        require(bids[tenderId][msg.sender].commitment == bytes32(0), "Can only bid once");

        bids[tenderId][msg.sender].commitment = commitment;
        tender.details.bidders.push(msg.sender);

        index = tender.details.bidders.length - 1;
        emit BidPlaced(tenderId, index);
    }

    /*
    * Function is used to reveal a bid once the bidding period has ended.
    * Accepted only while the block time is in [commit deadline, reveal
    * deadline). The revealed values must reproduce the sender's commitment.
    * Revealing does not pick the winner: that happens in determineWinner,
    * from all valid reveals, after the reveal deadline.
    *
    * @param tenderId - ID of tender being revealed
    * @param bidVal - amount bid by the ambulance
    * @param nonce - the secret nonce used in the commitment
    */
    function revealBid(
        uint256 tenderId,
        uint256 bidVal,
        uint256 nonce
    ) public {
        Tender storage tender = tenders[tenderId];
        Bid storage bid = bids[tenderId][msg.sender];
        require(accountsContract.isAmbulance(msg.sender), "Sender must be ambulance");
        require(tender.status == TenderStatus.Open, "Tender not open");
        require(block.timestamp >= tender.details.auctionDate, "Tender under auction");
        require(block.timestamp < tender.details.revealDate, "Tender past reveal period");
        require(bid.commitment != bytes32(0), "No bid to reveal");
        require(!bid.revealed, "Bid already revealed");
        require(bidVal < tender.details.maxBid, "Bid was not below max bid amount");
        require(bid.commitment == commitmentOf(tenderId, msg.sender, bidVal, nonce), "Bid value != Hash Value");

        // bidVal is below maxBid, an amount of currency, so it fits in 248 bits
        bid.amount = uint248(bidVal);
        bid.revealed = true;
        emit BidRevealed(tenderId, msg.sender, bidVal);
    }

    /*
    * Determines the winner of an auction. Anyone can call it once the block
    * time has reached the reveal deadline. The lowest revealed bid wins; equal
    * bids go to the one committed first. The result depends only on which
    * bids were validly revealed, not on the order of the reveals or on who
    * calls this function.
    *
    * Every bidder that did not reveal gets a failed reveal recorded. If no
    * valid bid was revealed, the tender is closed as unawarded and the hirer
    * gets the funds back.
    *
    * @param tenderId - ID of the tender
    */
    function determineWinner(uint256 tenderId) public {
        Tender storage tender = tenders[tenderId];
        require(tender.status == TenderStatus.Open, "Tender not open");
        require(block.timestamp >= tender.details.revealDate, "Reveal period is not over");

        address winner = address(0);
        uint256 lowestBid = MAX_INT;
        address[] storage bidders = tender.details.bidders;
        for (uint256 i = 0; i < bidders.length; i++) {
            Bid storage bid = bids[tenderId][bidders[i]];
            if (!bid.revealed) {
                recordFailedReveal(tenderId, bidders[i]);
            } else if (bid.amount < lowestBid) {
                lowestBid = bid.amount;
                winner = bidders[i];
            }
        }

        if (winner != address(0)) {
            tender.status = TenderStatus.InProgress;
            tender.details.tenderAccepter = payable(winner);
            tender.details.finalBid = lowestBid;
            emit WinnerDetermined(tenderId, winner, lowestBid);
        } else {
            tender.status = TenderStatus.Unawarded;
            emit WinnerDetermined(tenderId, address(0), 0);
            tender.details.tenderPoster.transfer(tender.details.maxBid);
        }
    }

    // records a failed reveal and suspends the bidder if it has reached the
    // limit within the rolling window
    function recordFailedReveal(uint256 tenderId, address bidder) private {
        uint256[] storage times = failedRevealTimes[bidder];
        times.push(block.timestamp);
        emit RevealFailed(tenderId, bidder);

        // The times are in increasing order, so the limit is reached within
        // the window exactly when the limit-th most recent failure is inside it
        if (
            times.length >= failedRevealLimit &&
            times[times.length - failedRevealLimit] + failedRevealWindow > block.timestamp
        ) {
            suspendedUntil[bidder] = block.timestamp + suspensionPeriod;
            emit BidderSuspended(bidder, suspendedUntil[bidder]);
        }
    }

    /*
     * the public record of a provider's failed reveals
     *
     * @param bidder - the provider's address
     * @returns the time each failed reveal was recorded, oldest first
     */
    function getFailedReveals(address bidder) public view returns (uint256[] memory) {
        return failedRevealTimes[bidder];
    }

    // returns true while the provider is suspended from bidding
    function isSuspended(address bidder) public view returns (bool) {
        return block.timestamp < suspendedUntil[bidder];
    }

    /*
     * Allows an admin to change the reveal policy. It applies to failed
     * reveals recorded from then on; suspensions already running keep their
     * end time.
     *
     * @param limit - failed reveals within the window that trigger a suspension
     * @param window - length of the rolling window, in seconds
     * @param suspension - length of a suspension, in seconds
     */
    function setRevealPolicy(uint256 limit, uint256 window, uint256 suspension) public {
        require(accountsContract.isAdmin(msg.sender), "Sender must be admin");
        require(limit > 0, "Limit must be positive");
        failedRevealLimit = limit;
        failedRevealWindow = window;
        suspensionPeriod = suspension;
        emit RevealPolicyChanged(limit, window, suspension);
    }

    /*
     * get the winner of an auction
     *
     * @param tenderId - given tender ID
     */
    function getAuctionWinner(uint256 tenderId) public view returns (address tenderWinner) {
        require(
            tenders[tenderId].status != TenderStatus.Open, "Winner not determined"
        );

        return tenders[tenderId].details.tenderAccepter;
    }

    /*
    * this function is called upon delivery of a patient where the ambulance is then paid for delivery
    *
    * A delivery can be confirmed after its due date as well, as long as the
    * hirer has not reclaimed the funds; the provider is paid in full either
    * way. The time of the confirmation is recorded in the tender, next to the
    * due date, so that late deliveries stay on the provider's public record.
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

        require(contains(tender.details.allowedHospitals, msg.sender), "Sender valid hospital");

        // close the tender, and record when, before paying out
        tender.status = TenderStatus.Closed;
        tender.details.deliveryDate = block.timestamp;
        emit DeliveryVerified(tenderId, tender.details.tenderAccepter, block.timestamp, tender.details.dueDate);

        uint256 payment = tender.details.finalBid;
        uint256 refund = tender.details.maxBid - tender.details.finalBid;

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
     * allows police stations to reclaim their funds for failed jobs:
     * the job was accepted but not delivered by its due date. The tender
     * stays in the public list as Reclaimed, with the provider's address, as
     * the record of the missed delivery.
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

        // update status of the tender
        tender.status = TenderStatus.Reclaimed;

        tender.details.tenderPoster.transfer(
            tender.details.maxBid
        );
    }

    /*
     * remove a tender from auction. Allowed only before the commit deadline,
     * so that a hirer cannot cancel once bids are being revealed.
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
        require(
            block.timestamp < tender.details.auctionDate,
            "Bidding period is over"
        );

        // update status of the tender
        tender.status = TenderStatus.Retracted;

        tender.details.tenderPoster.transfer(
            tender.details.maxBid
        );
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
