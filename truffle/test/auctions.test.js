const Accounts = artifacts.require("Accounts");
const Auctions = artifacts.require("Auctions");
sha3_256 = require('js-sha3').sha3_256;
const Web3 = require('web3');
const web3 = new Web3();
const BigNumber = require('bignumber.js');

contract("Auctions", (accounts) => {
    let accountsInstance;
    let auctionsInstance;

    before(async () => {
        accountsInstance = await Accounts.new();
        auctionsInstance = await Auctions.new(accountsInstance.address);
        // add accounts to be used
        await accountsInstance.addAdmin(accounts[1], {from: accounts[0]});
        await accountsInstance.addInitiator(accounts[2], {from: accounts[1]});
        await accountsInstance.addHospital(accounts[3], {from: accounts[1]});
        await accountsInstance.addAmbulance(accounts[4], {from: accounts[1]});
        await accountsInstance.addAmbulance(accounts[5], {from: accounts[1]});
    });

    // postTender(timeLimit, revealTime, deliveryTime, addr, city, state, zipcode, severity, allowedHospitals)
    it("tests postTender", async () => {
        // .call only simulates the transaction and returns the ID the tender would get
        let tenderId = await auctionsInstance.postTender.call(10, 60, 60, "6729 old stagecoach road", "frazeysburg", "ohio", "43822", "critical", [accounts[3]], {from: accounts[2], value: 10000});
        assert.equal(parseInt(tenderId), 0, "Tender ID's must match");
        console.log(tenderId);
        await auctionsInstance.postTender(10, 60, 60, "6729 old stagecoach road", "frazeysburg", "ohio", "43822", "critical", [accounts[3]], {from: accounts[2], value: 10000});
        tenderId = await auctionsInstance.postTender.call(10, 60, 60, "6729 old stagecoach road", "frazeysburg", "ohio", "43822", "critical", [accounts[3]], {from: accounts[2], value: 10000});
        assert.equal(parseInt(tenderId), 1, "Tender ID's must match");
        console.log(tenderId);
    });

    it("tests secretBid", async () => {
        let tenderId = await auctionsInstance.postTender.call(100, 60, 60, "6729 old stagecoach road", "frazeysburg", "ohio", "43822", "critical", [accounts[3]], {from: accounts[2], value: 10000});
        await auctionsInstance.postTender(100, 60, 60, "6729 old stagecoach road", "frazeysburg", "ohio", "43822", "critical", [accounts[3]], {from: accounts[2], value: 10000});
        // the commitment binds the tender, the bidder, the bid (100) and a secret nonce (10)
        let hash = web3.utils.keccak256(web3.eth.abi.encodeParameters(["uint256", "address", "uint256", "uint256"], [tenderId.toString(), accounts[4], 100, 10]));
        assert.equal(await auctionsInstance.commitmentOf(tenderId, accounts[4], 100, 10), hash, "Commitments must match");
        // no deposit is sent with a bid
        let bidId = await auctionsInstance.secretBid.call(web3.utils.toBN(tenderId), hash, {from: accounts[4]});
        assert.equal(parseInt(bidId), 0, "Bid ID's must match");
    });

    it("tests revealBid", async () => {

    });

    it("tests verifyDelivery", async () => {

    });

    it("tests getAllTenders", async () => {

    });

    it("tests getTender", async () => {
        
    });

    it("tests getAuctionWinner", async () => {

    });

    it("tests retractTender", async () => {

    });

    it("tests reclaimTender", async () => {

    });
});