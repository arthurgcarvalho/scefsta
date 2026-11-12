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
Amoy about 0.4 POL at 33 gwei (deployment 0.22 POL, role funding up to 0.19
POL, of which one end-to-end run burns about 0.13 POL).

## 3. Test locally (optional, no funds needed)

```bash
node local-test.js
```

Runs the contracts' unit tests on an in-memory chain where time can be moved
forward instantly: what a sealed bid's commitment binds, the commit / reveal /
winner-determination deadlines to the second, lowest revealed bid wins whatever
the order of the reveals, retraction only before the commit deadline, the
record of failed reveals and the suspension it leads to, payouts, the
confirmation time recorded for on-time and late deliveries, reclaim after the
due date.

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
network are in `networks.js`). `e2e.js` registers the roles, then runs five
tenders through every contract function: lowest bid wins (winner determination
triggered by a bystander) and is delivered on time, a bid that is never
revealed (recorded, and the provider suspended from bidding), a job that is
never delivered and gets reclaimed, a tender retracted during bidding, a late
delivery, and a tender nobody bids on. It checks the deadlines, every payout,
that the contract records when each delivery was confirmed (before the due date
for the on-time one, after it for the late one, and none for the reclaimed
job), confirms the contract holds nothing from the run at the end, and prints
the gas used per call. For the length of the run it sets a strict reveal policy (one
failed reveal suspends for a minute or less) and restores the previous one
afterwards; each run leaves one failed reveal on `transport2`'s record. It
takes about seven minutes, refuses to start if a role account is low on funds,
and finishes by running `sync-db.js`, which gives the tenders and role accounts
it created matching rows in the Dapp's local database.

To give every dashboard of the Dapp something to show, fill the deployment
with demo data afterwards:

```bash
node seed-demo.js <network>
```

It registers a few extra facilities, transport providers and initiators, posts
tenders that stay open for weeks (some with sealed bids from the two transport
accounts), runs some auctions to "in progress" with delivery dates weeks away,
delivers two, and writes the matching patient records and bid nonces to the
local database. Addresses, organisations, injuries and amounts are made up at
random (`sample-data.js`). It also sets a reveal policy suited to a shared demo
(three failed reveals within 30 days suspend a provider for one hour; the
contract's own default suspension is 30 days). Admins can change the policy on
the Admin page, under Transports.

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
  MetaMask; a small panel in the bottom-left corner switches between the test
  accounts. The page holds only their addresses: transactions are signed by
  the backend API (`backend-api/devWallet.js`) with the keys from
  `accounts.json`, which `app-env.js` writes to `backend-api/.env`. The
  backend signs only calls to this deployment's two contracts. Meant for
  testing with throw-away accounts: whoever can reach the app can act as them.

The backend keeps its data in
`../backend-api/data/ais-<network>-<start of the Auctions address>.sqlite`,
created on first start with the deployer as the only user (an admin). Each
deployment gets its own file because tender ids on chain and patient ids in
the database must stay in step; redeploying therefore starts from an empty
database automatically. Set `DB_DRIVER=mysql` (and `DB_HOST`, …) to use the
original MySQL server instead.
