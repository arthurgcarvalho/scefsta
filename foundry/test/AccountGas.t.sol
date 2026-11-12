pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "forge-std/Vm.sol";

import "../src/Auctions.sol";
import "../src/Accounts.sol";

// SPDX-License-Identifier: UNLICENSED

contract AuctionGasTest is Test {
    Accounts public acc;
    Auctions public auc;
    address superAdmin;

    // accounts to be used
    address admin;
    address ambulance;
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
    uint256 saltVal;
    uint256 hashVal;

    // results
    bool res;

    // struct info for tenders
    // enum for various possible tender status's, closed is default
    enum TenderStatus {
        Closed,
        InProgress,
        Open,
        Retracted,
        Reclaimed,
        Unawarded
    }

    // helper struct for tender details
     struct TenderDetails {
        address payable tenderPoster;
        address payable tenderAccepter;
        uint256 postDate;
        uint256 auctionDate;
        uint256 revealDate;
        uint256 dueDate;
        uint256 deliveryDate;
        string addr;
        string city;
        string state;
        string zipcode;
        address[] allowedHospitals;
        uint256 maxBid;

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

    function setUp() public {
       // set this address as the admin address and create instance of the Accounts contract
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

        // set variables
        timeLimit = 30;
        revealTime = 300;
        deliveryTime = 10000;

        // set bid variables
        bidVal = 100;
        saltVal = 10;
    }

    function testAccountGasTimes() public {
        for (uint256 i = 0; i < 100; i++) {
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
            vm.stopPrank();

            // isAccount functions
            vm.startPrank(admin);
                acc.isAdmin(admin);
                acc.isAmbulance(ambulance);
                acc.isInitiator(initiator);
                acc.isHospital(hospital);
            vm.stopPrank();

            // remove the three main accounts
            vm.startPrank(admin);
                acc.removeAmbulance(ambulance);
                acc.removeInitiator(initiator);
                acc.removeHospital(hospital);
                allowedHospitals.push(hospital);
            vm.stopPrank();

            // remove admin
            vm.prank(superAdmin);
            acc.removeAdmin(admin);
        }
    }
}