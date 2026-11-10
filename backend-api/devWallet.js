// Server side of the dev wallet (see ../project_code/devWallet.js): signs and
// sends transactions for the test accounts, so their private keys stay on the
// server and never reach the browser.
//
// Enabled only when DEV_WALLET_KEYS is set ("label:privateKey,label:privateKey";
// locally from backend-api/.env, on Cloud Run from Secret Manager).
//
// Whoever can reach this API can act as any of those accounts, which is the
// point of the dev wallet. What it will sign is therefore narrow:
//   * only transactions to the Accounts and Auctions contracts of the
//     deployment this server is configured for (no plain transfers, no other
//     contracts, no contract creation, no message signing);
//   * at most DEV_WALLET_MAX_VALUE_WEI attached to one transaction
//     (default 0.01 of the native token).
const { ethers } = require("ethers");
const { currentDeployment } = require("./db");

function parseKeys(spec) {
  return (spec || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, privateKey] = entry.split(":");
      return { label, privateKey };
    });
}

function registerDevWallet(app) {
  const keys = parseKeys(process.env.DEV_WALLET_KEYS);
  if (!keys.length) return;
  const deployment = currentDeployment();
  if (!deployment) {
    console.error("Dev wallet: no deployment found for this network; not enabled");
    return;
  }

  const provider = new ethers.JsonRpcProvider(deployment.rpcUrl, deployment.chainId, {
    staticNetwork: true,
  });
  const accounts = keys.map(({ label, privateKey }) => ({
    label,
    wallet: new ethers.Wallet(privateKey, provider),
    // transactions of one account are sent one after another, so that each
    // picks up the nonce after the previous one
    queue: Promise.resolve(),
  }));
  const targets = [deployment.accountsAddress, deployment.auctionsAddress].map(
    (address) => address.toLowerCase()
  );
  const maxValue = BigInt(process.env.DEV_WALLET_MAX_VALUE_WEI || 10n ** 16n);

  app.get("/api/dev-wallet/accounts", (req, res) => {
    res.json(
      accounts.map(({ label, wallet }) => ({ label, address: wallet.address }))
    );
  });

  app.post("/api/dev-wallet/send", async (req, res) => {
    const { from, to, data, value, gas } = req.body || {};
    const fail = (message) => res.status(400).json({ error: message });

    const account = accounts.find(
      ({ wallet }) => wallet.address.toLowerCase() === String(from).toLowerCase()
    );
    if (!account) return fail("Not a dev-wallet account");
    if (!to || !targets.includes(String(to).toLowerCase())) {
      return fail("The dev wallet only sends to this deployment's contracts");
    }
    let request;
    try {
      request = { to, data: ethers.hexlify(data || "0x") };
      if (request.data === "0x") return fail("Missing transaction data");
      request.value = value === undefined ? 0n : BigInt(value);
      if (gas !== undefined) request.gasLimit = BigInt(gas);
    } catch (error) {
      return fail("Malformed transaction");
    }
    if (request.value > maxValue) {
      return fail(`Value above the dev wallet's limit of ${maxValue} wei`);
    }

    const sending = account.queue.then(() => account.wallet.sendTransaction(request));
    account.queue = sending.catch(() => {});
    try {
      const sent = await sending;
      console.log(`Dev wallet: ${account.label} sent ${sent.hash}`);
      res.json({ hash: sent.hash });
    } catch (error) {
      fail(error.reason || error.shortMessage || error.message);
    }
  });

  console.log(
    `Dev wallet signer enabled for ${accounts.length} account(s) on ${deployment.network || "this network"}`
  );
}

module.exports = { registerDevWallet };
