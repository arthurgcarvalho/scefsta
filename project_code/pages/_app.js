import "../styles/index.css";
import { DAppProvider, DEFAULT_SUPPORTED_CHAINS } from "@usedapp/core";
import {
  accounts_abi,
  auctions_abi,
  accountsAddress,
  auctionsAddress,
  DEPLOYMENT,
} from "../config";
import { Contract, utils } from "ethers";
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import "bootstrap/dist/css/bootstrap.min.css";
import { installDevWallet, parseDevAccounts } from "../devWallet";

// setup contract instances
export const ACCOUNT_ABI = new utils.Interface(accounts_abi);
export const AUCTION_ABI = new utils.Interface(auctions_abi);
export const ACCOUNT_INSTANCE = new Contract(accountsAddress, ACCOUNT_ABI);
export const AUCTION_INSTANCE = new Contract(auctionsAddress, AUCTION_ABI);

// The network is chosen by NEXT_PUBLIC_NETWORK (see ../config.js); everything
// below is derived from that network's entry in deployments.json.
export const CHAIN_ID = DEPLOYMENT.chainId;
export const NETWORK_LABEL = DEPLOYMENT.network;

// useDApp 1.2 predates some testnets (e.g. Polygon Amoy), so describe the
// selected chain ourselves when it is not in the built-in list.
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const knownChain = DEFAULT_SUPPORTED_CHAINS.find(
  (chain) => chain.chainId === CHAIN_ID
);
const selectedChain = knownChain || {
  chainId: CHAIN_ID,
  chainName: DEPLOYMENT.network,
  isTestChain: true,
  isLocalChain: false,
  multicallAddress: MULTICALL3_ADDRESS,
  rpcUrl: DEPLOYMENT.rpcUrl,
  blockExplorerUrl: DEPLOYMENT.explorer,
  nativeCurrency: {
    name: DEPLOYMENT.currency,
    symbol: DEPLOYMENT.currency,
    decimals: 18,
  },
  getExplorerAddressLink: (address) =>
    `${DEPLOYMENT.explorer}/address/${address}`,
  getExplorerTransactionLink: (hash) => `${DEPLOYMENT.explorer}/tx/${hash}`,
};

// Optional MetaMask stand-in for local testing; see ../devWallet.js.
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_DEV_WALLET === "1"
) {
  installDevWallet({
    chainId: CHAIN_ID,
    rpcUrl: DEPLOYMENT.rpcUrl,
    // the backend API holds the test keys and signs (backend-api/devWallet.js)
    signerUrl:
      (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001") +
      "/api/dev-wallet/send",
    networkLabel: NETWORK_LABEL,
    accounts: parseDevAccounts(process.env.NEXT_PUBLIC_DEV_WALLET_ACCOUNTS),
  });
}

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }) {
  const config = {
    readOnlyChainId: CHAIN_ID,
    readOnlyUrls: {
      [CHAIN_ID]: DEPLOYMENT.rpcUrl,
    },
    networks: knownChain
      ? DEFAULT_SUPPORTED_CHAINS
      : [...DEFAULT_SUPPORTED_CHAINS, selectedChain],
  };

  return (
    // DAppProvider uses useDapp framework, Web3ReactProvider and MetaMaskProvider
    // support connecting to metamask
    <DAppProvider config={config}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Component {...pageProps} />
      </LocalizationProvider>
    </DAppProvider>
  );
}
