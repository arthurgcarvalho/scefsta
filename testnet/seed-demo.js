// Fills a deployment with made-up demo data, so that every dashboard of the
// Dapp has something to show:
//
//   node seed-demo.js <sepolia|amoy|fuji>
//
// On chain (with the role accounts from accounts.json):
//   * a few extra facilities, transport providers and initiators are
//     registered (random addresses nobody holds the keys of; they only fill
//     the Admin lists and the tenders' facility lists);
//   * tenders whose auctions stay open for weeks, some with sealed bids from
//     the two transport accounts (Available Tenders, Placed Bids, Pending
//     Patients);
//   * tenders that are auctioned at once and left in progress with a delivery
//     date weeks away (Tenders In Progress, Incoming Patients);
//   * tenders that are auctioned and delivered (Accepted Patients).
// In the backend database: a patient record with injury details for every
// tender, the bid nonces (so the open bids can be revealed from the Dapp
// later) and the extra users.
//
// All values come from sample-data.js. Run it once per deployment; a second
// run adds another set of tenders but no more extra users.
const {
  JsonRpcProvider,
  Wallet,
  Contract,
  NonceManager,
  solidityPackedKeccak256,
  randomBytes,
  toBigInt,
} = require("ethers");
const { randomInt } = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { getNetwork } = require("./networks");
const { loadAccounts } = require("./accounts");
const { compile } = require("./compile");
const { syncDatabase } = require("./sync-db");
const { randomAddress, randomSeverity, randomCase, randomProfile } = require("./sample-data");

const DAY = 24 * 60 * 60;
const HOUR = 60 * 60;

// Tenders that stay open: [days until the auction closes, hours allowed for
// the delivery, accounts that place a sealed bid]
const OPEN_TENDERS = [
  [21, 6, ["transport1", "transport2"]],
  [14, 4, ["transport1"]],
  [30, 8, ["transport2"]],
  [10, 3, ["transport1", "transport2"]],
  [45, 12, []],
  [7, 2, ["transport1"]],
];
// Tenders auctioned right away: [days allowed for the delivery, account with
// the lowest bid, whether the delivery is confirmed]
const QUICK_TENDERS = [
  [14, "transport1", false],
  [21, "transport2", false],
  [30, "transport1", false],
  [10, "transport2", true],
  [12, "transport1", true],
];
// Extra organisations per kind: [Users kind, register method, how many]
const EXTRA_USERS = [
  ["facility", "addHospital", 3],
  ["transport", "addAmbulance", 3],
  ["initiator", "addInitiator", 2],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => Math.floor(Date.now() / 1000);
const thousands = (low, high) => BigInt(randomInt(low, high + 1)) * 1000n;
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

// Sends a transaction; time-gated calls may be retried for a short while,
// because a node that is a block behind rejects them during gas estimation.
async function send(label, contract, method, args = [], overrides = {}, retrySeconds = 0) {
  const deadline = Date.now() + retrySeconds * 1000;
  for (;;) {
    try {
      const tx = await contract[method](...args, overrides);
      const receipt = await tx.wait();
      console.log(`  ✓ ${label}`);
      return receipt;
    } catch (error) {
      if (contract.runner && contract.runner.reset) contract.runner.reset();
      if (Date.now() >= deadline) throw error;
      await sleep(3000);
    }
  }
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
  const signers = {
    admin: wallet(stored.deployers[net.name]),
    initiator: wallet(stored.roles.initiator),
    transport1: wallet(stored.roles.transport1),
    transport2: wallet(stored.roles.transport2),
    facility: wallet(stored.roles.facility),
  };
  const address = (role) => stored.roles[role].address;
  const artifacts = compile();
  const accounts = new Contract(deployment.accountsAddress, artifacts.Accounts.abi, provider);
  const auctions = new Contract(deployment.auctionsAddress, artifacts.Auctions.abi, provider);
  console.log(`\n${net.label}: seeding demo data on Auctions ${deployment.auctionsAddress}`);

  // The database must exist and know the role accounts before rows are added
  await syncDatabase(net.name);
  process.env.NETWORK = net.name;
  const dbFile = require("../backend-api/db").sqliteFile();
  const db = new DatabaseSync(dbFile);
  const insertUser = (walletId, profile) => {
    const columns = ["walletId", ...Object.keys(profile)];
    db.prepare(
      `INSERT INTO Users (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
    ).run(walletId, ...Object.values(profile));
  };

  console.log("\n1. Extra organisations for the Admin lists");
  const namesInUse = db
    .prepare("SELECT transportCompany, facilityName FROM Users")
    .all()
    .flatMap((row) => Object.values(row));
  const extraFacilities = [];
  for (const [kind, method, wanted] of EXTRA_USERS) {
    const existing = db
      .prepare("SELECT walletId FROM Users WHERE accountType = ?")
      .all(kind)
      .map((row) => row.walletId);
    // the role accounts from accounts.json do not count as extras
    const roleAddresses = Object.values(stored.roles).map((role) => role.address.toLowerCase());
    const extras = existing.filter((walletId) => !roleAddresses.includes(walletId.toLowerCase()));
    if (kind === "facility") extraFacilities.push(...extras);
    await Promise.all(
      Array.from({ length: Math.max(0, wanted - extras.length) }, async () => {
        const walletId = Wallet.createRandom().address;
        const profile = randomProfile(kind, namesInUse);
        namesInUse.push(profile.transportCompany, profile.facilityName);
        await send(
          `registered ${kind} ${profile.transportCompany || profile.facilityName || profile.policeDept}`,
          accounts.connect(signers.admin),
          method,
          [walletId]
        );
        insertUser(walletId, profile);
        if (kind === "facility") extraFacilities.push(walletId);
      })
    );
  }

  // Every tender names the test facility (so its dashboard shows the patient)
  // and one or two of the extra ones
  const facilitiesFor = () => {
    const others = extraFacilities.filter(() => randomInt(2) === 1).slice(0, 2);
    return [address("facility"), ...others];
  };
  const usedStreets = new Set();
  const newTender = (auctionSeconds, deliverySeconds) => {
    let place;
    do {
      place = randomAddress();
    } while (usedStreets.has(place.address));
    usedStreets.add(place.address);
    const maxBid = thousands(120, 400);
    return { place, auctionSeconds, deliverySeconds, maxBid, penalty: thousands(1, 4) / 2n };
  };
  const post = (tender, label) =>
    send(
      `posted ${label}: ${tender.place.address}, ${tender.place.city}, ${tender.place.state}`,
      auctions.connect(signers.initiator),
      "postTender",
      [
        tender.auctionSeconds, tender.deliverySeconds,
        tender.place.address, tender.place.city, tender.place.state, tender.place.zipcode,
        tender.penalty, randomSeverity(), facilitiesFor(),
      ],
      { value: tender.maxBid }
    );
  // new tenders are told apart by their street line
  const assignIds = async (tenders, firstId) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const onChain = await auctions.getAllTenders();
      for (const tender of tenders) {
        const index = onChain.findIndex(
          (t, i) => i >= firstId && t.details.addr === tender.place.address
        );
        if (index >= 0) {
          tender.id = index;
          tender.auctionDate = Number(onChain[index].details.auctionDate);
          tender.revealDate = Number(onChain[index].details.revealDate);
        }
      }
      if (tenders.every((tender) => tender.id !== undefined)) return;
      await sleep(3000);
    }
    throw new Error("Could not find the new tenders on chain");
  };
  const bids = []; // { role, tender, bid, salt, bidId }
  const placeBid = async (role, tender, amount) => {
    const sealed = sealedBid(amount);
    const receipt = await send(
      `${role} bid on tender ${tender.id}`,
      auctions.connect(signers[role]),
      "secretBid",
      [tender.id, sealed.hash],
      { value: tender.penalty }
    );
    const placed = receipt.logs
      .map((log) => {
        try {
          return auctions.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "BidPlaced");
    const entry = { role, tender, ...sealed, bidId: placed.args.bidId };
    bids.push(entry);
    return entry;
  };
  // a bid somewhere between 50% and 95% of the maximum, in whole thousands
  const bidBetween = (tender, lowPercent, highPercent) =>
    ((tender.maxBid * BigInt(randomInt(lowPercent, highPercent + 1))) / 100000n) * 1000n;

  console.log("\n2. Tenders that stay open, some with sealed bids");
  let firstId = (await auctions.getAllTenders()).length;
  const open = OPEN_TENDERS.map(([days, hours, bidders]) => ({
    ...newTender(days * DAY, hours * HOUR),
    bidders,
  }));
  await Promise.all(open.map((tender) => post(tender, "open tender")));
  await assignIds(open, firstId);
  await Promise.all(
    open.flatMap((tender) =>
      tender.bidders.map((role) => placeBid(role, tender, bidBetween(tender, 50, 95)))
    )
  );

  console.log("\n3. Tenders auctioned now: bids, reveals, deliveries");
  firstId = (await auctions.getAllTenders()).length;
  // long enough for the bids to be mined before the auction closes
  const auctionSeconds = net.name === "sepolia" ? 150 : 75;
  const quick = QUICK_TENDERS.map(([days, winner, delivered]) => ({
    ...newTender(auctionSeconds, days * DAY),
    winner,
    delivered,
  }));
  await Promise.all(quick.map((tender) => post(tender, "tender")));
  await assignIds(quick, firstId);
  const quickBids = await Promise.all(
    quick.flatMap((tender) =>
      ["transport1", "transport2"].map((role) =>
        placeBid(
          role,
          tender,
          role === tender.winner ? bidBetween(tender, 50, 65) : bidBetween(tender, 75, 95)
        )
      )
    )
  );
  await waitUntil(Math.max(...quick.map((tender) => tender.auctionDate)), "the auctions to close");
  await Promise.all(
    quickBids.map((entry) =>
      send(
        `${entry.role} revealed ${entry.bid} on tender ${entry.tender.id}`,
        auctions.connect(signers[entry.role]),
        "revealBid",
        [entry.tender.id, entry.bid, entry.salt, entry.bidId],
        {},
        30
      )
    )
  );
  await waitUntil(Math.max(...quick.map((tender) => tender.revealDate)), "the reveal period to end");
  await Promise.all(
    quick
      .filter((tender) => tender.delivered)
      .map((tender) =>
        send(
          `facility confirmed delivery of tender ${tender.id}`,
          auctions.connect(signers.facility),
          "verifyDelivery",
          [tender.id],
          {},
          30
        )
      )
  );

  console.log("\n4. Backend database");
  db.close();
  await syncDatabase(net.name); // a patient record per new tender
  const data = new DatabaseSync(dbFile);
  // patients added by earlier versions of the scripts have no injury details
  const blank = data
    .prepare("SELECT patientId, severity FROM Patients WHERE injuries IS NULL OR injuries = 'N/A'")
    .all();
  for (const patient of blank) {
    const sample = randomCase(patient.severity);
    data
      .prepare("UPDATE Patients SET injuries = ?, mechanismOfInjury = ? WHERE patientId = ?")
      .run(sample.injuries, sample.mechanism, patient.patientId);
  }
  // the bid nonces, as the Dapp stores them when a bid is placed through it
  const insertSalt = data.prepare(
    "INSERT INTO Salts (walletId, patientId, bidId, saltVal, bidVal, penalty) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const entry of bids) {
    insertSalt.run(
      address(entry.role),
      entry.tender.id + 1,
      Number(entry.bidId),
      Number(entry.salt),
      Number(entry.bid),
      Number(entry.tender.penalty)
    );
  }
  data.close();
  console.log(
    `  ✓ ${blank.length} patient record(s) completed, ${bids.length} bid nonce(s) stored in ${path.basename(dbFile)}`
  );

  const statuses = ["Closed", "InProgress", "Open", "Retracted", "Reclaimed"];
  const counts = {};
  for (const tender of await auctions.getAllTenders()) {
    const status = statuses[Number(tender.status)];
    counts[status] = (counts[status] || 0) + 1;
  }
  console.log(
    `\nTenders on chain now: ${Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(", ")}`
  );
}

main().catch((error) => {
  console.error("\nSeeding failed:", error.shortMessage || error.message || error);
  process.exit(1);
});
