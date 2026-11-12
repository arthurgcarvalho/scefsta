// End-to-end check of the deployed contracts on a live testnet, driving every
// role from the paper with the accounts in accounts.json:
//
//   node e2e.js <sepolia|amoy|fuji>
//
// The superAdmin registers the role accounts (if needed) and, for the length
// of the run, sets a strict reveal policy (one failed reveal suspends, for a
// minute or less). The initiator posts tenders; both transport providers place
// sealed bids (nothing is deposited); then
//   tender A  both reveal -> a bystander triggers winner determination, the
//             lowest bid wins, delivered on time -> winner paid its bid
//   tender B  one bidder never reveals -> the failed reveal is recorded and
//             the provider is suspended from bidding; the job is never
//             delivered -> the initiator reclaims the escrow after the due date
//   tender C  retracted during the bidding period
//   tender D  delivered late -> winner still paid its bid
//   tender E  nobody bids -> closed as unawarded, the initiator is refunded
// It checks the deadlines, every payout and that the contract ends up holding
// nothing from the run, restores the reveal policy, and prints the gas used
// per call (compare Table 6 of the paper).
const {
  JsonRpcProvider,
  Wallet,
  Contract,
  NonceManager,
  ZeroAddress,
  parseEther,
  formatEther,
} = require("ethers");
const fs = require("fs");
const path = require("path");
const { getNetwork } = require("./networks");
const { loadAccounts } = require("./accounts");
const { compile } = require("./compile");
const { syncDatabase } = require("./sync-db");
const { sealedBid } = require("./sealed-bid");
const { randomAddress, randomSeverity } = require("./sample-data");

const MAX_BID = 100000n; // wei placed in escrow by the hirer
const LOW_BID = 60000n;
const HIGH_BID = 80000n;
const SHORT_DELIVERY = 30; // seconds; tenders B and D become overdue quickly
const STATUS = ["Closed", "InProgress", "Open", "Retracted", "Reclaimed", "Unawarded"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => Math.floor(Date.now() / 1000);
const gasReport = [];
let provider;

async function waitUntil(timestamp, label) {
  const seconds = timestamp - now();
  if (seconds > 0) {
    console.log(`  … waiting ${seconds}s for ${label}`);
    await sleep(seconds * 1000);
  }
  // the contract goes by block time, so also wait for the chain to get there
  for (let i = 0; i < 20; i++) {
    const block = await provider.getBlock("latest");
    if (block.timestamp > timestamp) return;
    await sleep(3000);
  }
}

// Sends a transaction and records its gas. Time-gated calls can be rejected
// during gas estimation while the node's latest block is still older than the
// deadline, so those may be retried for a short while.
async function send(label, contract, method, args = [], overrides = {}, retrySeconds = 0) {
  const deadline = Date.now() + retrySeconds * 1000;
  for (;;) {
    try {
      const tx = await contract[method](...args, overrides);
      const receipt = await tx.wait();
      gasReport.push({ method, gasUsed: receipt.gasUsed, fee: receipt.fee });
      console.log(`  ✓ ${label} (${method}, gas ${receipt.gasUsed}, tx ${tx.hash})`);
      return receipt;
    } catch (error) {
      // a failed attempt must not leave a gap in the locally tracked nonce
      if (contract.runner && contract.runner.reset) contract.runner.reset();
      if (Date.now() >= deadline) throw error;
      await sleep(3000);
    }
  }
}

// `call` is a function so the check can be repeated: a public RPC endpoint is
// several nodes, and one that has not yet seen the latest block answers from
// the previous state for a moment.
async function expectRevert(label, call, reason) {
  let message = "the call succeeded";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await call();
    } catch (error) {
      message = error.reason || error.shortMessage || String(error.message);
      if (!reason || message.includes(reason)) {
        console.log(`  ✓ ${label}: reverted with "${message}"`);
        return;
      }
    }
    await sleep(3000);
  }
  throw new Error(`${label}: expected revert "${reason}" but ${message}`);
}

// `read` is a function so that a stale answer from a lagging node is retried
async function check(label, read, expected) {
  let actual;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      actual = await read();
      if (actual === expected) {
        console.log(`  ✓ ${label}: ${actual}`);
        return;
      }
    } catch (error) {
      actual = error.shortMessage || error.message;
    }
    await sleep(3000);
  }
  throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function main() {
  const net = getNetwork(process.argv[2]);
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "deployments.json"), "utf8")
  )[net.name];
  if (!deployment) throw new Error(`Nothing deployed on ${net.name}`);

  const stored = loadAccounts();
  provider = new JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true });
  const wallet = (account) => new NonceManager(new Wallet(account.privateKey, provider));
  const admin = wallet(stored.deployers[net.name]);
  const initiator = wallet(stored.roles.initiator);
  const transport1 = wallet(stored.roles.transport1);
  const transport2 = wallet(stored.roles.transport2);
  const facility = wallet(stored.roles.facility);
  const address = (role) => stored.roles[role].address;
  const balanceOf = (role) => provider.getBalance(address(role));
  const escrow = () => provider.getBalance(deployment.auctionsAddress);

  const artifacts = compile();
  const accounts = new Contract(deployment.accountsAddress, artifacts.Accounts.abi, provider);
  const auctions = new Contract(deployment.auctionsAddress, artifacts.Auctions.abi, provider);
  // long enough for the posts and bids, and then the reveals, to be mined
  // before each period ends
  const slow = net.name === "sepolia";
  const auctionTime = slow ? 120 : 60;
  const revealTime = slow ? 90 : 60;
  // the reveal policy during the run: one failed reveal suspends
  const suspension = slow ? 60 : 30;
  const testPolicy = [1n, 3600n, BigInt(suspension)];

  console.log(`\n${net.label}: Accounts ${deployment.accountsAddress}, Auctions ${deployment.auctionsAddress}`);

  // stop before spending anything if a role account could run dry half-way
  for (const role of Object.keys(stored.roles)) {
    const wanted = parseEther(net.roleFunding[role] || net.roleFunding.default);
    const balance = await balanceOf(role);
    if (balance < (wanted * 3n) / 4n) {
      throw new Error(
        `${role} holds ${formatEther(balance)} ${net.currency}; run "node fund-roles.js ${net.name}" first`
      );
    }
  }
  const escrowAtStart = await escrow();
  const id = {}; // tender name -> tender id

  // What one transaction did to an account's balance: the balance at the
  // transaction's block minus the balance one block earlier (exact, and
  // unaffected by which node answers). For the sender, add back the gas fee.
  const change = (role, receipt) => async () => {
    const [before, after] = await Promise.all([
      provider.getBalance(address(role), receipt.blockNumber - 1),
      provider.getBalance(address(role), receipt.blockNumber),
    ]);
    return after - before;
  };
  const changeNetOfFee = (role, receipt) => async () =>
    (await change(role, receipt)()) + receipt.fee;
  const tender = (name) => async () => (await auctions.getAllTenders())[id[name]];
  const escrowGrowth = async () => (await escrow()) - escrowAtStart;
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
  const failedReveals = async (role) => (await auctions.getFailedReveals(address(role))).length;
  // a made-up pickup address per tender; the street lines must differ, because
  // new tenders are told apart by them
  const places = [];
  const newPlace = () => {
    for (;;) {
      const place = randomAddress();
      if (!places.some((other) => other.address === place.address)) {
        places.push(place);
        return place;
      }
    }
  };
  const postArgs = (place, auction, reveal, deliveryTime) => [
    auction, reveal, deliveryTime,
    place.address, place.city, place.state, place.zipcode,
    randomSeverity(), [address("facility")],
  ];
  // finds the ids of newly posted tenders (re-reading if a node is still behind)
  let tenders;
  const assignIds = async (specs, firstId) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      tenders = await auctions.getAllTenders();
      for (const [name, [place]] of Object.entries(specs)) {
        id[name] = tenders.findIndex((t, index) => index >= firstId && t.details.addr === place.address);
      }
      if (Object.keys(specs).every((name) => id[name] >= 0)) return;
      await sleep(3000);
    }
    throw new Error("Could not find the new tenders on chain");
  };
  const dateOf = (field) => (name) => Number(tenders[id[name]].details[field]);
  const latest = (field, names) => Math.max(...names.map(dateOf(field)));

  console.log("\n1. System administrator registers the role accounts and sets the reveal policy");
  const registrations = [
    ["initiator", "isInitiator", "addInitiator"],
    ["transport1", "isAmbulance", "addAmbulance"],
    ["transport2", "isAmbulance", "addAmbulance"],
    ["facility", "isHospital", "addHospital"],
  ];
  for (const [role, isRole, add] of registrations) {
    if (await accounts[isRole](address(role))) {
      console.log(`  • ${role} already registered`);
    } else {
      await send(`register ${role}`, accounts.connect(admin), add, [address(role)]);
    }
  }
  await expectRevert(
    "non-admin cannot register accounts",
    () => accounts.connect(initiator).addAmbulance.staticCall(Wallet.createRandom().address),
    "Sender must be admin"
  );
  // a provider still suspended (an earlier run, or use of the Dapp) could not bid
  for (const role of ["transport1", "transport2"]) {
    const until = Number(await auctions.suspendedUntil(address(role)));
    if (until - now() > 300) {
      throw new Error(`${role} is suspended from bidding until ${new Date(until * 1000).toISOString()}`);
    }
    await waitUntil(until, `the suspension of ${role} to end`);
  }
  const policyBefore = await Promise.all([
    auctions.failedRevealLimit(),
    auctions.failedRevealWindow(),
    auctions.suspensionPeriod(),
  ]);
  await expectRevert(
    "non-admin cannot change the reveal policy",
    () => auctions.connect(initiator).setRevealPolicy.staticCall(...testPolicy),
    "Sender must be admin"
  );
  await send(
    `reveal policy for this run: ${testPolicy[0]} failed reveal within ${testPolicy[1]}s suspends for ${testPolicy[2]}s`,
    auctions.connect(admin),
    "setRevealPolicy",
    testPolicy
  );

  try {
    console.log("\n2. Transportation hirer posts four tenders (payment held in escrow)");
    let firstId = (await auctions.getAllTenders()).length;
    const specs = {
      A: [newPlace(), 1800],
      B: [newPlace(), SHORT_DELIVERY],
      C: [newPlace(), 1800],
      D: [newPlace(), SHORT_DELIVERY],
    };
    // posted together so that all four auctions close at (nearly) the same time
    await Promise.all(
      Object.entries(specs).map(([name, [place, deliveryTime]]) =>
        send(
          `post tender ${name}`,
          auctions.connect(initiator),
          "postTender",
          postArgs(place, auctionTime, revealTime, deliveryTime),
          { value: MAX_BID }
        )
      )
    );
    await assignIds(specs, firstId);
    console.log(`  tender ids: ${Object.entries(id).map(([n, i]) => `${n}=${i}`).join(", ")}`);
    await check("escrow holds the four payments", escrowGrowth, 4n * MAX_BID);
    await check(
      "reveal deadline = commit deadline + the reveal period the hirer chose",
      async () => {
        const details = (await tender("A")()).details;
        return details.revealDate - details.auctionDate;
      },
      BigInt(revealTime)
    );

    console.log("\n3. Transportation providers place sealed bids; nothing is deposited");
    const bids = { transport1: {}, transport2: {} };
    const placeBids = (role, signer, amount, names) =>
      Promise.all(
        names.map(async (name) => {
          const bid = sealedBid(id[name], address(role), amount);
          await send(`${role} bids on tender ${name}`, auctions.connect(signer), "secretBid", [id[name], bid.commitment]);
          bids[role][name] = bid;
        })
      );
    await Promise.all([
      placeBids("transport1", transport1, LOW_BID, ["A", "B", "D"]),
      placeBids("transport2", transport2, HIGH_BID, ["A", "B", "C"]),
    ]);
    await check("tender list shows both bidders of tender A", async () => (await tender("A")()).details.bidders.length, 2);
    await check(
      "only the commitment is on chain",
      async () => (await auctions.bids(id.A, address("transport1"))).commitment,
      bids.transport1.A.commitment
    );
    await check("escrow holds the four payments and no deposits", escrowGrowth, 4n * MAX_BID);
    await expectRevert(
      "a provider cannot bid twice",
      () => auctions.connect(transport1).secretBid.staticCall(id.A, sealedBid(id.A, address("transport1"), 1n).commitment),
      "Can only bid once"
    );
    await expectRevert(
      "a non-provider cannot bid",
      () => auctions.connect(facility).secretBid.staticCall(id.A, sealedBid(id.A, address("facility"), 1n).commitment),
      "Sender must be an ambulance"
    );

    console.log("\n4. Hirer retracts tender C during the bidding period");
    let receipt = await send("retract tender C", auctions.connect(initiator), "retractTender", [id.C]);
    await check("hirer refunded the escrow", changeNetOfFee("initiator", receipt), MAX_BID);

    console.log("\n5. Bidding closes; bids are revealed (no winner yet)");
    await waitUntil(latest("auctionDate", ["A", "B", "D"]), "the auctions to close");
    const revealArgs = (role, name, amount = bids[role][name].bid, nonce = bids[role][name].nonce) => [
      id[name],
      amount,
      nonce,
    ];
    await expectRevert(
      "the hirer can no longer retract",
      () => auctions.connect(initiator).retractTender.staticCall(id.A),
      "Bidding period is over"
    );
    await expectRevert(
      "a reveal with the wrong amount is rejected",
      () => auctions.connect(transport1).revealBid.staticCall(...revealArgs("transport1", "A", 50000n)),
      "Bid value != Hash Value"
    );
    await expectRevert(
      "a bid cannot be lowered by moving value into the nonce",
      () =>
        auctions
          .connect(transport2)
          .revealBid.staticCall(...revealArgs("transport2", "A", LOW_BID - 1n, bids.transport2.A.nonce + HIGH_BID - LOW_BID + 1n)),
      "Bid value != Hash Value"
    );
    await expectRevert(
      "a competitor cannot open another provider's commitment",
      () => auctions.connect(transport2).revealBid.staticCall(id.D, LOW_BID, bids.transport1.D.nonce),
      "No bid to reveal"
    );
    // transport2 reveals on A only: its bid on B stays sealed
    await Promise.all([
      send("transport2 reveals 80000 on tender A", auctions.connect(transport2), "revealBid", revealArgs("transport2", "A"), {}, 30),
      ...["A", "B", "D"].map((name) =>
        send(`transport1 reveals 60000 on tender ${name}`, auctions.connect(transport1), "revealBid", revealArgs("transport1", name), {}, 30)
      ),
    ]);
    await check("revealed bids are public", async () => (await auctions.bids(id.A, address("transport2"))).amount, HIGH_BID);
    await check("revealing picks no winner", async () => (await tender("A")()).details.tenderAccepter, ZeroAddress);
    await check("tender A is still open", async () => STATUS[Number((await tender("A")()).status)], "Open");
    if (now() < latest("revealDate", ["A", "B", "D"]) - 15) {
      await expectRevert(
        "the winner cannot be determined during the reveal period",
        () => auctions.connect(facility).determineWinner.staticCall(id.A),
        "Reveal period is not over"
      );
    }

    console.log("\n6. Reveal period ends; anyone triggers winner determination");
    await waitUntil(latest("revealDate", ["A", "B", "D"]), "the reveal period to end");
    await expectRevert(
      "a reveal after the deadline is rejected",
      () => auctions.connect(transport2).revealBid.staticCall(...revealArgs("transport2", "B")),
      "Tender past reveal period"
    );
    const failedBefore = await failedReveals("transport2");
    receipt = await send("facility (a bystander) determines the winner of tender A", auctions.connect(facility), "determineWinner", [id.A], {}, 30);
    const receiptA = receipt;
    await check("lowest bid wins tender A", async () => (await tender("A")()).details.tenderAccepter, address("transport1"));
    await check("winning bid on tender A", async () => (await tender("A")()).details.finalBid, LOW_BID);
    await check("getAuctionWinner(A)", () => auctions.getAuctionWinner(id.A), address("transport1"));
    await check("no failed reveal on tender A", async () => eventsOf(receiptA, "RevealFailed").length, 0);
    await send("hirer determines the winner of tender D", auctions.connect(initiator), "determineWinner", [id.D]);

    receipt = await send("transport1 determines the winner of tender B", auctions.connect(transport1), "determineWinner", [id.B]);
    const receiptB = receipt;
    await check("tender B goes to the only revealed bid", () => auctions.getAuctionWinner(id.B), address("transport1"));
    await check("failed reveal reported for transport2", async () => eventsOf(receiptB, "RevealFailed")[0].args.bidder, address("transport2"));
    await check("failed reveal added to transport2's public record", async () => (await failedReveals("transport2")) - failedBefore, 1);
    const suspendedUntil = eventsOf(receiptB, "BidderSuspended")[0].args.until;
    await check("transport2 is suspended", () => auctions.suspendedUntil(address("transport2")), suspendedUntil);
    await check("transport1 is not suspended", () => auctions.isSuspended(address("transport1")), false);

    console.log("\n7. A suspended provider cannot bid");
    firstId = (await auctions.getAllTenders()).length;
    const specE = { E: [newPlace(), SHORT_DELIVERY] };
    // open for bids until well after the suspension has ended
    await send("post tender E", auctions.connect(initiator), "postTender", postArgs(specE.E[0], suspension + 150, 30, SHORT_DELIVERY), { value: MAX_BID });
    await assignIds(specE, firstId);
    const commitmentE = (role) => sealedBid(id.E, address(role), LOW_BID).commitment;
    if (now() < Number(suspendedUntil) - 10) {
      await expectRevert(
        "the commit function rejects the suspended address",
        () => auctions.connect(transport2).secretBid.staticCall(id.E, commitmentE("transport2")),
        "Bidder is suspended"
      );
    }
    await check("the other provider can still bid", () => auctions.connect(transport1).secretBid.staticCall(id.E, commitmentE("transport1")), 0n);

    console.log("\n8. On-time delivery of tender A");
    await expectRevert(
      "only an allowed facility can verify delivery",
      () => auctions.connect(transport2).verifyDelivery.staticCall(id.A),
      "Sender must be hospital"
    );
    receipt = await send("facility verifies delivery of tender A", auctions.connect(facility), "verifyDelivery", [id.A]);
    await check("winner received its bid", change("transport1", receipt), LOW_BID);
    await check("hirer refunded the unspent escrow", change("initiator", receipt), MAX_BID - LOW_BID);
    await check("the outbid provider received nothing", change("transport2", receipt), 0n);
    const deliveryA = eventsOf(receipt, "DeliveryVerified")[0].args;
    await check("the delivery is announced for the winner", async () => deliveryA.provider, address("transport1"));
    await check("the confirmation time is recorded in the tender", async () => (await tender("A")()).details.deliveryDate, deliveryA.deliveryDate);
    await check("it is not after the due date: on time", async () => deliveryA.deliveryDate <= deliveryA.dueDate, true);

    console.log("\n9. Tenders B and D pass their due dates: late delivery and reclaim");
    if (now() < dateOf("dueDate")("B")) {
      await expectRevert(
        "a tender cannot be reclaimed before it is overdue",
        () => auctions.connect(initiator).reclaimTender.staticCall(id.B),
        "Delivery is not overdue"
      );
    }
    await waitUntil(latest("dueDate", ["B", "D"]), "tenders B and D to become overdue");
    receipt = await send("facility verifies late delivery of tender D", auctions.connect(facility), "verifyDelivery", [id.D]);
    await check("late winner still received its bid", change("transport1", receipt), LOW_BID);
    await check("hirer refunded the unspent escrow", change("initiator", receipt), MAX_BID - LOW_BID);
    const deliveryD = eventsOf(receipt, "DeliveryVerified")[0].args;
    await check("the confirmation time is recorded in the tender", async () => (await tender("D")()).details.deliveryDate, deliveryD.deliveryDate);
    await check("it is after the due date: the delivery is on record as late", async () => deliveryD.deliveryDate > deliveryD.dueDate, true);

    receipt = await send("hirer reclaims undelivered tender B", auctions.connect(initiator), "reclaimTender", [id.B], {}, 30);
    await check("hirer received the escrow back", changeNetOfFee("initiator", receipt), MAX_BID);
    await check("the missed delivery stays on record against the provider", async () => (await tender("B")()).details.tenderAccepter, address("transport1"));
    await check("with no delivery time", async () => (await tender("B")()).details.deliveryDate, 0n);

    console.log("\n10. The suspension ends; tender E gets no bid");
    await waitUntil(Number(suspendedUntil), "the suspension of transport2 to end");
    await check("transport2 is no longer suspended", () => auctions.isSuspended(address("transport2")), false);
    if (now() < dateOf("auctionDate")("E") - 10) {
      await check("transport2 can bid again", () => auctions.connect(transport2).secretBid.staticCall(id.E, commitmentE("transport2")), 0n);
    }
    await waitUntil(dateOf("revealDate")("E"), "the reveal period of tender E to end");
    receipt = await send("transport2 determines the winner of tender E", auctions.connect(transport2), "determineWinner", [id.E], {}, 30);
    const receiptE = receipt;
    await check("no winner announced", async () => eventsOf(receiptE, "WinnerDetermined")[0].args.winner, ZeroAddress);
    await check("hirer refunded the escrow", change("initiator", receiptE), MAX_BID);

    console.log("\n11. Final state");
    const expected = { A: "Closed", B: "Reclaimed", C: "Retracted", D: "Closed", E: "Unawarded" };
    for (const [name, status] of Object.entries(expected)) {
      await check(`tender ${name} (id ${id[name]})`, async () => STATUS[Number((await tender(name)()).status)], status);
    }
    await check("nothing from this run is left in the contract", escrowGrowth, 0n);
  } finally {
    await send("reveal policy restored", auctions.connect(admin), "setRevealPolicy", policyBefore);
  }

  console.log(`\nGas used per call on ${net.label}:`);
  const byMethod = {};
  for (const entry of gasReport) (byMethod[entry.method] = byMethod[entry.method] || []).push(entry);
  for (const [method, entries] of Object.entries(byMethod)) {
    const gas = entries.reduce((sum, e) => sum + e.gasUsed, 0n) / BigInt(entries.length);
    const fee = entries.reduce((sum, e) => sum + e.fee, 0n) / BigInt(entries.length);
    console.log(`  ${method.padEnd(16)} avg gas ${String(gas).padStart(9)}   avg fee ${formatEther(fee)} ${net.currency}  (${entries.length} call${entries.length > 1 ? "s" : ""})`);
  }
  console.log("\nAll end-to-end checks passed.");

  // keep the Dapp's local database paired with the tenders created above
  await syncDatabase(net.name);
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error.shortMessage || error.message || error);
  process.exit(1);
});
