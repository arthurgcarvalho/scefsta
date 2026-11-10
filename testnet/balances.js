// Prints the native-token balance of every account in accounts.json on every
// testnet:  node balances.js [network ...]
const { JsonRpcProvider, formatEther } = require("ethers");
const { networks, getNetwork } = require("./networks");
const { loadAccounts } = require("./accounts");

async function main() {
  const names = process.argv.slice(2).length
    ? process.argv.slice(2)
    : Object.keys(networks);
  const accounts = loadAccounts();

  for (const name of names) {
    const net = getNetwork(name);
    const provider = new JsonRpcProvider(net.rpcUrl, net.chainId, {
      staticNetwork: true,
    });
    console.log(`\n${net.label} (chainId ${net.chainId})`);
    const rows = [
      [`deployer`, accounts.deployers[name]],
      ...Object.entries(accounts.roles),
    ];
    for (const [label, account] of rows) {
      if (!account) continue;
      try {
        const balance = await provider.getBalance(account.address);
        console.log(
          `  ${label.padEnd(11)} ${account.address}  ${formatEther(balance)} ${net.currency}`
        );
      } catch (error) {
        console.log(`  ${label.padEnd(11)} ${account.address}  error: ${error.shortMessage || error.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
