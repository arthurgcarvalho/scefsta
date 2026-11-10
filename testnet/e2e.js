// End-to-end check of the deployed contracts on a live testnet, driving every
// role from the paper with the accounts in accounts.json:
//
//   node e2e.js <sepolia|amoy|fuji>
//
// The superAdmin registers the role accounts (if needed); the initiator posts
// four tenders; both transport providers place sealed bids; then
//   tender A  both reveal (higher bid first) -> lowest bid wins, delivered on
//             time -> winner paid bid + deposit, loser withdraws its deposit
//   tender B  only one bidder reveals, job is never delivered -> the initiator
//             reclaims escrow + the winner's deposit after the due date
//   tender C  retracted while open -> the bidder withdraws its deposit
//   tender D  delivered late -> winner paid the bid, deposit goes to initiator
// It checks every payout and that the contract ends up holding nothing from
// the run, and prints the gas used per call (compare Table 6 of the paper).
const {
  JsonRpcProvider,
  Wallet,
  Contract,
  NonceManager,
  solidityPackedKeccak256,
  parseEther,
  formatEther,
  randomBytes,
  toBigInt,
} = require("ethers");
const fs = require("fs");
const path = require("path");
const { getNetwork } = require("./networks");
const { loadAccounts } = require("./accounts");
const { compile } = require("./compile");
const { syncDatabase } = require("./sync-db");

const MAX_BID = 100000n; // wei placed in escrow by the hirer
const PENALTY = 500n; // wei deposited with each bid
const LOW_BID = 60000n;
const HIGH_BID = 80000n;
const SHORT_DELIVERY = 30; // seconds; tenders B and D become overdue quickly
const STATUS = ["Closed", "InProgress", "Open", "Retracted", "Reclaimed"];

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

function sealedBid(bid) {
  // Same scheme as the Dapp: keccak256(abi.encodePacked(uint256(bid + nonce)))
  const salt = toBigInt(randomBytes(6));
  const hash = toBigInt(solidityPackedKeccak256(["uint256"], [bid + salt]));
  return { bid, salt, hash };
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
  // long enough for the posts and bids below to be mined before the auction ends
  const auctionTime = net.name === "sepolia" ? 120 : 60;

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

  console.log("\n1. System administrator registers the role accounts");
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

  console.log("\n2. Transportation hirer posts four tenders (payment held in escrow)");
  const firstId = (await auctions.getAllTenders()).length;
  const specs = {
    A: ["110 N Poplar St", 1800],
    B: ["501 E High St", SHORT_DELIVERY],
    C: ["5 W Collins St", 1800],
    D: ["24 S Beech St", SHORT_DELIVERY],
  };
  // posted together so that all four auctions close at (nearly) the same time
  await Promise.all(
    Object.entries(specs).map(([name, [street, deliveryTime]]) =>
      send(
        `post tender ${name}`,
        auctions.connect(initiator),
        "postTender",
        [auctionTime, deliveryTime, street, "Oxford", "Ohio", "45056", PENALTY, "Low", [address("facility")]],
        { value: MAX_BID }
      )
    )
  );
  // find the ids of the four new tenders (re-reading if a node is still behind)
  let tenders;
  for (let attempt = 0; attempt < 10; attempt++) {
    tenders = await auctions.getAllTenders();
    for (const [name, [street]] of Object.entries(specs)) {
      id[name] = tenders.findIndex((t, index) => index >= firstId && t.details.addr === street);
    }
    if (Object.values(id).every((tenderId) => tenderId >= 0)) break;
    await sleep(3000);
  }
  console.log(`  tender ids: ${Object.entries(id).map(([n, i]) => `${n}=${i}`).join(", ")}`);
  const dateOf = (field) => (name) => Number(tenders[id[name]].details[field]);
  const latest = (field, names) => Math.max(...names.map(dateOf(field)));
  await check("escrow holds the four payments", escrowGrowth, 4n * MAX_BID);

  console.log("\n3. Transportation providers place sealed bids, each with one penalty deposit");
  const bids = { transport1: {}, transport2: {} };
  const placeBids = (role, signer, amount, names) =>
    Promise.all(
      names.map(async (name) => {
        const bid = sealedBid(amount);
        const receipt = await send(`${role} bids on tender ${name}`, auctions.connect(signer), "secretBid", [id[name], bid.hash], { value: PENALTY });
        // the bid id needed for the reveal is announced in the BidPlaced event
        const placed = receipt.logs
          .map((log) => {
            try {
              return auctions.interface.parseLog(log);
            } catch (error) {
              return null;
            }
          })
          .find((parsed) => parsed && parsed.name === "BidPlaced");
        bids[role][name] = { ...bid, bidId: placed.args.bidId };
      })
    );
  await Promise.all([
    placeBids("transport1", transport1, LOW_BID, ["A", "B", "D"]),
    placeBids("transport2", transport2, HIGH_BID, ["A", "B", "C"]),
  ]);
  await check("tender list shows both bidders of tender A", async () => (await tender("A")()).details.bidders.length, 2);
  await check("escrow also holds six deposits", escrowGrowth, 4n * MAX_BID + 6n * PENALTY);
  await expectRevert(
    "a provider cannot bid twice",
    () => auctions.connect(transport1).secretBid.staticCall(id.A, 1n, { value: PENALTY }),
    "Can only bid once"
  );
  await expectRevert(
    "a non-provider cannot bid",
    () => auctions.connect(facility).secretBid.staticCall(id.A, 1n, { value: PENALTY }),
    "Sender must be an ambulance"
  );

  console.log("\n4. Hirer retracts tender C; its bidder takes the deposit back");
  await send("retract tender C", auctions.connect(initiator), "retractTender", [id.C]);
  let receipt = await send("transport2 withdraws its deposit from C", auctions.connect(transport2), "withdrawDeposit", [id.C]);
  await check("deposit returned", changeNetOfFee("transport2", receipt), PENALTY);

  console.log("\n5. Auctions close; bids are revealed, the lowest one takes the job");
  await waitUntil(latest("auctionDate", ["A", "B", "D"]), "the auctions to close");
  const revealArgs = (role, name, amount = bids[role][name].bid) => [
    id[name],
    amount,
    bids[role][name].salt,
    bids[role][name].bidId,
  ];
  await expectRevert(
    "a reveal with the wrong amount is rejected",
    () => auctions.connect(transport1).revealBid.staticCall(...revealArgs("transport1", "A", 50000n)),
    "Bid value != Hash Value"
  );
  await send("transport2 reveals 80000 on tender A", auctions.connect(transport2), "revealBid", revealArgs("transport2", "A"), {}, 30);
  await check("higher bid leads while it is the only one revealed", async () => (await tender("A")()).details.tenderAccepter, address("transport2"));
  await Promise.all(
    ["A", "B", "D"].map((name) =>
      send(`transport1 reveals 60000 on tender ${name}`, auctions.connect(transport1), "revealBid", revealArgs("transport1", name), {}, 30)
    )
  );
  await check("lower bid takes over tender A", async () => (await tender("A")()).details.tenderAccepter, address("transport1"));
  await check("winning bid on tender A", async () => (await tender("A")()).details.finalBid, LOW_BID);

  console.log("\n6. Reveal period ends; winner announced; on-time delivery of tender A");
  await waitUntil(latest("revealDate", ["A", "B", "D"]), "the reveal period to end");
  await check("getAuctionWinner(A)", () => auctions.getAuctionWinner(id.A), address("transport1"));
  await expectRevert(
    "the winner cannot withdraw its deposit",
    () => auctions.connect(transport1).withdrawDeposit.staticCall(id.A),
    "Winner's deposit is held until delivery"
  );
  await expectRevert(
    "only an allowed facility can verify delivery",
    () => auctions.connect(transport2).verifyDelivery.staticCall(id.A),
    "Sender must be hospital"
  );
  receipt = await send("facility verifies delivery of tender A", auctions.connect(facility), "verifyDelivery", [id.A], {}, 30);
  await check("winner received bid + its deposit", change("transport1", receipt), LOW_BID + PENALTY);
  await check("hirer refunded the unspent escrow", change("initiator", receipt), MAX_BID - LOW_BID);
  receipt = await send("transport2 (outbid) withdraws its deposit from A", auctions.connect(transport2), "withdrawDeposit", [id.A]);
  await check("deposit returned", changeNetOfFee("transport2", receipt), PENALTY);

  console.log("\n7. Tenders B and D pass their due dates: late delivery and reclaim");
  if (now() < dateOf("dueDate")("B")) {
    await expectRevert(
      "a tender cannot be reclaimed before it is overdue",
      () => auctions.connect(initiator).reclaimTender.staticCall(id.B),
      "Delivery is not overdue"
    );
  }
  await waitUntil(latest("dueDate", ["B", "D"]), "tenders B and D to become overdue");
  receipt = await send("facility verifies late delivery of tender D", auctions.connect(facility), "verifyDelivery", [id.D]);
  await check("late winner received the bid only", change("transport1", receipt), LOW_BID);
  await check("hirer received unspent escrow + the penalty", change("initiator", receipt), MAX_BID - LOW_BID + PENALTY);

  receipt = await send("hirer reclaims undelivered tender B", auctions.connect(initiator), "reclaimTender", [id.B], {}, 30);
  await check("hirer received escrow + the winner's deposit", changeNetOfFee("initiator", receipt), MAX_BID + PENALTY);
  receipt = await send("transport2 (never revealed) withdraws its deposit from B", auctions.connect(transport2), "withdrawDeposit", [id.B]);
  await check("deposit returned", changeNetOfFee("transport2", receipt), PENALTY);

  console.log("\n8. Final state");
  const expected = { A: "Closed", B: "Reclaimed", C: "Retracted", D: "Closed" };
  for (const [name, status] of Object.entries(expected)) {
    await check(`tender ${name} (id ${id[name]})`, async () => STATUS[Number((await tender(name)()).status)], status);
  }
  await check("nothing from this run is left in the contract", escrowGrowth, 0n);

  console.log(`\nGas used per call on ${net.label}:`);
  const byMethod = {};
  for (const entry of gasReport) (byMethod[entry.method] = byMethod[entry.method] || []).push(entry);
  for (const [method, entries] of Object.entries(byMethod)) {
    const gas = entries.reduce((sum, e) => sum + e.gasUsed, 0n) / BigInt(entries.length);
    const fee = entries.reduce((sum, e) => sum + e.fee, 0n) / BigInt(entries.length);
    console.log(`  ${method.padEnd(15)} avg gas ${String(gas).padStart(9)}   avg fee ${formatEther(fee)} ${net.currency}  (${entries.length} call${entries.length > 1 ? "s" : ""})`);
  }
  console.log("\nAll end-to-end checks passed.");

  // keep the Dapp's local database paired with the tenders created above
  await syncDatabase(net.name);
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error.shortMessage || error.message || error);
  process.exit(1);
});
