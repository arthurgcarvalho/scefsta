// Sends gas money from a network's deployer to the role test accounts.
//
//   node fund-roles.js <sepolia|amoy|fuji> [amountPerAccount]
//
// Without an amount, the per-network defaults in networks.js are used.
// Accounts already holding at least the amount are skipped.
const { JsonRpcProvider, Wallet, parseEther, formatEther } = require("ethers");
const { getNetwork } = require("./networks");
const { loadAccounts } = require("./accounts");

async function main() {
  const net = getNetwork(process.argv[2]);
  const amountFor = (role) =>
    parseEther(
      process.argv[3] || net.roleFunding[role] || net.roleFunding.default
    );
  const accounts = loadAccounts();
  const provider = new JsonRpcProvider(net.rpcUrl, net.chainId, {
    staticNetwork: true,
  });
  const deployer = new Wallet(accounts.deployers[net.name].privateKey, provider);

  for (const [role, account] of Object.entries(accounts.roles)) {
    const amount = amountFor(role);
    const balance = await provider.getBalance(account.address);
    if (balance >= amount) {
      console.log(`${role}: already has ${formatEther(balance)} ${net.currency}`);
      continue;
    }
    const tx = await deployer.sendTransaction({
      to: account.address,
      value: amount - balance,
    });
    await tx.wait();
    console.log(`${role}: topped up to ${formatEther(amount)} ${net.currency} (${tx.hash})`);
  }
}

main().catch((error) => {
  console.error(error.shortMessage || error);
  process.exit(1);
});
