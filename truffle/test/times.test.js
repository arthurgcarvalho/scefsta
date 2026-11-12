const Accounts = artifacts.require("Accounts");
const Auctions = artifacts.require("Auctions");
sha3_256 = require("js-sha3").sha3_256;
const Web3 = require("web3");
const web3 = new Web3();
const {
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");

// the commitment that seals a bid (same value as Auctions.commitmentOf)
const commitmentOf = (tenderId, bidder, bidVal, nonce) =>
  web3.utils.keccak256(
    web3.eth.abi.encodeParameters(
      ["uint256", "address", "uint256", "uint256"],
      [tenderId, bidder, bidVal, nonce]
    )
  );

contract("Accounts", (accounts) => {
  it("gets API latency times of Accounts API functions", async () => {
    const accountsInstance = await Accounts.deployed();
    const fs = require("fs");
    let accountsStr =
      "addAdmin, addAmbulance, addInitiator, addHospital, isAdmin, isAmbulance, isInitiator, isHosptial, removeAmbulance, removeInitiator, removeHospital, removeAdmin\n";

    for (let i = 0; i < 20; i++) {
      // get times for admin functions
      let addAdminStart = Date.now().toString();
      await accountsInstance.addAdmin(accounts[4]);
      let addAdminEnd = Date.now().toString();
      let addAdminTime = (addAdminEnd - addAdminStart).toString();
      accountsStr += addAdminTime + ",";

      let addAmbStart = Date.now().toString();
      await accountsInstance.addAmbulance(accounts[1], { from: accounts[4] });
      let addAmbEnd = Date.now().toString();
      let addAmbTime = (addAmbEnd - addAmbStart).toString();
      accountsStr += addAmbTime + ",";

      let addPolStart = Date.now().toString();
      await accountsInstance.addInitiator(accounts[2], { from: accounts[4] });
      let addPolEnd = Date.now().toString();
      let addPolTime = (addPolEnd - addPolStart).toString();
      accountsStr += addPolTime + ",";

      let addHospStart = Date.now().toString();
      await accountsInstance.addHospital(accounts[3], { from: accounts[4] });
      let addHospEnd = Date.now().toString();
      let addHospTime = (addHospEnd - addHospStart).toString();
      accountsStr += addHospTime + ",";

      let isAdminStart = Date.now().toString();
      await accountsInstance.isAdmin(accounts[0]);
      let isAdminEnd = Date.now().toString();
      let isAdminTime = (isAdminEnd - isAdminStart).toString();
      accountsStr += isAdminTime + ",";

      let isAmbStart = Date.now().toString();
      await accountsInstance.isAmbulance(accounts[0]);
      let isAmbEnd = Date.now().toString();
      let isAmbTime = (isAmbEnd - isAmbStart).toString();
      accountsStr += isAmbTime + ",";

      let isPolStart = Date.now().toString();
      await accountsInstance.isInitiator(accounts[0]);
      let isPolEnd = Date.now().toString();
      let isPolTime = (isPolEnd - isPolStart).toString();
      accountsStr += isPolTime + ",";

      let isHospStart = Date.now().toString();
      await accountsInstance.isHospital(accounts[0]);
      let isHospEnd = Date.now().toString();
      let isHospTime = (isHospEnd - isHospStart).toString();
      accountsStr += isHospTime + ",";

      // get remove function times
      let removeAmbStart = Date.now().toString();
      await accountsInstance.removeAmbulance(accounts[1], {
        from: accounts[4],
      });
      let removeAmbEnd = Date.now().toString();
      let removeAmbTime = (removeAmbEnd - removeAmbStart).toString();
      accountsStr += removeAmbTime + ",";

      let removePolStart = Date.now().toString();
      await accountsInstance.removeInitiator(accounts[2], {
        from: accounts[4],
      });
      let removePolEnd = Date.now().toString();
      let removePolTime = (removePolEnd - removePolStart).toString();
      accountsStr += removePolTime + ",";

      let removeHospStart = Date.now().toString();
      await accountsInstance.removeHospital(accounts[3], { from: accounts[4] });
      let removeHospEnd = Date.now().toString();
      let removeHospTime = (removeHospEnd - removeHospStart).toString();
      accountsStr += removeHospTime + ",";

      let removeAdminStart = Date.now().toString();
      await accountsInstance.removeAdmin(accounts[4], { from: accounts[0] });
      let removeAdminEnd = Date.now().toString();
      let removeAdminTime = (removeAdminEnd - removeAdminStart).toString();
      accountsStr += removeAdminTime + "\n";
    }
    fs.writeFile("../plots/box/account_times.csv", accountsStr, (err) => {
      if (err) throw err;
    });
  });
});

contract("Auctions", async (accounts) => {
  it("gets API latency times of Auctions API functions", async () => {
    const accountsInstance = await Accounts.deployed();
    const auctionsInstance = await Auctions.deployed();
    const fs = require("fs");

    let auctionStr =
      "postTender, secretBid, revealBid, determineWinner, getAuctionWinner, verifyDelivery, reclaimTender, retractTender, getAllTenders\n";

    // add accounts to be used
    await accountsInstance.addAdmin(accounts[1], { from: accounts[0] });
    await accountsInstance.addInitiator(accounts[2], { from: accounts[1] });
    await accountsInstance.addHospital(accounts[3], { from: accounts[1] });
    await accountsInstance.addAmbulance(accounts[4], { from: accounts[1] });
    await accountsInstance.addAmbulance(accounts[5], { from: accounts[1] });

    // test auction functions
    for (let i = 0; i < 30; i += 3) {
      let postStart = Date.now();
      let tenderId = await auctionsInstance.postTender(
        30,
        60,
        60,
        "6729 old stagecoach road",
        "frazeysburg",
        "ohio",
        "43822",
        "critical",
        [accounts[3]],
        { from: accounts[2], value: 10000 }
      );

      let postTime = (Date.now() - postStart).toString();
      auctionStr += postTime + ",";

      /* RETRACT TENDER HERE */
      // let retractStart = Date.now();
      // await auctionsInstance.retractTender.call(0, { from: accounts[2] });
      // let retractTime = (Date.now() - retractStart).toString();
      // auctionStr += retractTime + ",";

      let hash = commitmentOf(i, accounts[4], 100, 10);
      let bidStart = Date.now();
      await auctionsInstance.secretBid.call(web3.utils.toBN(i), hash, {
        from: accounts[4],
      });
      let bidTime = (Date.now() - bidStart).toString();
      auctionStr += bidTime + ",";

      // the call above only simulates the bid: place it, so it can be revealed
      await auctionsInstance.secretBid(web3.utils.toBN(i), hash, {
        from: accounts[4],
      });

      await time.increase(time.duration.minutes(1));

      let revStart = Date.now();
      await auctionsInstance.revealBid(web3.utils.toBN(i), 100, 10, {
        from: accounts[4],
      });

      let revTime = (Date.now() - revStart).toString();
      auctionStr += revTime + ",";

      await time.increase(time.duration.minutes(5)); // past the reveal period

      // anyone may trigger winner determination once the reveal period is over
      let determineStart = Date.now();
      await auctionsInstance.determineWinner(web3.utils.toBN(i), {
        from: accounts[5],
      });
      let determineTime = (Date.now() - determineStart).toString();
      auctionStr += determineTime + ",";

      let getWinnerStart = Date.now();
      await auctionsInstance.getAuctionWinner(web3.utils.toBN(i));
      let getWinnerTime = (Date.now() - getWinnerStart).toString();
      auctionStr += getWinnerTime + ",";

      let verStart = Date.now();
      await auctionsInstance.verifyDelivery.call(0, { from: accounts[3] });
      let verTime = (Date.now() - verStart).toString();
      auctionStr += verTime + ",";

      // now repeat for reclaim tender
      await auctionsInstance.postTender(
        30,
        60,
        60,
        "6729 old stagecoach road",
        "frazeysburg",
        "ohio",
        "43822",
        "critical",
        [accounts[3]],
        { from: accounts[2], value: 10000 }
      );

      await auctionsInstance.secretBid(
        web3.utils.toBN(i + 1),
        commitmentOf(i + 1, accounts[4], 100, 10),
        { from: accounts[4] }
      );

      await time.increase(time.duration.minutes(1));

      await auctionsInstance.revealBid(web3.utils.toBN(i + 1), 100, 10, {
        from: accounts[4],
      });

      // a tender can be reclaimed once it has a winner and its delivery is overdue
      await time.increase(time.duration.minutes(5));
      await auctionsInstance.determineWinner(web3.utils.toBN(i + 1), {
        from: accounts[5],
      });

      let reclaimStart = Date.now();
      await auctionsInstance.reclaimTender.call(i + 1, { from: accounts[2] });
      let reclaimTime = (Date.now() - reclaimStart).toString();
      auctionStr += reclaimTime + ",";

      // now repeat for retract tender
      await auctionsInstance.postTender(
        30,
        60,
        60,
        "6729 old stagecoach road",
        "frazeysburg",
        "ohio",
        "43822",
        "critical",
        [accounts[3]],
        { from: accounts[2], value: 10000 }
      );

      /* RETRACT TENDER HERE */
      let retractStart = Date.now();
      await auctionsInstance.retractTender.call(i + 2, { from: accounts[2] });
      let retractTime = (Date.now() - retractStart).toString();
      auctionStr += retractTime + ",";

      let getAllStart = Date.now();
      let tenders = await auctionsInstance.getAllTenders();
      let getAllTime = (Date.now() - getAllStart).toString();
      auctionStr += getAllTime + "\n";
    }

    fs.writeFile("../plots/box/auction_times.csv", auctionStr, (err) => {
      if (err) throw err;
    });
  });
});

// function timeout(ms) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }
