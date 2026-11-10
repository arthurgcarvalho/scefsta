// SPDX-License-Identifier: UNLICENSED 
pragma solidity ^0.8.0;

contract Accounts {
    // super admin who has access to all features
    address public superAdmin;

    // four user accounts
    mapping(address=> bool) private admins;
    mapping(address => bool) private initiators;
    mapping(address => bool) private ambulances;
    mapping(address => bool) private hospitals;

    // set the superAdmin; every other account is added by an admin afterwards
    constructor() {
        // add superAdmin to all account types (for demo purposes only)
        superAdmin = msg.sender;
        admins[superAdmin] = true;
        initiators[superAdmin] = true;
        ambulances[superAdmin] = true;
        hospitals[superAdmin] = true;
    }

     // returns true if address is an ambulance, false if not
    function isAmbulance(address addr) public view returns (bool) {
        return ambulances[addr];
    }

     // Allows the admin to add verified ambulances
    function addAmbulance(address addr) public {
        // verify account does not already have another role
        require(hospitals[addr] == false, "Already facility");
        require(ambulances[addr] == false, "Already a transport");
        require(initiators[addr] == false, "Already initiator");
        require(admins[addr] == false, "Already admin");

        // verify the sender is an admin
        require(admins[msg.sender] == true, "Sender must be admin");

        // if passes all requires add account to ambulances
        ambulances[addr] = true;
    }

    // Allows the admin to remove verified ambulances
    function removeAmbulance(address addr) public {
        require(admins[msg.sender] == true, "Must be admin");
        require(ambulances[addr] == true, "Must be a transport");
        ambulances[addr] = false;
    }

    // returns true if address is an poice, false if not
    function isInitiator(address addr) public view returns (bool) {
        return initiators[addr];
    }

    // Allows the admin to add verified police stations
    function addInitiator(address addr) public {
        // verify account does not already have another role
        require(ambulances[addr] == false, "User already transport");
        require(initiators[addr] == false, "User already initiator");
        require(admins[addr] == false, "User already admin");

        // verify sender is an admin
        require(admins[msg.sender] == true, "Sender must be an admin");

        // if passes all requires add the address as police
        initiators[addr] = true;
    }

    // Allows the admin to remove verified police stations
    function removeInitiator(address addr) public {
        require(admins[msg.sender] == true, "Sender must be an admin");
        require(initiators[addr] != false, "Must be initator");
        initiators[addr] = false;
    }

    // returns true if address is a hospital, false if not
    function isHospital(address addr) public view returns (bool) {
        return hospitals[addr];
    }

    // Allows the admin to add verified hospitals
    function addHospital(address addr) public {
        // verify account does not already have another role
        require(hospitals[addr] == false, "Already facility");
        require(ambulances[addr] == false, "Already transport");
        require(admins[addr] == false, "Already admin");

        // verify the sender is an admin
        require(admins[msg.sender] == true, "Sender must be admin");

        // if passes all requires add account to hospitals
        hospitals[addr] = true;
    }

    // Allows the admin to remove verified hospitals
    function removeHospital(address addr) public {
        require(admins[msg.sender] == true, "Sender must be an admin");
        require(hospitals[addr] != false, "Not already a facility");
        hospitals[addr] = false;
    }

    // returns true if address is an admin, false if not
    function isAdmin(address addr) public view returns (bool) {
        return admins[addr];
    }

    // add a new admin
    function addAdmin(address addr) public {
        require(ambulances[addr] == false, "Already transport");
        require(hospitals[addr] == false, "Already facility");
        require(initiators[addr] == false, "Already initiator");
        require(admins[addr] == false, "Already an admin");
        require(addr != superAdmin, "superAdmin is already an admin");
        require(msg.sender == superAdmin, "Sender must be superAdmin");
        admins[addr] = true;
    }

    // remove an existing admin
    function removeAdmin(address addr) public {
        require(msg.sender == superAdmin, "Sender must be a superAdmin");
        require(admins[addr] == true, "Not an admin");
        require(addr != msg.sender, "Cannot remove yourself as admin");
        admins[addr] = false;
    }
}