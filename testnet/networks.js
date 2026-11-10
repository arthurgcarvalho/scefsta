// Public testnets that mirror the three networks evaluated in the paper
// (Ethereum, Polygon, Avalanche). RPC URLs are public endpoints and can be
// overridden with <NAME>_RPC_URL environment variables, e.g. SEPOLIA_RPC_URL.
const networks = {
  sepolia: {
    label: "Ethereum Sepolia",
    chainId: 11155111,
    currency: "ETH",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    // native tokens each role account gets from fund-roles.js
    roleFunding: { default: "0.05" },
  },
  amoy: {
    label: "Polygon Amoy",
    chainId: 80002,
    currency: "POL",
    rpcUrl: "https://polygon-amoy-bor-rpc.publicnode.com",
    explorer: "https://amoy.polygonscan.com",
    // gas is ~30 gwei here: a full e2e run costs the hirer ~0.06 POL and each
    // provider ~0.027 POL
    roleFunding: { default: "0.04", initiator: "0.09", facility: "0.02" },
  },
  fuji: {
    label: "Avalanche Fuji (C-Chain)",
    chainId: 43113,
    currency: "AVAX",
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorer: "https://testnet.snowtrace.io",
    roleFunding: { default: "0.0005" },
  },
};

for (const [name, net] of Object.entries(networks)) {
  const override = process.env[`${name.toUpperCase()}_RPC_URL`];
  if (override) net.rpcUrl = override;
}

function getNetwork(name) {
  const net = networks[name];
  if (!net) {
    throw new Error(
      `Unknown network "${name}". Use one of: ${Object.keys(networks).join(", ")}`
    );
  }
  return { name, ...net };
}

module.exports = { networks, getNetwork };
