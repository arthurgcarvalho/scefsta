// Manages ./accounts.json (git-ignored): the testnet-only keys used to deploy
// the contracts and to play the four roles from the paper while testing.
//
//   node accounts.js            -> create any missing accounts, print addresses
//   node accounts.js --show     -> print addresses only
//
// A deployer key can be supplied instead of generated, e.g.
//   SEPOLIA_DEPLOYER_KEY=<hex> node accounts.js
const fs = require("fs");
const path = require("path");
const { Wallet } = require("ethers");
const { networks } = require("./networks");

const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");

// Role accounts are reused on every network (an EVM key is valid on all three).
const ROLES = {
  initiator: "Transportation hirer (posts tenders)",
  transport1: "Transportation provider A (bids / delivers)",
  transport2: "Transportation provider B (bids / delivers)",
  facility: "Delivery verifier (confirms patient arrival)",
};

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) return { deployers: {}, roles: {} };
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
}

function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2) + "\n");
}

function entry(wallet, description, source) {
  return {
    description,
    address: wallet.address,
    privateKey: wallet.privateKey,
    source,
  };
}

function ensureAccounts() {
  const accounts = loadAccounts();
  accounts.deployers = accounts.deployers || {};
  accounts.roles = accounts.roles || {};

  for (const [name, net] of Object.entries(networks)) {
    if (accounts.deployers[name]) continue;
    const supplied = process.env[`${name.toUpperCase()}_DEPLOYER_KEY`];
    const wallet = supplied
      ? new Wallet(supplied.startsWith("0x") ? supplied : "0x" + supplied)
      : Wallet.createRandom();
    accounts.deployers[name] = entry(
      wallet,
      `Deployer / superAdmin on ${net.label}`,
      supplied ? "supplied" : "generated"
    );
  }

  for (const [role, description] of Object.entries(ROLES)) {
    if (accounts.roles[role]) continue;
    accounts.roles[role] = entry(Wallet.createRandom(), description, "generated");
  }

  saveAccounts(accounts);
  return accounts;
}

module.exports = { loadAccounts, ensureAccounts, ACCOUNTS_FILE, ROLES };

if (require.main === module) {
  const accounts = process.argv.includes("--show")
    ? loadAccounts()
    : ensureAccounts();
  for (const group of ["deployers", "roles"]) {
    for (const [name, a] of Object.entries(accounts[group] || {})) {
      console.log(`${group}.${name.padEnd(11)} ${a.address}  (${a.source}) ${a.description}`);
    }
  }
  console.log(`\nPrivate keys are stored in ${ACCOUNTS_FILE}`);
}
