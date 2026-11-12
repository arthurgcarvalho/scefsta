// Brings the local backend database in line with what is on chain.
//
//   node sync-db.js <sepolia|amoy|fuji>
//
// 1. The Dapp pairs tender N on chain with patient N+1 in the database.
//    Tenders posted outside the Dapp (e.g. by e2e.js) have no patient row,
//    which would shift that pairing for every tender posted afterwards. A
//    placeholder patient is added for each such tender.
// 2. Role accounts from accounts.json that were registered on chain by a
//    script rather than through the Admin page get a Users row, so they can
//    log in to the Dapp and use it.
//
// Creates the database if the backend has not been started for this network
// yet. Safe to run while the backend is up; e2e.js calls it when it finishes.
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { JsonRpcProvider, Contract } = require("ethers");
const { getNetwork } = require("./networks");
const { loadAccounts } = require("./accounts");
const { compile } = require("./compile");
const { randomProfile, randomCase } = require("./sample-data");

// on-chain TenderStatus -> Patients.status (an unawarded tender leaves the
// Dapp's lists the way a retracted one does)
const PATIENT_STATUS = ["accepted", "incoming", "pending", "retracted", "reclaimed", "retracted"];

// Users rows for the role accounts: [on-chain check, kind of made-up profile
// (see sample-data.js)]
const ROLE_PROFILES = {
  initiator: ["isInitiator", "initiator"],
  transport1: ["isAmbulance", "transport"],
  transport2: ["isAmbulance", "transport"],
  facility: ["isHospital", "facility"],
};

// The backend owns the database: its code names the file (one per deployed
// Auctions contract) and creates the schema and default rows.
function backendDatabase(networkName) {
  process.env.NETWORK = networkName;
  process.env.DB_DRIVER = "sqlite";
  return require("../backend-api/db");
}

function createDatabase(networkName) {
  const { createConnection } = backendDatabase(networkName);
  return new Promise((resolve, reject) => {
    const connection = createConnection();
    connection.connect((error) => {
      if (error) return reject(error);
      connection.db.close();
      resolve();
    });
  });
}

async function syncDatabase(networkName) {
  const net = getNetwork(networkName);
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "deployments.json"), "utf8")
  )[net.name];
  if (!deployment) throw new Error(`Nothing deployed on ${net.name}`);

  const dbFile = backendDatabase(net.name).sqliteFile();
  if (!fs.existsSync(dbFile)) await createDatabase(net.name);

  const provider = new JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true });
  const artifacts = compile();
  const auctions = new Contract(deployment.auctionsAddress, artifacts.Auctions.abi, provider);
  const accountsContract = new Contract(deployment.accountsAddress, artifacts.Accounts.abi, provider);
  const tenders = await auctions.getAllTenders();
  const db = new DatabaseSync(dbFile);

  const patientExists = db.prepare("SELECT 1 FROM Patients WHERE patientId = ?");
  const insertPatient = db.prepare(
    `INSERT INTO Patients (patientId, address, city, state, zipcode, injuries, mechanismOfInjury, severity, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let patientsAdded = 0;
  for (const tender of tenders) {
    const patientId = Number(tender.tenderId) + 1;
    if (patientExists.get(patientId)) continue;
    const details = tender.details;
    // the chain stores only the severity; the injury details live in the
    // database, so a made-up case of that severity stands in for them
    const sample = randomCase(details.severity);
    insertPatient.run(
      patientId,
      details.addr,
      details.city,
      details.state,
      Number(details.zipcode) || 0,
      sample.injuries,
      sample.mechanism,
      details.severity || sample.severity,
      PATIENT_STATUS[Number(tender.status)]
    );
    patientsAdded++;
  }

  const userExists = db.prepare("SELECT 1 FROM Users WHERE walletId = ?");
  const roles = loadAccounts().roles || {};
  let usersAdded = 0;
  const namesInUse = [];
  for (const [role, [check, kind]] of Object.entries(ROLE_PROFILES)) {
    const account = roles[role];
    if (!account || userExists.get(account.address)) continue;
    if (!(await accountsContract[check](account.address))) continue;
    const profile = randomProfile(kind, namesInUse);
    namesInUse.push(profile.transportCompany, profile.facilityName);
    const columns = ["walletId", ...Object.keys(profile)];
    db.prepare(
      `INSERT INTO Users (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
    ).run(account.address, ...Object.values(profile));
    usersAdded++;
  }

  db.close();
  console.log(
    `${net.label}: ${tenders.length} tender(s) on chain; added ${patientsAdded} placeholder patient(s) ` +
      `and ${usersAdded} role user(s) to ${path.basename(dbFile)}`
  );
}

module.exports = { syncDatabase };

if (require.main === module) {
  syncDatabase(process.argv[2]).catch((error) => {
    console.error(error.shortMessage || error);
    process.exit(1);
  });
}
