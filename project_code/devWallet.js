// Development-only wallet for testing WITHOUT MetaMask.
//
// When NEXT_PUBLIC_DEV_WALLET=1 this installs an EIP-1193 provider as
// window.ethereum for the TEST accounts listed in
// NEXT_PUBLIC_DEV_WALLET_ACCOUNTS ("label:address,label:address"). It lets
// every role in the app (admin, initiator, transport, facility) be exercised
// from one browser tab, including by automated browser tests, with no
// extension pop-ups.
//
// The page never holds a private key. Transactions are handed to the backend
// API (backend-api/devWallet.js), which holds the keys, signs and broadcasts
// them, and only for this deployment's contracts. Everything else (reads, gas
// estimates, receipts) goes straight to the network's public RPC.
//
// It is never installed unless the flag is set, and must only ever be used
// with throw-away testnet accounts: whoever can open the app can act as them.
import { providers, utils } from "ethers";

const STORAGE_KEY = "scefsta-dev-wallet";

function loadState() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // storage unavailable: selection just won't survive a reload
  }
}

export function parseDevAccounts(spec) {
  return (spec || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, address] = entry.split(":");
      return { label, address: utils.getAddress(address) };
    });
}

export function installDevWallet({
  chainId,
  rpcUrl,
  signerUrl,
  networkLabel,
  accounts,
}) {
  if (typeof window === "undefined") return;
  if (window.ethereum && window.ethereum.isDevWallet) return;
  if (!accounts.length) {
    console.warn("[dev wallet] no accounts configured; not installing");
    return;
  }

  const rpc = new providers.StaticJsonRpcProvider(rpcUrl, chainId);
  const wallets = accounts.map(({ label, address }) => ({
    label,
    wallet: { address },
  }));

  const state = loadState();
  let selected = wallets[state.selected] ? state.selected : 0;
  let connected = Boolean(state.connected);
  const listeners = {};
  let statusEl = null;
  let toastEl = null;

  const current = () => wallets[selected].wallet;
  const persist = () => saveState({ selected, connected });
  const setStatus = (text) => {
    console.log("[dev wallet]", text);
    if (statusEl) statusEl.textContent = text;
  };
  const emit = (event, payload) => {
    (listeners[event] || []).slice().forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error("[dev wallet] listener error", error);
      }
    });
  };
  const rpcError = (code, message) => Object.assign(new Error(message), { code });

  // The backend signs and broadcasts; it answers with the transaction hash
  async function sendTransaction(tx) {
    const wallet = current();
    if (tx.from && tx.from.toLowerCase() !== wallet.address.toLowerCase()) {
      throw rpcError(4100, "Transaction 'from' is not the selected dev-wallet account");
    }

    const body = { from: wallet.address, to: tx.to, data: tx.data || tx.input };
    if (tx.value !== undefined) body.value = utils.hexValue(tx.value);
    const gas = tx.gas !== undefined ? tx.gas : tx.gasLimit;
    if (gas !== undefined) body.gas = utils.hexValue(gas);

    setStatus("Signing and sending transaction…");
    let hash;
    try {
      const response = await fetch(signerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = await response.json().catch(() => ({}));
      if (!response.ok || !answer.hash) {
        throw new Error(
          answer.error || `The signing service answered ${response.status}`
        );
      }
      hash = answer.hash;
    } catch (error) {
      setStatus(`Rejected: ${error.message}`);
      throw rpcError(-32000, error.message);
    }

    setStatus(`Sent ${hash.slice(0, 12)}… waiting to be mined`);
    rpc
      .waitForTransaction(hash)
      .then((receipt) =>
        setStatus(
          `${receipt.status === 1 ? "Mined" : "REVERTED"} ${hash.slice(0, 12)}… in block ${receipt.blockNumber}`
        )
      )
      .catch((error) => setStatus(`Failed ${hash.slice(0, 12)}…: ${error.reason || error.message}`));
    return hash;
  }

  async function request({ method, params = [] }) {
    switch (method) {
      case "eth_requestAccounts":
        if (!connected) {
          connected = true;
          persist();
          emit("connect", { chainId: utils.hexValue(chainId) });
        }
        return [current().address];
      case "eth_accounts":
        return connected ? [current().address] : [];
      case "eth_chainId":
        return utils.hexValue(chainId);
      case "net_version":
        return String(chainId);
      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "wallet_addEthereumChain":
        return null;
      case "wallet_switchEthereumChain":
        if (parseInt(params[0].chainId, 16) === chainId) return null;
        throw rpcError(4902, `The dev wallet only serves chain ${chainId}`);
      case "eth_sendTransaction":
        return sendTransaction(params[0]);
      case "personal_sign":
      case "eth_sign":
      case "eth_signTypedData_v4":
        // the app never signs messages, so the signing service does not either
        throw rpcError(4200, "The dev wallet does not sign messages");
      default:
        return rpc.send(method, params);
    }
  }

  const provider = {
    isDevWallet: true,
    // usedapp / MetaMask onboarding look for this flag on the injected provider
    isMetaMask: true,
    request,
    on(event, listener) {
      (listeners[event] = listeners[event] || []).push(listener);
      return provider;
    },
    removeListener(event, listener) {
      listeners[event] = (listeners[event] || []).filter((l) => l !== listener);
      return provider;
    },
    selectAccount(index) {
      if (!wallets[index]) throw new Error(`No dev-wallet account #${index}`);
      selected = index;
      persist();
      const select = document.getElementById("dev-wallet-account");
      if (select) select.value = String(index);
      if (connected) emit("accountsChanged", [current().address]);
      return current().address;
    },
    accounts: () => wallets.map(({ label, wallet }) => ({ label, address: wallet.address })),
  };
  provider.off = provider.removeListener;
  provider.addListener = provider.on;
  window.ethereum = provider;

  // The app reports several outcomes with alert(); blocking dialogs stall
  // automated browser runs, so in dev-wallet mode they become on-page toasts.
  window.alert = (message) => {
    console.log("[alert]", message);
    if (!toastEl) return;
    const toast = document.createElement("div");
    toast.textContent = String(message);
    toast.setAttribute("role", "alert");
    toast.style.cssText =
      "background:#1a588c;color:#fff;padding:8px 12px;margin-top:6px;border-radius:6px;font-size:13px;max-width:320px";
    toastEl.appendChild(toast);
    window.setTimeout(() => toast.remove(), 15000);
  };

  function mountPanel() {
    if (document.getElementById("dev-wallet-panel")) return;
    const panel = document.createElement("div");
    panel.id = "dev-wallet-panel";
    panel.style.cssText =
      "position:fixed;left:12px;bottom:12px;z-index:100000;background:#fff8e1;border:1px solid #f0b400;" +
      "border-radius:8px;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;color:#222;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.25);max-width:340px";

    const title = document.createElement("div");
    title.textContent = `Dev wallet · ${networkLabel} · test accounts only`;
    title.style.cssText = "font-weight:600;margin-bottom:4px";

    const select = document.createElement("select");
    select.id = "dev-wallet-account";
    select.setAttribute("aria-label", "Dev wallet account");
    select.style.cssText = "width:100%;font:inherit;padding:2px";
    wallets.forEach(({ label, wallet }, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${label} — ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
      select.appendChild(option);
    });
    select.value = String(selected);
    select.addEventListener("change", () => provider.selectAccount(Number(select.value)));

    statusEl = document.createElement("div");
    statusEl.id = "dev-wallet-status";
    statusEl.style.cssText = "margin-top:4px;color:#555;word-break:break-all";
    statusEl.textContent = "Ready";

    toastEl = document.createElement("div");
    toastEl.id = "dev-wallet-toasts";

    panel.append(title, select, statusEl, toastEl);
    document.body.appendChild(panel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPanel);
  } else {
    mountPanel();
  }

  console.log(
    `[dev wallet] installed for ${networkLabel} with ${wallets.length} account(s)`
  );
}
