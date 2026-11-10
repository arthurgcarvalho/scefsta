// Deploys Accounts and Auctions to a testnet and records the addresses.
//
//   node deploy.js <sepolia|amoy|fuji>
//
// The deployer (accounts.json -> deployers.<network>) becomes the contract's
// superAdmin. Addresses are written to ./deployments.json and mirrored to
// ../project_code/deployments.json, which the Next.js app reads.
const fs = require("fs");
const path = require("path");
const {
  JsonRpcProvider,
  Wallet,
  ContractFactory,
  formatEther,
  formatUnits,
} = require("ethers");
const { getNetwork } = require("./networks");
const { loadAccounts } = require("./accounts");
const { compile } = require("./compile");

const DEPLOYMENTS_FILE = path.join(__dirname, "deployments.json");
const APP_DEPLOYMENTS_FILE = path.join(
  __dirname,
  "..",
  "project_code",
  "deployments.json"
);

function loadDeployments() {
  return fs.existsSync(DEPLOYMENTS_FILE)
    ? JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8"))
    : {};
}

function saveDeployments(deployments) {
  const json = JSON.stringify(deployments, null, 2) + "\n";
  fs.writeFileSync(DEPLOYMENTS_FILE, json);
  fs.writeFileSync(APP_DEPLOYMENTS_FILE, json);
}

async function deployContract(label, artifact, wallet, args) {
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  console.log(`  ${label}: tx ${tx.hash}`);
  const receipt = await tx.wait(2);
  const address = await contract.getAddress();
  console.log(
    `  ${label}: deployed at ${address} (block ${receipt.blockNumber}, gas ${receipt.gasUsed})`
  );
  return {
    address,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    feePaid: formatEther(receipt.gasUsed * receipt.gasPrice),
  };
}

async function main() {
  const net = getNetwork(process.argv[2]);
  const deployer = loadAccounts().deployers[net.name];
  if (!deployer) throw new Error(`No deployer for ${net.name}; run "node accounts.js"`);

  const provider = new JsonRpcProvider(net.rpcUrl, net.chainId, {
    staticNetwork: true,
  });
  const wallet = new Wallet(deployer.privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  const fees = await provider.getFeeData();
  console.log(`Deploying to ${net.label} (chainId ${net.chainId})`);
  console.log(`  deployer ${wallet.address}, balance ${formatEther(balance)} ${net.currency}`);
  console.log(`  gas price ~${formatUnits(fees.maxFeePerGas ?? fees.gasPrice, "gwei")} gwei`);
  if (balance === 0n) throw new Error("Deployer has no funds on this network");

  const artifacts = compile();
  const accounts = await deployContract("Accounts", artifacts.Accounts, wallet, []);
  const auctions = await deployContract("Auctions", artifacts.Auctions, wallet, [
    accounts.address,
  ]);

  // keep the addresses of earlier deployments on this network for the record
  const deployments = loadDeployments();
  const replaced = deployments[net.name];
  const previous = replaced
    ? [
        ...(replaced.previous || []),
        {
          deployedAt: replaced.deployedAt,
          accountsAddress: replaced.accountsAddress,
          auctionsAddress: replaced.auctionsAddress,
        },
      ]
    : [];
  deployments[net.name] = {
    network: net.label,
    chainId: net.chainId,
    currency: net.currency,
    rpcUrl: net.rpcUrl,
    explorer: net.explorer,
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
    accountsAddress: accounts.address,
    auctionsAddress: auctions.address,
    transactions: { accounts, auctions },
    previous,
  };
  saveDeployments(deployments);

  console.log(`\nSaved to ${DEPLOYMENTS_FILE}`);
  console.log(`  ${net.explorer}/address/${accounts.address}`);
  console.log(`  ${net.explorer}/address/${auctions.address}`);
}

main().catch((error) => {
  console.error(error.shortMessage || error);
  process.exit(1);
});
