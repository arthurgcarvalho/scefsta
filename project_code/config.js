// Contract addresses come from deployments.json, which is written by
// ../testnet/deploy.js. NEXT_PUBLIC_NETWORK selects the testnet the app talks
// to (sepolia | amoy | fuji); set it in .env.local (see ../testnet/README.md).
import deployments from "./deployments.json";
import contractAbis from "./contractAbis.json";

export const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "sepolia";
export const DEPLOYMENT = deployments[NETWORK];

if (!DEPLOYMENT) {
  throw new Error(
    `No deployment found for network "${NETWORK}". Deployed networks: ` +
      Object.keys(deployments).join(", ")
  );
}

// contract addresses for both contracts
export const accountsAddress = DEPLOYMENT.accountsAddress;
export const auctionsAddress = DEPLOYMENT.auctionsAddress;

// Contract ABIs, generated from ../truffle/contracts by ../testnet/compile.js
// (run automatically by deploy.js), so they always match the deployed code.
export const accounts_abi = contractAbis.Accounts;
export const auctions_abi = contractAbis.Auctions;
