// Development-only wallet for local testing WITHOUT MetaMask.
//
// When NEXT_PUBLIC_DEV_WALLET=1 this installs an EIP-1193 provider as
// window.ethereum that signs with the TESTNET keys listed in
// NEXT_PUBLIC_DEV_WALLET_ACCOUNTS ("label:privateKey,label:privateKey") and
// broadcasts through the network's public RPC. It lets every role in the app
// (admin, initiator, transport, facility) be exercised from one browser tab,
// including by automated browser tests, with no extension pop-ups.
//
// It is never installed unless the flag is set, and it must only ever be given
// throw-away testnet keys: the keys end up in the browser bundle.
import { Wallet, providers, utils, BigNumber } from "ethers";

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
      const [label, privateKey] = entry.split(":");
      return { label, privateKey };
    });
}

export function installDevWallet({ chainId, rpcUrl, networkLabel, accounts }) {
  if (typeof window === "undefined") return;
  if (window.ethereum && window.ethereum.isDevWallet) return;
  if (!accounts.length) {
    console.warn("[dev wallet] no accounts configured; not installing");
    return;
  }

  const rpc = new providers.StaticJsonRpcProvider(rpcUrl, chainId);
  const wallets = accounts.map(({ label, privateKey }) => ({
    label,
    wallet: new Wallet(privateKey, rpc),
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

  async function sendTransaction(tx) {
    const wallet = current();
    if (tx.from && tx.from.toLowerCase() !== wallet.address.toLowerCase()) {
      throw rpcError(4100, "Transaction 'from' is not the selected dev-wallet account");
    }

    const request = { to: tx.to, data: tx.data || tx.input };
    if (tx.value !== undefined) request.value = BigNumber.from(tx.value);
    const gas = tx.gas !== undefined ? tx.gas : tx.gasLimit;
    if (gas !== undefined) request.gasLimit = BigNumber.from(gas);
    if (tx.nonce !== undefined) request.nonce = BigNumber.from(tx.nonce).toNumber();

    // Ask the node for the tip instead of using ethers' fixed 1.5 gwei, which
    // is below the minimum accepted on Polygon.
    const [block, tip] = await Promise.all([
      rpc.getBlock("latest"),
      rpc.send("eth_maxPriorityFeePerGas", []).catch(() => null),
    ]);
    if (block.baseFeePerGas && tip) {
      request.type = 2;
      request.maxPriorityFeePerGas = BigNumber.from(tip);
      request.maxFeePerGas = block.baseFeePerGas.mul(2).add(tip);
    } else {
      request.gasPrice = await rpc.getGasPrice();
    }

    setStatus("Signing and sending transaction…");
    try {
      const sent = await wallet.sendTransaction(request);
      setStatus(`Sent ${sent.hash.slice(0, 12)}… waiting to be mined`);
      sent
        .wait()
        .then((receipt) =>
          setStatus(
            `${receipt.status === 1 ? "Mined" : "REVERTED"} ${sent.hash.slice(0, 12)}… in block ${receipt.blockNumber}`
          )
        )
        .catch((error) => setStatus(`Failed ${sent.hash.slice(0, 12)}…: ${error.reason || error.message}`));
      return sent.hash;
    } catch (error) {
      setStatus(`Rejected: ${error.reason || error.message}`);
      throw error;
    }
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
        return current().signMessage(utils.arrayify(params[0]));
      case "eth_sign":
        return current().signMessage(utils.arrayify(params[1]));
      case "eth_signTypedData_v4": {
        const typed = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
        const types = { ...typed.types };
        delete types.EIP712Domain;
        return current()._signTypedData(typed.domain, types, typed.message);
      }
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
    title.textContent = `Dev wallet · ${networkLabel} · testnet keys only`;
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
