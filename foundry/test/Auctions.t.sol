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
    uint256 deliveryTime;
    uint256 penalty;

    // bid variables
    uint256 bidVal;
    uint256 saltVal;
    uint256 hashVal;

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
        deliveryTime = 10000;
        penalty = 20;

        // set bid variables
        bidVal = 100;
        saltVal = 10;
        hashVal = uint(keccak256(abi.encodePacked(bidVal + saltVal)));

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

    function testPostTender() public {
        // validate accounts is working
        bool init = acc.isInitiator(initiator);
        assertEq(true, init);

        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 100}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        assertEq(tender, 0);

        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Open, "Tender is not open");
        assertTrue(tenders[tender].details.tenderPoster == initiator);
        assertTrue(tenders[tender].tenderId == 0);

        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 100}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        assertEq(tender, 1);
    }

    function testSecretBid() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", 0, "High", allowedHospitals);
        assertEq(tender, 0);

        hashVal = 110;
        hoax(ambulance, 10000 ether);
        uint bidID1 = auc.secretBid{value: 0}(tender, hashVal);
        assertEq(0, bidID1);

        hoax(ambulance2, 10000 ether);
        uint bidID2 = auc.secretBid{value: 0}(tender, hashVal);
        assertEq(1, bidID2);
    }

   function testRevealBid() public {  
        hoax(initiator, 10000 ether);
        uint256 tenderId = auc.postTender{value: 10000}(
            timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals
        );
        assertEq(tenderId, 0);
        
        hoax(ambulance, 10000 ether);
        uint256 bidID = auc.secretBid{value: penalty}(tenderId, hashVal);
        assertEq(0, bidID);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tenderId, bidVal, saltVal, bidID);

        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tenderId].status == Auctions.TenderStatus.InProgress, "Tender is not in progress");
        assertTrue(tenders[tenderId].details.finalBid == bidVal);
        assertTrue(tenders[tenderId].details.tenderAccepter == ambulance);
    }
 
    function testVerifyDelivery() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        assertEq(tender, 0);
        
        hoax(ambulance, 10000 ether);
        uint bidID = auc.secretBid{value: penalty}(tender, hashVal);
        assertEq(0, bidID);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tender, bidVal, saltVal, bidID);

        skip(320);
        hoax(hospital, 1000 ether);
        auc.verifyDelivery(tender);
    
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Closed, "Tender is not closed");
    }

    function testReclaimTender() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        assertEq(tender, 0);
        
        hoax(ambulance, 10000 ether);
        uint bidID = auc.secretBid{value: penalty}(tender, hashVal);
        assertEq(0, bidID);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tender, bidVal, saltVal, bidID);

        // a tender can only be reclaimed once its delivery is overdue
        skip(300 + deliveryTime + 1);
        uint256 balanceBefore = initiator.balance;
        vm.prank(initiator);
        auc.reclaimTender(tender);

        // the poster gets the escrow back plus the accepter's penalty deposit
        assertEq(initiator.balance - balanceBefore, 10000 + penalty);
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertTrue(tenders[tender].status == Auctions.TenderStatus.Reclaimed, "Tender is not reclaimed");
    }

    function testRetractTender() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        assertEq(tender, 0);
        
        hoax(initiator, 1000 ether);
        auc.retractTender(tender);
    }

    function testGetAllTenders() public {
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertEq(tenders.length, 0);

        hoax(initiator, 10000 ether);
        auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        tenders = auc.getAllTenders();
        assertEq(tenders.length, 1);
        
        hoax(initiator, 10000 ether);
        auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        tenders = auc.getAllTenders();
        assertEq(tenders.length, 2);
    }

    function testGetAuctionWinner() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);
        assertEq(tender, 0);

        hoax(ambulance, 10000 ether);
        uint bidID1 = auc.secretBid{value: penalty}(tender, hashVal);
        assertEq(0, bidID1);

        uint256 hashVal2 = uint(keccak256(abi.encodePacked(bidVal-10 + saltVal)));
        hoax(ambulance2, 10000 ether);
        uint bidID2 = auc.secretBid{value: penalty}(tender, hashVal2);
        assertEq(1, bidID2);

        skip(timeLimit + 5);
        hoax(ambulance, 1000 ether);
        auc.revealBid(tender, bidVal, saltVal, bidID1);

        skip(320);
        address winner = auc.getAuctionWinner(tender);
        assertEq(winner, ambulance);
    }

    // the lowest revealed bid wins, whatever the order of the reveals
    function testLowestBidWins() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        uint bidID1 = auc.secretBid{value: penalty}(tender, hashVal);

        uint256 lowerBid = bidVal - 10;
        uint256 hashVal2 = uint(keccak256(abi.encodePacked(lowerBid + saltVal)));
        hoax(ambulance2, 10000 ether);
        uint bidID2 = auc.secretBid{value: penalty}(tender, hashVal2);

        // both bidders now appear in the tender list
        Auctions.Tender[] memory tenders = auc.getAllTenders();
        assertEq(tenders[tender].details.bidders.length, 2);

        // the higher bid is revealed first, then the lower one takes over
        skip(timeLimit + 5);
        vm.prank(ambulance);
        auc.revealBid(tender, bidVal, saltVal, bidID1);
        vm.prank(ambulance2);
        auc.revealBid(tender, lowerBid, saltVal, bidID2);

        skip(320);
        assertEq(auc.getAuctionWinner(tender), ambulance2);
        tenders = auc.getAllTenders();
        assertTrue(tenders[tender].details.finalBid == lowerBid);
    }

    // on-time delivery pays bid + deposit to the winner; the loser withdraws
    function testPayoutAndDepositRefund() public {
        hoax(initiator, 10000 ether);
        tender = auc.postTender{value: 10000}(timeLimit, deliveryTime, "311 Thatcher Loop", "Oxford", "Ohio", "45056", penalty, "High", allowedHospitals);

        hoax(ambulance, 10000 ether);
        uint bidID1 = auc.secretBid{value: penalty}(tender, hashVal);

        uint256 lowerBid = bidVal - 10;
        uint256 hashVal2 = uint(keccak256(abi.encodePacked(lowerBid + saltVal)));
        hoax(ambulance2, 10000 ether);
        uint bidID2 = auc.secretBid{value: penalty}(tender, hashVal2);

        skip(timeLimit + 5);
        vm.prank(ambulance);
        auc.revealBid(tender, bidVal, saltVal, bidID1);
        vm.prank(ambulance2);
        auc.revealBid(tender, lowerBid, saltVal, bidID2);
        skip(320);

        uint256 winnerBefore = ambulance2.balance;
        uint256 posterBefore = initiator.balance;
        vm.prank(hospital);
        auc.verifyDelivery(tender);
        assertEq(ambulance2.balance - winnerBefore, lowerBid + penalty);
        assertEq(initiator.balance - posterBefore, 10000 - lowerBid);

        uint256 loserBefore = ambulance.balance;
        vm.prank(ambulance);
        auc.withdrawDeposit(tender);
        assertEq(ambulance.balance - loserBefore, penalty);
        assertEq(address(auc).balance, 0);
    }
}
