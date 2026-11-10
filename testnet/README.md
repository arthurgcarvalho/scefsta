# Running SCeFSTA on public testnets

Scripts for deploying the `Accounts` and `Auctions` contracts
(`../truffle/contracts`) to the testnets of the three networks evaluated in the
paper, and for running the Dapp on one machine against those deployments.

| Network | Testnet | Chain ID | Gas token |
| --- | --- | --- | --- |
| Ethereum | Sepolia | 11155111 | ETH |
| Polygon | Amoy | 80002 | POL |
| Avalanche | Fuji (C-Chain) | 43113 | AVAX |

Requires Node.js 22.5 or newer (the local backend uses the built-in
`node:sqlite`). Run everything below from this `testnet` folder.

```bash
npm install
```

## 1. Accounts

```bash
node accounts.js
```

Creates `accounts.json` (git-ignored) with one deployer per network and four
role accounts shared by all networks: `initiator` (transportation hirer),
`transport1` / `transport2` (transportation providers) and `facility`
(delivery verifier). To use an existing key as a deployer, pass it the first
time, e.g. `SEPOLIA_DEPLOYER_KEY=<hex key> node accounts.js`.

**These are throw-away testnet keys. Never fund them with real assets.**

`node balances.js` shows what every account holds on every network.

## 2. Test funds

Each deployer needs gas money on its own network. Faucets as of November 2026:

| Network | Faucet | Notes |
| --- | --- | --- |
| Sepolia | any Sepolia faucet | — |
| Amoy | https://faucet.polygon.technology | used here: 1 POL per claim; sign-in with GitHub or X |
| Amoy | https://www.alchemy.com/faucets/polygon-amoy | 0.1 POL; wallet must hold 0.001 ETH on mainnet |
| Fuji | https://faucet.zalalena.com/avalanche | used here: 0.005 AVAX; captcha only |
| Fuji | https://build.avax.network/console/primary-network/faucet | needs a Builder Hub account |

Rough needs: Sepolia and Fuji a negligible amount (gas there is nearly free);
Amoy about 0.37 POL at 30 gwei (deployment 0.18 POL, role funding 0.19 POL, of
which one end-to-end run burns about 0.13 POL).

## 3. Test locally (optional, no funds needed)

```bash
node local-test.js
```

Runs the contracts' unit tests on an in-memory chain where time can be moved
forward instantly: lowest revealed bid wins, single penalty deposit, deposit
refunds, on-time and late payouts, reclaim after the due date.

## 4. Deploy

```bash
node deploy.js sepolia
node deploy.js amoy
node deploy.js fuji
```

Compiles with solc 0.8.21 (optimizer off, as in the Truffle config), deploys
`Accounts` then `Auctions`, and records the addresses in `deployments.json` and
`../project_code/deployments.json` (earlier addresses on the same network are
kept under `previous`). It also regenerates `../project_code/contractAbis.json`,
the ABIs the web app uses. The deployer becomes the contracts' `superAdmin`.

## 5. Check the contracts end to end

```bash
node fund-roles.js <network>
node e2e.js <network>
```

`fund-roles.js` tops the role accounts up from the deployer (amounts per
network are in `networks.js`). `e2e.js` registers the roles, then runs four
tenders through every contract function: lowest bid wins and is delivered on
time, a job that is never delivered and gets reclaimed, a retracted tender, and
a late delivery. It checks every payout and deposit refund, confirms the
contract holds nothing from the run at the end, and prints the gas used per
call. It takes about four minutes, refuses to start if a role account is low
on funds, and finishes by running `sync-db.js`, which gives the tenders and
role accounts it created matching rows in the Dapp's local database.

## 6. Run the Dapp

```bash
node app-env.js <network>              # use MetaMask
node app-env.js <network> --dev-wallet # no MetaMask: in-page test wallet
node run.js backend                    # http://localhost:5001
node run.js frontend                   # http://localhost:3000
```

`app-env.js` writes `../project_code/.env.local` and `../backend-api/.env`.
Restart both servers after switching networks. First install the app's own
dependencies once: `npm ci` in `../project_code` and in `../backend-api`.

* **MetaMask mode** – import the keys from `accounts.json` into MetaMask and
  select the matching testnet; the landing page offers a "Switch to …" button
  if the wallet is on another chain.
* **Dev-wallet mode** – `project_code/devWallet.js` injects a stand-in for
  MetaMask that signs with the keys from `accounts.json`; a small panel in the
  bottom-left corner switches between accounts. Meant for local testing and
  automated browser runs only: the keys are embedded in the local dev bundle.

The backend keeps its data in
`../backend-api/data/ais-<network>-<start of the Auctions address>.sqlite`,
created on first start with the deployer as the only user (an admin). Each
deployment gets its own file because tender ids on chain and patient ids in
the database must stay in step; redeploying therefore starts from an empty
database automatically. Set `DB_DRIVER=mysql` (and `DB_HOST`, …) to use the
original MySQL server instead.
