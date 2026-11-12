pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "forge-std/Vm.sol";

import "../src/Auctions.sol";
import "../src/Accounts.sol";

// SPDX-License-Identifier: UNLICENSED

contract AuctionsTest is Test {
    Accounts public acc;
    Auctions public auc;
    address superAdmin;

    // accounts to be used
    address admin;
    address ambulance;
    address ambulance2;
    address initiator;
    address hospital;
    address[] allowedHospitals;

    // tender post variables
    uint256 tender;
    uint256 timeLimit;
    uint256 revealTime;
    uint256 deliveryTime;

    // bid variables
    uint256 bidVal;
    uint256 saltVal; // the secret nonce of the commitment
    bytes32 hashVal; // ambulance's commitment to bidVal on the first tender (ID 0)

    // results
    bool res;

    function setUp() public {
        // set this address as the admin address and create instance of the Auctions contract
        superAdmin = vm.addr(1);
        vm.startPrank(superAdmin);
        acc = new Accounts();
        auc = new Auctions(address(acc));
        vm.stopPrank();

        // addresses to be used for testing
        admin = vm.addr(2);
        ambulance = vm.addr(3);
        initiator = vm.addr(4);
        hospital = vm.addr(5);

        // extra accounts
        ambulance2 = vm.addr(6);

        // set variables
        timeLimit = 30;
        revealTime = 300;
        deliveryTime = 10000;

        // set bid variables
        bidVal = 100;
        saltVal = 10;
        hashVal = commitmentOf(0, ambulance, bidVal, saltVal);

        // add new admin
        vm.startPrank(superAdmin);
            acc.addAdmin(admin);
        vm.stopPrank();

        // add the three main accounts
        vm.startPrank(admin);
            acc.addAmbulance(ambulance);
            acc.addInitiator(initiator);
            acc.addHospital(hospital);
            allowedHospitals.push(hospital);

            acc.addAmbulance(ambulance2);
        vm.stopPrank();
    }

    // seals a bid the way a bidder does off-chain (same value as Auctions.commitmentOf).
    // Computed here rather than through the contract so that it can be used
    // right after a prank without the call consuming the prank.
    function commitmentOf(uint256 tenderId, address bidder, uint256 bid, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(tenderId, bidder, bid, nonce));
    }

    function testPostTender() public {
        // validate accounts is working
        bool init = acc.isInitiator(initiator);
        assertEq(true, init);

        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 100}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        assertEq(tender, 0);

        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Open, "Tender is not open");
        assertTrue(tenders[tender].details.tenderPoster == initiator);
        assertTrue(tenders[tender].tenderId == 0);

        // the commit and reveal deadlines are fixed when the tender is posted
        assertEq(tenders[tender].details.auctionDate, block.timestamp + timeLimit);
        assertEq(tenders[tender].details.revealDate, block.timestamp + timeLimit + revealTime);
        assertEq(tenders[tender].details.dueDate, block.timestamp + timeLimit + revealTime + deliveryTime);

        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 100}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        assertEq(tender, 1);
    }

    function testSecretBid() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        assertEq(tender, 0);

        // the contract computes the same commitment as the bidder does off-chain
        assertEq(auc.commitmentOf(tender, ambulance, bidVal, saltVal), hashVal);

        hoax(ambulance, 10000 ether);
        uint bidID1 = auc.secretBid(tender, hashVal);
        assertEq(0, bidID1);

        bytes32 hashVal2 = commitmentOf(tender, ambulance2, bidVal, saltVal);
        hoax(ambulance2, 10000 ether);
        uint bidID2 = auc.secretBid(tender, hashVal2);
        assertEq(1, bidID2);

        // only the commitment is stored; nothing is revealed yet
        (bytes32 commitment, uint248 amount, bool revealed) = auc.bids(tender, ambulance);
        assertEq(commitment, hashVal);
        assertEq(uint256(amount), 0);
        assertTrue(!revealed);
    }

   function testRevealBid() public {
        hoax(initiator, 10000 ether);
        uint256 tenderId = auc.postTender{value: 10000}(
            timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals
        );
        assertEq(tenderId, 0);

        hoax(ambulance, 10000 ether);
        uint256 bidID = auc.secretBid(tenderId, hashVal);
        assertEq(0, bidID);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tenderId, bidVal, saltVal);

        // the reveal only records the bid: the tender stays open, without a winner
        (, uint248 amount, bool revealed) = auc.bids(tenderId, ambulance);
        assertTrue(revealed);
        assertEq(uint256(amount), bidVal);
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tenderId].status == Auctions.TenderStatus.Open, "Tender is not open");
        assertTrue(tenders[tenderId].details.tenderAccepter == address(0));

        // the winner is determined once the reveal period is over
        skip(revealTime);
        auc.determineWinner(tenderId);

        tenders = auc.getAllTenders();
        assertTrue(tenders[tenderId].status == Auctions.TenderStatus.InProgress, "Tender is not in progress");
        assertTrue(tenders[tenderId].details.finalBid == bidVal);
        assertTrue(tenders[tenderId].details.tenderAccepter == ambulance);
    }

    function testVerifyDelivery() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        assertEq(tender, 0);

        hoax(ambulance, 10000 ether);
        uint bidID = auc.secretBid(tender, hashVal);
        assertEq(0, bidID);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tender, bidVal, saltVal);

        skip(revealTime);
        auc.determineWinner(tender);

        // no delivery time before the delivery is confirmed
        assertEq(auc.getAllTenders()[tender].details.deliveryDate, 0);

        hoax(hospital, 1000 ether);
        auc.verifyDelivery(tender);

        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Closed, "Tender is not closed");
        // the confirmation time is recorded next to the due date: on time here
        assertEq(tenders[tender].details.deliveryDate, block.timestamp);
        assertTrue(tenders[tender].details.deliveryDate <= tenders[tender].details.dueDate, "Delivery is late");
    }

    // a delivery confirmed after the due date is still paid in full, and the
    // recorded confirmation time shows that it was late
    function testLateDeliveryIsPaidAndRecorded() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal);

        skip(timeLimit + 5);
        vm.prank(ambulance);
        auc.revealBid(tender, bidVal, saltVal);

        skip(revealTime);
        auc.determineWinner(tender);

        skip(deliveryTime + 1);
        uint256 winnerBefore = ambulance.balance;
        vm.prank(hospital);
        auc.verifyDelivery(tender);
        assertEq(ambulance.balance - winnerBefore, bidVal);

        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Closed, "Tender is not closed");
        assertEq(tenders[tender].details.deliveryDate, block.timestamp);
        assertTrue(tenders[tender].details.deliveryDate > tenders[tender].details.dueDate, "Delivery is not late");
    }

    function testReclaimTender() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        assertEq(tender, 0);

        hoax(ambulance, 10000 ether);
        uint bidID = auc.secretBid(tender, hashVal);
        assertEq(0, bidID);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tender, bidVal, saltVal);

        skip(revealTime);
        auc.determineWinner(tender);

        // a tender can only be reclaimed once its delivery is overdue
        skip(deliveryTime + 1);
        uint256 balanceBefore = initiator.balance;
        vm.prank(initiator);
        auc.reclaimTender(tender);

        // the poster gets the escrow back; there is no penalty deposit to add to it
        assertEq(initiator.balance - balanceBefore, 10000);
        assertEq(address(auc).balance, 0);
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Reclaimed, "Tender is not reclaimed");
        // the missed delivery stays on record: the provider, and no delivery time
        assertTrue(tenders[tender].details.tenderAccepter == ambulance);
        assertEq(tenders[tender].details.deliveryDate, 0);
    }

    function testRetractTender() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        assertEq(tender, 0);

        hoax(initiator, 1000 ether);
        auc.retractTender(tender);
    }

    function testGetAllTenders() public {
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertEq(tenders.length, 0);

        hoax(initiator, 10000 ether);
        auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        tenders = auc.getAllTenders();
        assertEq(tenders.length, 1);

        hoax(initiator, 10000 ether);
        auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        tenders = auc.getAllTenders();
        assertEq(tenders.length, 2);
    }

    function testGetAuctionWinner() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);
        assertEq(tender, 0);

        hoax(ambulance, 10000 ether);
        uint bidID1 = auc.secretBid(tender, hashVal);
        assertEq(0, bidID1);

        bytes32 hashVal2 = commitmentOf(tender, ambulance2, bidVal-10, saltVal);
        hoax(ambulance2, 10000 ether);
        uint bidID2 = auc.secretBid(tender, hashVal2);
        assertEq(1, bidID2);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tender, bidVal, saltVal);

        // there is no winner until determineWinner is called after the reveal period
        skip(revealTime);
        vm.expectRevert("Winner not determined");
        auc.getAuctionWinner(tender);

        // ambulance2 bid lower but never revealed, so it cannot win
        auc.determineWinner(tender);
        address winner = auc.getAuctionWinner(tender);
        assertEq(winner, ambulance);
    }

    // the lowest revealed bid wins
    function testLowestBidWins() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal);

        uint256 lowerBid = bidVal - 10;
        bytes32 hashVal2 = commitmentOf(tender, ambulance2, lowerBid, saltVal);
        hoax(ambulance2, 10000 ether);
        auc.secretBid(tender, hashVal2);

        // both bidders now appear in the tender list
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertEq(tenders[tender].details.bidders.length, 2);

        // the higher bid is revealed first, then the lower one
        skip(timeLimit + 5);
        vm.prank(ambulance);
        auc.revealBid(tender, bidVal, saltVal);
        vm.prank(ambulance2);
        auc.revealBid(tender, lowerBid, saltVal);

        skip(revealTime);
        auc.determineWinner(tender);
        assertEq(auc.getAuctionWinner(tender), ambulance2);
        tenders = auc.getAllTenders();
        assertTrue(tenders[tender].details.finalBid == lowerBid);
    }

    // delivery pays the winning bid to the winner and the rest of the escrow to
    // the poster; bidding takes no deposit, so nothing is owed to the loser
    function testPayoutWithoutDeposit() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal);

        uint256 lowerBid = bidVal - 10;
        bytes32 hashVal2 = commitmentOf(tender, ambulance2, lowerBid, saltVal);
        hoax(ambulance2, 10000 ether);
        auc.secretBid(tender, hashVal2);

        // the contract holds the poster's escrow and nothing else
        assertEq(address(auc).balance, 10000);
        assertEq(ambulance.balance, 10000 ether);
        assertEq(ambulance2.balance, 10000 ether);

        skip(timeLimit + 5);
        vm.prank(ambulance);
        auc.revealBid(tender, bidVal, saltVal);
        vm.prank(ambulance2);
        auc.revealBid(tender, lowerBid, saltVal);
        skip(revealTime);
        auc.determineWinner(tender);

        uint256 winnerBefore = ambulance2.balance;
        uint256 posterBefore = initiator.balance;
        uint256 loserBefore = ambulance.balance;
        vm.prank(hospital);
        auc.verifyDelivery(tender);
        assertEq(ambulance2.balance - winnerBefore, lowerBid);
        assertEq(initiator.balance - posterBefore, 10000 - lowerBid);
        assertEq(ambulance.balance, loserBefore);
        assertEq(address(auc).balance, 0);
    }

    // the winner depends only on the revealed bids, not on the order of the reveals
    function testRevealOrderDoesNotAffectWinner() public {
        uint256 lowerBid = bidVal - 10;

        // two identical auctions, revealed in opposite orders
        for (uint256 i = 0; i < 2; i++) {
            hoax(initiator, 10000 ether);
            tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

            bytes32 hashVal1 = commitmentOf(tender, ambulance, bidVal, saltVal);
            hoax(ambulance, 10000 ether);
            auc.secretBid(tender, hashVal1);

            bytes32 hashVal2 = commitmentOf(tender, ambulance2, lowerBid, saltVal);
            hoax(ambulance2, 10000 ether);
            auc.secretBid(tender, hashVal2);

            skip(timeLimit + 5);
            if (i == 0) {
                vm.prank(ambulance);
                auc.revealBid(tender, bidVal, saltVal);
                vm.prank(ambulance2);
                auc.revealBid(tender, lowerBid, saltVal);
            } else {
                vm.prank(ambulance2);
                auc.revealBid(tender, lowerBid, saltVal);
                vm.prank(ambulance);
                auc.revealBid(tender, bidVal, saltVal);
            }

            skip(revealTime);
            auc.determineWinner(tender);
            assertEq(auc.getAuctionWinner(tender), ambulance2);
            Auctions.Tender[] memory tenders = auc.getAllTenders();
            assertTrue(tenders[tender].status == Auctions.TenderStatus.InProgress, "Tender is not in progress");
            assertTrue(tenders[tender].details.finalBid == lowerBid);
        }
    }

    // equal bids go to the earlier commitment, even if it is revealed last
    function testEqualBidsEarlierCommitmentWins() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal);

        bytes32 hashVal2 = commitmentOf(tender, ambulance2, bidVal, saltVal);
        hoax(ambulance2, 10000 ether);
        auc.secretBid(tender, hashVal2);

        skip(timeLimit + 5);
        vm.prank(ambulance2);
        auc.revealBid(tender, bidVal, saltVal);
        vm.prank(ambulance);
        auc.revealBid(tender, bidVal, saltVal);

        skip(revealTime);
        auc.determineWinner(tender);
        assertEq(auc.getAuctionWinner(tender), ambulance);
    }

    // a commitment is bound to its bidder: a copy of it cannot be opened by another address
    function testCopiedCommitmentCannotBeOpened() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal);

        // a competitor submits the commitment it saw on the chain as its own
        hoax(ambulance2, 10000 ether);
        auc.secretBid(tender, hashVal);

        // once the owner has revealed, the competitor knows the bid and the nonce too
        skip(timeLimit + 5);
        vm.prank(ambulance);
        auc.revealBid(tender, bidVal, saltVal);

        vm.expectRevert("Bid value != Hash Value");
        vm.prank(ambulance2);
        auc.revealBid(tender, bidVal, saltVal);

        (, , bool revealed) = auc.bids(tender, ambulance2);
        assertTrue(!revealed);

        // the copy counts as a bid that was never revealed
        skip(revealTime);
        auc.determineWinner(tender);
        assertEq(auc.getAuctionWinner(tender), ambulance);
        assertEq(auc.getFailedReveals(ambulance2).length, 1);
        assertEq(auc.getFailedReveals(ambulance).length, 0);
    }

    // the poster can no longer back out once the bidding period is over
    function testRetractAfterCommitDeadlineReverts() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal);

        // the block time is now exactly the commit deadline
        skip(timeLimit);
        vm.expectRevert("Bidding period is over");
        vm.prank(initiator);
        auc.retractTender(tender);

        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Open, "Tender is not open");
        assertEq(address(auc).balance, 10000);
    }

    // no valid reveal: the tender is unawarded, the poster is refunded and the
    // failed reveal is recorded against the bidder
    function testNoRevealLeavesTenderUnawarded() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal);

        // the reveal period passes without the bid being opened
        skip(timeLimit + revealTime);
        uint256 balanceBefore = initiator.balance;
        auc.determineWinner(tender);

        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Unawarded, "Tender is not unawarded");
        assertTrue(tenders[tender].details.tenderAccepter == address(0));
        assertEq(initiator.balance - balanceBefore, 10000);
        assertEq(address(auc).balance, 0);

        uint256[] memory failedReveals = auc.getFailedReveals(ambulance);
        assertEq(failedReveals.length, 1);
        assertEq(failedReveals[0], block.timestamp);
        // one failed reveal is below the limit that suspends a bidder
        assertTrue(!auc.isSuspended(ambulance));
    }

    // a bidder that reaches the failed-reveal limit (by default 3 within 30
    // days) is suspended from bidding (by default for 30 days)
    function testSuspensionAfterFailedReveals() public {
        // ambulance bids on three tenders and never reveals
        for (uint256 i = 0; i < 3; i++) {
            hoax(initiator, 10000 ether);
            tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

            bytes32 unrevealed = commitmentOf(tender, ambulance, bidVal, saltVal);
            hoax(ambulance, 10000 ether);
            auc.secretBid(tender, unrevealed);
        }

        skip(timeLimit + revealTime);
        for (uint256 i = 0; i < 3; i++) {
            // below the limit the bidder is not suspended
            assertTrue(!auc.isSuspended(ambulance));
            auc.determineWinner(i);
        }
        assertEq(auc.getFailedReveals(ambulance).length, 3);
        assertTrue(auc.isSuspended(ambulance));
        assertEq(auc.suspendedUntil(ambulance), block.timestamp + 30 days);

        // a suspended bidder cannot bid; other bidders still can
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        bytes32 hashVal1 = commitmentOf(tender, ambulance, bidVal, saltVal);
        vm.expectRevert("Bidder is suspended");
        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal1);

        bytes32 hashVal2 = commitmentOf(tender, ambulance2, bidVal, saltVal);
        hoax(ambulance2, 10000 ether);
        auc.secretBid(tender, hashVal2);

        // the suspension ends after the suspension period
        skip(30 days);
        assertTrue(!auc.isSuspended(ambulance));
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, revealTime, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", "High", allowedHospitals);

        hashVal1 = commitmentOf(tender, ambulance, bidVal, saltVal);
        hoax(ambulance, 10000 ether);
        auc.secretBid(tender, hashVal1);
    }
}
