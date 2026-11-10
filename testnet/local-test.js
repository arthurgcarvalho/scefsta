// Unit tests for the contracts on an in-memory chain (ganache), where time can
// be moved forward instantly. No network or funds needed:
//
//   node local-test.js
//
// Covers the auction rules that are slow to exercise on a live testnet:
// lowest revealed bid wins, single penalty deposit, deposit refunds, on-time
// vs. late delivery, reclaim after the due date, and the tender list.
const assert = require("assert");
const ganache = require("ganache");
const {
  BrowserProvider,
  ContractFactory,
  solidityPackedKeccak256,
  toBigInt,
} = require("ethers");
const { compile } = require("./compile");

const MAX_BID = 100000n;
const PENALTY = 500n;
const AUCTION = 100; // seconds
const REVEAL = 60; // REVEAL_PERIOD in Auctions.sol
const DELIVERY = 1000; // seconds after the reveal period
const STATUS = { Closed: 0n, InProgress: 1n, Open: 2n, Retracted: 3n, Reclaimed: 4n };

let provider, accounts, auctions, admin, hirer, hirer2, lowBidder, highBidder, thirdBidder, facility, outsider;
const gasUsed = {};

const hashOf = (bid, salt) => toBigInt(solidityPackedKeccak256(["uint256"], [bid + salt]));
const balance = (signer) => provider.getBalance(signer.address);
const escrow = async () => provider.getBalance(await auctions.getAddress());

async function advance(seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

async function send(txPromise, label) {
  const receipt = await (await txPromise).wait();
  if (label) (gasUsed[label] = gasUsed[label] || []).push(receipt.gasUsed);
  return receipt;
}

async function reverts(promise, reason) {
  try {
    await promise;
  } catch (error) {
    const message = `${error.reason || ""} ${error.shortMessage || ""} ${error.message || ""}`;
    assert.ok(message.includes(reason), `expected revert "${reason}", got: ${message.slice(0, 300)}`);
    return;
  }
  assert.fail(`expected revert "${reason}" but the call succeeded`);
}

async function postTender(poster = hirer, deliveryTime = DELIVERY) {
  const id = BigInt((await auctions.getAllTenders()).length);
  await send(
    auctions
      .connect(poster)
      .postTender(AUCTION, deliveryTime, "1 Example St", "Sampletown", "Nevada", "10001", PENALTY, "Low", [facility.address], { value: MAX_BID }),
    "postTender"
  );
  return id;
}

// places a sealed bid and returns what is needed to reveal it later
async function bid(id, bidder, amount, salt = 12345n) {
  await send(auctions.connect(bidder).secretBid(id, hashOf(amount, salt), { value: PENALTY }), "secretBid");
  const tender = (await auctions.getAllTenders())[Number(id)];
  const index = BigInt(tender.details.bidders.indexOf(bidder.address));
  return { id, bidder, amount, salt, index };
}

const reveal = (b) =>
  send(auctions.connect(b.bidder).revealBid(b.id, b.amount, b.salt, b.index), "revealBid");

const tenderOf = async (id) => (await auctions.getAllTenders())[Number(id)];

const tests = {
  "Accounts registers nobody but the deployer": async () => {
    const formerDefaults = [
      "0xcdF98E3f41A0160360884f67BF8FfF35D92d4E2f",
      "0x37b17D21569C2cA6c7A078f2283D06BC222F554C",
      "0x9f8d25e9e3261d328e1Bef34CdbadB9310E451Fc",
      "0xEE8fb1E70B2Cd462cC0eE0ABb12B36db6D0932B2",
      "0xC53762A6D1E4557Ab363eE38042828fcfBF064bE",
      "0xb153eDE174EDC76EA00D706ce678b3aF28379887",
    ];
    for (const address of formerDefaults) {
      for (const check of ["isAdmin", "isInitiator", "isAmbulance", "isHospital"]) {
        assert.equal(await accounts[check](address), false, `${address} ${check}`);
      }
    }
    assert.equal(await accounts.superAdmin(), admin.address);
    assert.equal(await accounts.isAdmin(admin.address), true);
  },

  "getAllTenders lists the bidders and their sealed bids": async () => {
    const id = await postTender();
    await bid(id, lowBidder, 60000n, 1n);
    await bid(id, highBidder, 80000n, 2n);
    const tender = await tenderOf(id);
    assert.deepEqual([...tender.details.bidders], [lowBidder.address, highBidder.address]);
    assert.deepEqual([...tender.details.bidHashArray], [hashOf(60000n, 1n), hashOf(80000n, 2n)]);
    assert.equal(await auctions.depositHeld(id, lowBidder.address), true);
  },

  "lowest bid wins when the higher bid is revealed first": async () => {
    const id = await postTender();
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    await advance(AUCTION + 1);
    await reveal(high);
    let tender = await tenderOf(id);
    assert.equal(tender.status, STATUS.InProgress);
    assert.equal(tender.details.tenderAccepter, highBidder.address);
    await reveal(low);
    tender = await tenderOf(id);
    assert.equal(tender.details.tenderAccepter, lowBidder.address);
    assert.equal(tender.details.finalBid, 60000n);
    await advance(REVEAL);
    assert.equal(await auctions.getAuctionWinner(id), lowBidder.address);
  },

  "lowest bid wins when the lower bid is revealed first": async () => {
    const id = await postTender();
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    await advance(AUCTION + 1);
    await reveal(low);
    await reveal(high);
    const tender = await tenderOf(id);
    assert.equal(tender.details.tenderAccepter, lowBidder.address);
    assert.equal(tender.details.finalBid, 60000n);
  },

  "equal bids: the first one revealed wins": async () => {
    const id = await postTender();
    const first = await bid(id, highBidder, 70000n, 7n);
    const second = await bid(id, lowBidder, 70000n, 9n);
    await advance(AUCTION + 1);
    await reveal(first);
    await reveal(second);
    assert.equal((await tenderOf(id)).details.tenderAccepter, highBidder.address);
  },

  "reveals are checked: timing, hash, bid owner, no second payment": async () => {
    const id = await postTender();
    const low = await bid(id, lowBidder, 60000n);
    await reverts(auctions.connect(lowBidder).revealBid.staticCall(id, low.amount, low.salt, low.index), "Tender under auction");
    await advance(AUCTION + 1);
    await reverts(auctions.connect(lowBidder).revealBid.staticCall(id, 50000n, low.salt, low.index), "Bid value != Hash Value");
    await reverts(auctions.connect(highBidder).revealBid.staticCall(id, low.amount, low.salt, low.index), "Wrong bid ID");
    // revealBid no longer takes a second penalty payment
    assert.equal(auctions.interface.getFunction("revealBid").payable, false);
    await advance(REVEAL);
    await reverts(auctions.connect(lowBidder).revealBid.staticCall(id, low.amount, low.salt, low.index), "Tender past reveal period");
  },

  "on-time delivery: winner is paid bid + deposit, loser withdraws, escrow empties": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    const none = await bid(id, thirdBidder, 90000n); // never reveals
    assert.equal((await escrow()) - before, MAX_BID + 3n * PENALTY);
    await advance(AUCTION + 1);
    await reveal(high);
    await reveal(low);

    // nobody can withdraw or verify while bids can still be revealed
    await reverts(auctions.connect(highBidder).withdrawDeposit.staticCall(id), "Reveal period is not over");
    await reverts(auctions.connect(facility).verifyDelivery.staticCall(id), "Tender is not past reveal date");
    await advance(REVEAL);
    await reverts(auctions.connect(lowBidder).withdrawDeposit.staticCall(id), "Winner's deposit is held until delivery");
    await reverts(auctions.connect(hirer2).reclaimTender.staticCall(id), "Delivery is not overdue");
    await reverts(auctions.connect(outsider).verifyDelivery.staticCall(id), "Sender must be hospital");

    const winnerBefore = await balance(lowBidder);
    const hirerBefore = await balance(hirer2);
    await send(auctions.connect(facility).verifyDelivery(id), "verifyDelivery");
    assert.equal((await balance(lowBidder)) - winnerBefore, 60000n + PENALTY, "winner: bid + deposit");
    assert.equal((await balance(hirer2)) - hirerBefore, MAX_BID - 60000n, "hirer: unspent escrow");
    assert.equal((await tenderOf(id)).status, STATUS.Closed);

    // losers (revealed or not) take their deposits back, once
    for (const loser of [high, none]) {
      await send(auctions.connect(loser.bidder).withdrawDeposit(id), "withdrawDeposit");
      await reverts(auctions.connect(loser.bidder).withdrawDeposit.staticCall(id), "No deposit to withdraw");
    }
    await reverts(auctions.connect(lowBidder).withdrawDeposit.staticCall(id), "No deposit to withdraw");
    assert.equal(await escrow(), before, "nothing from this tender is left in the contract");
  },

  "late delivery: winner is paid the bid, the deposit goes to the hirer": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    const low = await bid(id, lowBidder, 60000n);
    await advance(AUCTION + 1);
    await reveal(low);
    await advance(REVEAL + DELIVERY + 1);

    const winnerBefore = await balance(lowBidder);
    const hirerBefore = await balance(hirer2);
    await send(auctions.connect(facility).verifyDelivery(id), "verifyDelivery");
    assert.equal((await balance(lowBidder)) - winnerBefore, 60000n, "winner: bid only");
    assert.equal((await balance(hirer2)) - hirerBefore, MAX_BID - 60000n + PENALTY, "hirer: unspent escrow + penalty");
    assert.equal(await escrow(), before);
  },

  "reclaim: only after the due date; hirer gets escrow + the winner's deposit": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    await advance(AUCTION + 1);
    await reveal(low);
    await reveal(high);
    await advance(REVEAL);
    await reverts(auctions.connect(hirer2).reclaimTender.staticCall(id), "Delivery is not overdue");
    await advance(DELIVERY + 1);
    await reverts(auctions.connect(hirer).reclaimTender.staticCall(id), "Sender is not the tender poster");

    const hirerBefore = await balance(hirer2);
    const receipt = await send(auctions.connect(hirer2).reclaimTender(id), "reclaimTender");
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    assert.equal((await balance(hirer2)) - hirerBefore + gasCost, MAX_BID + PENALTY);
    assert.equal((await tenderOf(id)).status, STATUS.Reclaimed);

    await reverts(auctions.connect(lowBidder).withdrawDeposit.staticCall(id), "No deposit to withdraw");
    await send(auctions.connect(highBidder).withdrawDeposit(id), "withdrawDeposit");
    assert.equal(await escrow(), before);
  },

  "retracted tender: bidders withdraw at once, bidding stops": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    await bid(id, lowBidder, 60000n);
    const hirerBefore = await balance(hirer2);
    const receipt = await send(auctions.connect(hirer2).retractTender(id), "retractTender");
    assert.equal((await balance(hirer2)) - hirerBefore + receipt.gasUsed * receipt.gasPrice, MAX_BID);
    await reverts(auctions.connect(highBidder).secretBid.staticCall(id, 1n, { value: PENALTY }), "Tender not open");
    await send(auctions.connect(lowBidder).withdrawDeposit(id), "withdrawDeposit");
    assert.equal(await escrow(), before);
  },

  "no reveal at all: tender stays open, deposits are refundable, hirer retracts": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    await bid(id, lowBidder, 60000n);
    await advance(AUCTION + REVEAL + 1);
    assert.equal((await tenderOf(id)).status, STATUS.Open);
    await reverts(auctions.getAuctionWinner(id), "Tender is open");
    await send(auctions.connect(lowBidder).withdrawDeposit(id), "withdrawDeposit");
    await send(auctions.connect(hirer2).retractTender(id), "retractTender");
    assert.equal(await escrow(), before);
  },

  "bidding rules are unchanged": async () => {
    const id = await postTender();
    await bid(id, lowBidder, 60000n);
    await reverts(auctions.connect(lowBidder).secretBid.staticCall(id, 1n, { value: PENALTY }), "Can only bid once");
    await reverts(auctions.connect(highBidder).secretBid.staticCall(id, 1n, { value: PENALTY + 1n }), "Incorrect penalty amount");
    await reverts(auctions.connect(outsider).secretBid.staticCall(id, 1n, { value: PENALTY }), "Sender must be an ambulance");
    await advance(AUCTION + 1);
    await reverts(auctions.connect(highBidder).secretBid.staticCall(id, 1n, { value: PENALTY }), "Auction has passed");
  },
};

async function main() {
  provider = new BrowserProvider(
    ganache.provider({
      logging: { quiet: true },
      chain: { hardfork: "shanghai" },
      wallet: { totalAccounts: 9 },
    }),
    undefined,
    // ethers briefly caches identical requests; balances are read right before
    // and after a transaction here, so that cache must be off
    { cacheTimeout: -1 }
  );
  [admin, hirer, hirer2, lowBidder, highBidder, thirdBidder, facility, outsider] =
    await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((i) => provider.getSigner(i)));

  const artifacts = compile();
  accounts = await new ContractFactory(artifacts.Accounts.abi, artifacts.Accounts.bytecode, admin).deploy();
  await accounts.waitForDeployment();
  auctions = await new ContractFactory(artifacts.Auctions.abi, artifacts.Auctions.bytecode, admin).deploy(
    await accounts.getAddress()
  );
  const deployReceipt = await auctions.deploymentTransaction().wait();
  gasUsed["deploy Auctions"] = [deployReceipt.gasUsed];

  for (const signer of [hirer, hirer2]) await send(accounts.addInitiator(signer.address));
  for (const signer of [lowBidder, highBidder, thirdBidder]) await send(accounts.addAmbulance(signer.address));
  await send(accounts.addHospital(facility.address));

  let failed = 0;
  for (const [name, test] of Object.entries(tests)) {
    try {
      await test();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed++;
      console.log(`  ✗ ${name}\n      ${error.message}`);
    }
  }

  console.log("\nAverage gas (local chain):");
  for (const [label, values] of Object.entries(gasUsed)) {
    const average = values.reduce((sum, v) => sum + v, 0n) / BigInt(values.length);
    console.log(`  ${label.padEnd(16)} ${String(average).padStart(9)}`);
  }

  const total = Object.keys(tests).length;
  console.log(`\n${total - failed}/${total} tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
