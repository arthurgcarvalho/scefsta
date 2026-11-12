// Unit tests for the contracts on an in-memory chain (ganache), where time can
// be moved forward instantly. No network or funds needed:
//
//   node local-test.js
//
// Covers the auction rules that are slow to exercise on a live testnet: what a
// commitment binds, the commit / reveal / winner-determination deadlines,
// lowest bid wins whatever the order of the reveals, retraction only before
// the commit deadline, the record of failed reveals and the suspension it
// leads to, and the payouts (no deposit or penalty anywhere).
const assert = require("assert");
const ganache = require("ganache");
const { BrowserProvider, ContractFactory, ZeroAddress, ZeroHash } = require("ethers");
const { compile } = require("./compile");
const { commitmentOf, sealedBid } = require("./sealed-bid");

const MAX_BID = 100000n;
const AUCTION = 100; // seconds of bidding (Tc)
const REVEAL = 60; // seconds of reveal (Tr)
const DELIVERY = 1000; // seconds after the reveal period
const STATUS = { Closed: 0n, InProgress: 1n, Open: 2n, Retracted: 3n, Reclaimed: 4n, Unawarded: 5n };
const DAY = 24 * 60 * 60;
const DEFAULT_POLICY = [3n, BigInt(30 * DAY), BigInt(30 * DAY)];

let provider, accounts, auctions;
let admin, hirer, hirer2, lowBidder, highBidder, thirdBidder, facility, outsider;
let silentA, silentB, silentC, silentD, silentE; // providers used for failed reveals
const gasUsed = {};

const balance = (signer) => provider.getBalance(signer.address);
const escrow = async () => provider.getBalance(await auctions.getAddress());

async function advance(seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

// The next block gets exactly this timestamp (as long as it is mined within
// the same second, which the callers check on the receipt). The chain
// simulates calls and estimates gas at the time of the latest block, so a
// transaction meant for that exact second is sent with a fixed gas limit
// (AT_SET_TIME), which skips the estimate.
const setTime = (timestamp) => provider.send("evm_setTime", [Number(timestamp) * 1000]);
const AT_SET_TIME = { gasLimit: 500000 };
// mines an (empty) block stamped with this time, so calls are simulated at it
async function mineAt(timestamp) {
  await setTime(timestamp);
  await provider.send("evm_mine", []);
}
const blockTime = async (receipt) => BigInt((await provider.getBlock(receipt.blockNumber)).timestamp);

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

const eventsOf = (receipt, name) =>
  receipt.logs
    .map((log) => {
      try {
        return auctions.interface.parseLog(log);
      } catch (error) {
        return null;
      }
    })
    .filter((parsed) => parsed && parsed.name === name);

async function postTender(poster = hirer, deliveryTime = DELIVERY, revealTime = REVEAL) {
  const id = BigInt((await auctions.getAllTenders()).length);
  await send(
    auctions
      .connect(poster)
      .postTender(AUCTION, revealTime, deliveryTime, "1 Example St", "Sampletown", "Nevada", "10001", "Low", [facility.address], { value: MAX_BID }),
    "postTender"
  );
  return id;
}

const tenderOf = async (id) => (await auctions.getAllTenders())[Number(id)];

// places a sealed bid and returns what is needed to reveal it later
async function bid(id, bidder, amount) {
  const sealed = sealedBid(id, bidder.address, amount);
  await send(auctions.connect(bidder).secretBid(id, sealed.commitment), "secretBid");
  return { id, bidder, amount, nonce: sealed.nonce, commitment: sealed.commitment };
}

const reveal = (b, overrides = {}) =>
  send(auctions.connect(b.bidder).revealBid(b.id, b.amount, b.nonce, overrides), "revealBid");

// winner determination, by default triggered by someone with no role at all
const determine = (id, caller = outsider, overrides = {}) =>
  send(auctions.connect(caller).determineWinner(id, overrides), "determineWinner");

const failedReveals = async (signer) => (await auctions.getFailedReveals(signer.address)).length;

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

  "participation is public, bids are not: bidder list and commitments only": async () => {
    const id = await postTender();
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    const tender = await tenderOf(id);
    assert.deepEqual([...tender.details.bidders], [lowBidder.address, highBidder.address]);
    const stored = await auctions.bids(id, lowBidder.address);
    assert.equal(stored.commitment, low.commitment);
    assert.equal(stored.revealed, false);
    assert.equal(stored.amount, 0n);
    assert.notEqual(low.commitment, high.commitment);
    // nothing is paid to bid
    assert.equal(auctions.interface.getFunction("secretBid").payable, false);
    assert.equal(auctions.interface.getFunction("revealBid").payable, false);
  },

  "a commitment binds the tender, the bidder, the bid and the nonce": async () => {
    const id = await postTender();
    const other = await postTender();
    const low = await bid(id, lowBidder, 60000n);
    assert.equal(await auctions.commitmentOf(id, lowBidder.address, 60000n, low.nonce), low.commitment);
    // a competitor copies the commitment, on this tender and on another one
    await send(auctions.connect(highBidder).secretBid(id, low.commitment));
    await send(auctions.connect(lowBidder).secretBid(other, low.commitment));
    await advance(AUCTION);

    const attempt = (signer, tender, amount, nonce) =>
      auctions.connect(signer).revealBid.staticCall(tender, amount, nonce);
    // the bid cannot be changed by shifting value between bid and nonce
    await reverts(attempt(lowBidder, id, 59999n, low.nonce + 1n), "Bid value != Hash Value");
    await reverts(attempt(lowBidder, id, 59999n, low.nonce), "Bid value != Hash Value");
    await reverts(attempt(lowBidder, id, 60000n, low.nonce + 1n), "Bid value != Hash Value");
    // the copied commitment cannot be opened by the copier ...
    await reverts(attempt(highBidder, id, 60000n, low.nonce), "Bid value != Hash Value");
    // ... nor does the same commitment open on another tender
    await reverts(attempt(lowBidder, other, 60000n, low.nonce), "Bid value != Hash Value");
    // the right values do open it, once
    await reveal(low);
    await reverts(attempt(lowBidder, id, 60000n, low.nonce), "Bid already revealed");
    await reverts(attempt(thirdBidder, id, 60000n, low.nonce), "No bid to reveal");

    await advance(REVEAL);
    await determine(id);
    await determine(other);
    assert.equal(await auctions.getAuctionWinner(id), lowBidder.address);
    assert.equal((await tenderOf(other)).status, STATUS.Unawarded);
  },

  "deadlines go by block time: commit before tc, reveal in [tc, tr), winner from tr": async () => {
    const id = await postTender();
    const tender = await tenderOf(id);
    const tc = tender.details.auctionDate;
    const tr = tender.details.revealDate;
    assert.equal(tc, tender.details.postDate + BigInt(AUCTION));
    assert.equal(tr, tc + BigInt(REVEAL));
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    await reverts(auctions.connect(lowBidder).revealBid.staticCall(id, low.amount, low.nonce), "Tender under auction");

    // the last second of the bidding period still takes a commitment
    await setTime(tc - 1n);
    const late = sealedBid(id, thirdBidder.address, 70000n);
    let receipt = await send(auctions.connect(thirdBidder).secretBid(id, late.commitment, AT_SET_TIME));
    assert.equal(await blockTime(receipt), tc - 1n);

    // at tc bidding is over and revealing starts
    await setTime(tc);
    receipt = await reveal(low, AT_SET_TIME);
    assert.equal(await blockTime(receipt), tc, "reveal included in a block stamped exactly tc");
    await reverts(auctions.connect(silentA).secretBid.staticCall(id, late.commitment), "Auction has passed");
    await reverts(auctions.connect(outsider).determineWinner.staticCall(id), "Reveal period is not over");

    // the last second of the reveal period still takes a reveal
    await setTime(tr - 1n);
    receipt = await reveal(high, AT_SET_TIME);
    assert.equal(await blockTime(receipt), tr - 1n);
    assert.equal((await tenderOf(id)).status, STATUS.Open, "revealing does not pick a winner");
    assert.equal((await tenderOf(id)).details.tenderAccepter, ZeroAddress);

    // at tr revealing is over and the winner can be determined
    await setTime(tr);
    receipt = await determine(id, outsider, AT_SET_TIME);
    assert.equal(await blockTime(receipt), tr, "winner determined in a block stamped exactly tr");
    await reverts(
      auctions.connect(thirdBidder).revealBid.staticCall(id, 70000n, late.nonce),
      "Tender not open"
    );
    assert.equal(await auctions.getAuctionWinner(id), lowBidder.address);
    // the provider that committed but did not reveal in time is on record
    assert.equal(eventsOf(receipt, "RevealFailed")[0].args.bidder, thirdBidder.address);
  },

  "a reveal that reaches a block after tr is rejected": async () => {
    const id = await postTender();
    const low = await bid(id, silentE, 60000n);
    await advance(AUCTION + REVEAL);
    await reverts(
      auctions.connect(silentE).revealBid.staticCall(id, low.amount, low.nonce),
      "Tender past reveal period"
    );
    const before = await failedReveals(silentE);
    await determine(id);
    assert.equal((await failedReveals(silentE)) - before, 1);
  },

  "lowest bid wins whatever the order of the reveals, and whoever asks": async () => {
    for (const [order, caller] of [["high first", outsider], ["low first", highBidder]]) {
      const id = await postTender();
      const low = await bid(id, lowBidder, 60000n);
      const high = await bid(id, highBidder, 80000n);
      await advance(AUCTION);
      for (const b of order === "high first" ? [high, low] : [low, high]) await reveal(b);
      await reverts(auctions.getAuctionWinner(id), "Winner not determined");
      await advance(REVEAL);
      const receipt = await determine(id, caller);
      const tender = await tenderOf(id);
      assert.equal(tender.status, STATUS.InProgress, order);
      assert.equal(tender.details.tenderAccepter, lowBidder.address, order);
      assert.equal(tender.details.finalBid, 60000n, order);
      const [announced] = eventsOf(receipt, "WinnerDetermined");
      assert.equal(announced.args.winner, lowBidder.address);
      assert.equal(announced.args.winningBid, 60000n);
      // both revealed bids are public now
      assert.equal((await auctions.bids(id, highBidder.address)).amount, 80000n);
      assert.equal(eventsOf(receipt, "RevealFailed").length, 0);
      await reverts(auctions.connect(caller).determineWinner.staticCall(id), "Tender not open");
    }
  },

  "equal bids: the earlier commitment wins, whatever the order of the reveals": async () => {
    for (const revealFirst of ["first committer", "second committer"]) {
      const id = await postTender();
      const first = await bid(id, highBidder, 70000n);
      const second = await bid(id, lowBidder, 70000n);
      await advance(AUCTION);
      for (const b of revealFirst === "first committer" ? [first, second] : [second, first]) await reveal(b);
      await advance(REVEAL);
      await determine(id);
      assert.equal((await tenderOf(id)).details.tenderAccepter, highBidder.address, revealFirst);
    }
  },

  "bidding rules: registered providers, one commitment per address": async () => {
    const id = await postTender();
    const low = await bid(id, lowBidder, 60000n);
    const again = sealedBid(id, lowBidder.address, 50000n).commitment;
    await reverts(auctions.connect(lowBidder).secretBid.staticCall(id, again), "Can only bid once");
    await reverts(auctions.connect(outsider).secretBid.staticCall(id, again), "Sender must be an ambulance");
    await reverts(auctions.connect(highBidder).secretBid.staticCall(id, ZeroHash), "Empty commitment");
    await advance(AUCTION);
    await reverts(auctions.connect(highBidder).secretBid.staticCall(id, again), "Auction has passed");
    // a bid at or above the maximum cannot be revealed
    await reveal(low);
    await advance(REVEAL);
    await determine(id);

    const over = await postTender();
    const tooHigh = await bid(over, silentB, MAX_BID);
    await advance(AUCTION);
    await reverts(
      auctions.connect(silentB).revealBid.staticCall(over, tooHigh.amount, tooHigh.nonce),
      "Bid was not below max bid amount"
    );
    await advance(REVEAL);
    await determine(over);
    assert.equal((await tenderOf(over)).status, STATUS.Unawarded);
  },

  "retraction: only by the hirer and only before the commit deadline": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    await bid(id, lowBidder, 60000n);
    await reverts(auctions.connect(hirer).retractTender.staticCall(id), "Sender is not the tender poster");
    const hirerBefore = await balance(hirer2);
    const receipt = await send(auctions.connect(hirer2).retractTender(id), "retractTender");
    assert.equal((await balance(hirer2)) - hirerBefore + receipt.gasUsed * receipt.gasPrice, MAX_BID);
    assert.equal((await tenderOf(id)).status, STATUS.Retracted);
    await reverts(
      auctions.connect(highBidder).secretBid.staticCall(id, sealedBid(id, highBidder.address, 1n).commitment),
      "Tender not open"
    );
    assert.equal(await escrow(), before);
    // a retracted tender leaves no failed reveal behind
    const failures = await failedReveals(lowBidder);
    await advance(AUCTION + REVEAL);
    await reverts(auctions.connect(outsider).determineWinner.staticCall(id), "Tender not open");
    assert.equal(await failedReveals(lowBidder), failures);

    // once bids can be revealed the hirer can no longer back out
    const second = await postTender(hirer2);
    const low = await bid(second, lowBidder, 60000n);
    await mineAt((await tenderOf(second)).details.auctionDate);
    await reverts(auctions.connect(hirer2).retractTender.staticCall(second), "Bidding period is over");
    await reveal(low);
    await reverts(auctions.connect(hirer2).retractTender.staticCall(second), "Bidding period is over");
    await advance(REVEAL);
    await reverts(auctions.connect(hirer2).retractTender.staticCall(second), "Bidding period is over");
    await determine(second);
    await reverts(auctions.connect(hirer2).retractTender.staticCall(second), "Tender not open");
  },

  "no valid reveal: tender is unawarded and the hirer is refunded by whoever asks": async () => {
    const before = await escrow();
    const empty = await postTender(hirer2);
    const id = await postTender(hirer2);
    await bid(id, silentA, 60000n);
    await advance(AUCTION + REVEAL);
    assert.equal((await tenderOf(id)).status, STATUS.Open);

    const failures = await failedReveals(silentA);
    const hirerBefore = await balance(hirer2);
    const receipt = await determine(id);
    assert.equal((await balance(hirer2)) - hirerBefore, MAX_BID);
    const tender = await tenderOf(id);
    assert.equal(tender.status, STATUS.Unawarded);
    assert.equal(tender.details.tenderAccepter, ZeroAddress);
    assert.equal(eventsOf(receipt, "WinnerDetermined")[0].args.winner, ZeroAddress);
    assert.equal((await failedReveals(silentA)) - failures, 1);
    await reverts(auctions.connect(facility).verifyDelivery.staticCall(id), "Tender not in progress");

    // the same holds for a tender nobody bid on
    await determine(empty);
    assert.equal((await tenderOf(empty)).status, STATUS.Unawarded);
    assert.equal(await escrow(), before);
  },

  "failed reveals are recorded per provider and are public": async () => {
    const id = await postTender();
    const low = await bid(id, lowBidder, 60000n);
    await bid(id, silentB, 50000n); // would have won, never reveals
    await advance(AUCTION);
    await reveal(low);
    await advance(REVEAL);
    const [lowBefore, silentBefore] = [await failedReveals(lowBidder), await failedReveals(silentB)];
    const receipt = await determine(id);
    assert.equal(await auctions.getAuctionWinner(id), lowBidder.address, "an unrevealed bid cannot win");
    const failed = eventsOf(receipt, "RevealFailed");
    assert.equal(failed.length, 1);
    assert.equal(failed[0].args.bidder, silentB.address);
    assert.equal(failed[0].args.tenderId, id);
    // anyone can read the record
    const record = await auctions.connect(outsider).getFailedReveals(silentB.address);
    assert.equal(record.length, silentBefore + 1);
    assert.equal(record[record.length - 1], await blockTime(receipt));
    assert.equal(await failedReveals(lowBidder), lowBefore);
  },

  "suspension: the limit within the window blocks bidding until the period ends": async () => {
    await reverts(auctions.connect(hirer).setRevealPolicy.staticCall(1, 1, 1), "Sender must be admin");
    await reverts(auctions.connect(admin).setRevealPolicy.staticCall(0, 1, 1), "Limit must be positive");
    assert.deepEqual(
      [await auctions.failedRevealLimit(), await auctions.failedRevealWindow(), await auctions.suspensionPeriod()],
      DEFAULT_POLICY
    );
    // 2 failed reveals within 10000 s -> suspended for 500 s
    await send(auctions.connect(admin).setRevealPolicy(2, 10000, 500), "setRevealPolicy");

    const failOnce = async (signer) => {
      const id = await postTender();
      await bid(id, signer, 60000n);
      await advance(AUCTION + REVEAL);
      return determine(id);
    };
    assert.equal(await failedReveals(silentC), 0);
    let receipt = await failOnce(silentC);
    assert.equal(eventsOf(receipt, "BidderSuspended").length, 0, "one failure is within the allowance");
    assert.equal(await auctions.isSuspended(silentC.address), false);

    receipt = await failOnce(silentC);
    const [suspended] = eventsOf(receipt, "BidderSuspended");
    assert.equal(suspended.args.bidder, silentC.address);
    assert.equal(suspended.args.until, (await blockTime(receipt)) + 500n);
    assert.equal(await auctions.suspendedUntil(silentC.address), suspended.args.until);
    assert.equal(await auctions.isSuspended(silentC.address), true);

    // the commit function turns the suspended address away; others still bid
    const id = await postTender();
    const commitment = sealedBid(id, silentC.address, 60000n).commitment;
    await reverts(auctions.connect(silentC).secretBid.staticCall(id, commitment), "Bidder is suspended");
    await bid(id, lowBidder, 60000n);
    await mineAt(suspended.args.until - 1n);
    await reverts(auctions.connect(silentC).secretBid.staticCall(id, commitment), "Bidder is suspended");

    // when the period is over the provider can bid again
    const later = await postTender();
    await setTime(suspended.args.until);
    receipt = await send(
      auctions.connect(silentC).secretBid(later, sealedBid(later, silentC.address, 60000n).commitment, AT_SET_TIME)
    );
    assert.equal(await blockTime(receipt), suspended.args.until);
    assert.equal(await auctions.isSuspended(silentC.address), false);
    await send(auctions.connect(admin).setRevealPolicy(...DEFAULT_POLICY));
  },

  "suspension: failed reveals outside the rolling window do not count": async () => {
    // 2 failed reveals within 150 s; one auction alone takes 160 s
    await send(auctions.connect(admin).setRevealPolicy(2, 150, 500));
    for (let round = 0; round < 3; round++) {
      const id = await postTender();
      await bid(id, silentD, 60000n);
      await advance(AUCTION + REVEAL);
      const receipt = await determine(id);
      assert.equal(eventsOf(receipt, "BidderSuspended").length, 0);
    }
    assert.equal(await failedReveals(silentD), 3);
    assert.equal(await auctions.isSuspended(silentD.address), false);

    // the same three failures do count under a wider window, from the next one on
    await send(auctions.connect(admin).setRevealPolicy(4, 10000, 500));
    const id = await postTender();
    await bid(id, silentD, 60000n);
    await advance(AUCTION + REVEAL);
    const receipt = await determine(id);
    assert.equal(eventsOf(receipt, "BidderSuspended").length, 1);
    await send(auctions.connect(admin).setRevealPolicy(...DEFAULT_POLICY));
  },

  "delivery: winner is paid its bid, the hirer gets the rest, nothing else moves": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    assert.equal((await escrow()) - before, MAX_BID, "bidders deposit nothing");
    await advance(AUCTION);
    await reveal(high);
    await reveal(low);
    await reverts(auctions.connect(facility).verifyDelivery.staticCall(id), "Tender not in progress");
    await advance(REVEAL);
    await reverts(auctions.connect(facility).verifyDelivery.staticCall(id), "Tender not in progress");
    await determine(id);
    await reverts(auctions.connect(hirer2).reclaimTender.staticCall(id), "Delivery is not overdue");
    await reverts(auctions.connect(outsider).verifyDelivery.staticCall(id), "Sender must be hospital");

    const [winnerBefore, loserBefore, hirerBefore] = [
      await balance(lowBidder),
      await balance(highBidder),
      await balance(hirer2),
    ];
    assert.equal((await tenderOf(id)).details.deliveryDate, 0n, "no delivery time before the confirmation");
    const receipt = await send(auctions.connect(facility).verifyDelivery(id), "verifyDelivery");
    assert.equal((await balance(lowBidder)) - winnerBefore, 60000n, "winner: its bid");
    assert.equal((await balance(hirer2)) - hirerBefore, MAX_BID - 60000n, "hirer: unspent escrow");
    assert.equal(await balance(highBidder), loserBefore);
    assert.equal(await escrow(), before, "nothing from this tender is left in the contract");

    // the confirmation time is recorded next to the scheduled time
    const delivered = await tenderOf(id);
    assert.equal(delivered.status, STATUS.Closed);
    assert.equal(delivered.details.deliveryDate, await blockTime(receipt));
    assert.ok(delivered.details.deliveryDate <= delivered.details.dueDate, "on time");
    const [announced] = eventsOf(receipt, "DeliveryVerified");
    assert.equal(announced.args.tenderId, id);
    assert.equal(announced.args.provider, lowBidder.address);
    assert.equal(announced.args.deliveryDate, delivered.details.deliveryDate);
    assert.equal(announced.args.dueDate, delivered.details.dueDate);
    await reverts(auctions.connect(facility).verifyDelivery.staticCall(id), "Tender not in progress");
  },

  "late delivery is still paid in full if the hirer has not reclaimed, and is recorded as late": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    const low = await bid(id, lowBidder, 60000n);
    await advance(AUCTION);
    await reveal(low);
    await advance(REVEAL);
    await determine(id);
    await advance(DELIVERY + 1);

    const winnerBefore = await balance(lowBidder);
    const hirerBefore = await balance(hirer2);
    const receipt = await send(auctions.connect(facility).verifyDelivery(id), "verifyDelivery");
    assert.equal((await balance(lowBidder)) - winnerBefore, 60000n);
    assert.equal((await balance(hirer2)) - hirerBefore, MAX_BID - 60000n);
    assert.equal(await escrow(), before);

    // the tender shows the confirmation time, after the scheduled time
    const delivered = await tenderOf(id);
    assert.equal(delivered.status, STATUS.Closed);
    assert.equal(delivered.details.tenderAccepter, lowBidder.address);
    assert.equal(delivered.details.deliveryDate, await blockTime(receipt));
    assert.ok(delivered.details.deliveryDate > delivered.details.dueDate, "late");
    const [announced] = eventsOf(receipt, "DeliveryVerified");
    assert.ok(announced.args.deliveryDate > announced.args.dueDate, "the event shows the delay too");

    // once delivered, the hirer cannot reclaim
    await reverts(auctions.connect(hirer2).reclaimTender.staticCall(id), "Tender not in progress");
  },

  "reclaim: only after the due date; the hirer gets the escrow back": async () => {
    const before = await escrow();
    const id = await postTender(hirer2);
    const low = await bid(id, lowBidder, 60000n);
    const high = await bid(id, highBidder, 80000n);
    await advance(AUCTION);
    await reveal(low);
    await reveal(high);
    await advance(REVEAL);
    await reverts(auctions.connect(hirer2).reclaimTender.staticCall(id), "Tender not in progress");
    await determine(id);
    await reverts(auctions.connect(hirer2).reclaimTender.staticCall(id), "Delivery is not overdue");
    await advance(DELIVERY + 1);
    await reverts(auctions.connect(hirer).reclaimTender.staticCall(id), "Sender is not the tender poster");

    const hirerBefore = await balance(hirer2);
    const receipt = await send(auctions.connect(hirer2).reclaimTender(id), "reclaimTender");
    assert.equal((await balance(hirer2)) - hirerBefore + receipt.gasUsed * receipt.gasPrice, MAX_BID);
    await reverts(auctions.connect(facility).verifyDelivery.staticCall(id), "Tender not in progress");
    assert.equal(await escrow(), before);

    // the missed delivery stays on the public record: the tender is listed as
    // reclaimed, with the provider that won it and no delivery time
    const missed = await tenderOf(id);
    assert.equal(missed.status, STATUS.Reclaimed);
    assert.equal(missed.details.tenderAccepter, lowBidder.address);
    assert.equal(missed.details.deliveryDate, 0n);
  },

  "winner determination with ten bidders (gas)": async () => {
    const id = await postTender();
    const many = [lowBidder, highBidder, thirdBidder, ...extraBidders];
    const placed = [];
    for (const [i, signer] of many.entries()) placed.push(await bid(id, signer, 50000n + BigInt(i)));
    await advance(AUCTION);
    for (const b of placed.reverse()) await reveal(b);
    await advance(REVEAL);
    const receipt = await send(auctions.connect(outsider).determineWinner(id), "determineWinner (10 bids)");
    assert.equal(eventsOf(receipt, "WinnerDetermined")[0].args.winner, lowBidder.address);
  },
};

let extraBidders = [];

async function main() {
  provider = new BrowserProvider(
    ganache.provider({
      logging: { quiet: true },
      chain: { hardfork: "shanghai" },
      wallet: { totalAccounts: 20 },
    }),
    undefined,
    // ethers briefly caches identical requests; balances are read right before
    // and after a transaction here, so that cache must be off
    { cacheTimeout: -1 }
  );
  const signers = await Promise.all(Array.from({ length: 20 }, (_, i) => provider.getSigner(i)));
  [admin, hirer, hirer2, lowBidder, highBidder, thirdBidder, facility, outsider] = signers;
  [silentA, silentB, silentC, silentD, silentE] = signers.slice(8, 13);
  extraBidders = signers.slice(13, 20);

  const artifacts = compile();
  accounts = await new ContractFactory(artifacts.Accounts.abi, artifacts.Accounts.bytecode, admin).deploy();
  await accounts.waitForDeployment();
  auctions = await new ContractFactory(artifacts.Auctions.abi, artifacts.Auctions.bytecode, admin).deploy(
    await accounts.getAddress()
  );
  const deployReceipt = await auctions.deploymentTransaction().wait();
  gasUsed["deploy Auctions"] = [deployReceipt.gasUsed];

  for (const signer of [hirer, hirer2]) await send(accounts.addInitiator(signer.address));
  const providers = [lowBidder, highBidder, thirdBidder, silentA, silentB, silentC, silentD, silentE, ...extraBidders];
  for (const signer of providers) await send(accounts.addAmbulance(signer.address));
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
    console.log(`  ${label.padEnd(26)} ${String(average).padStart(9)}  (${values.length} call${values.length > 1 ? "s" : ""})`);
  }

  const total = Object.keys(tests).length;
  console.log(`\n${total - failed}/${total} tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
