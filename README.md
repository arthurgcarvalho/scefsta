# SCeFSTA

**Smart Contract enabled Fair, Secure, and Transparent Auction**: the
decentralized application and smart contracts presented in the paper

> *FATE: Fair, Affordable, Transparent, and Efficient Blockchain-Based
> Solutions for Healthcare Transportation*

This repository is the technical companion to that paper. The paper derives
four design requirements for healthcare transportation services (fairness,
affordability, transparency, efficiency), turns them into three design
principles, and demonstrates them with an artifact. The artifact is here: two
Solidity contracts that run first-price sealed-bid reverse auctions for
transportation jobs and hold the payment in escrow, a web DApp for the four
user roles, the tests, and the material behind the cost analysis.

This page covers what the paper has no room for: where the contracts are
deployed, the exact rules they enforce, how the paper's terms map to the code,
and how to run and check everything yourself.

Research prototype. It runs on test networks only, has not been audited, and
must not be used with funds of any value.

## Deployed contracts

The same source is deployed on the public test networks of the three
blockchains evaluated in the paper. Current deployment: 12 November 2026.

| Network | Chain ID | Contract | Address | Deployed in |
| --- | --- | --- | --- | --- |
| Ethereum Sepolia | 11155111 | Accounts | [`0xEF2486576172193Ae9a407ee2A7d8424E8c1B615`](https://sepolia.etherscan.io/address/0xEF2486576172193Ae9a407ee2A7d8424E8c1B615) | [block 12120712](https://sepolia.etherscan.io/tx/0x79c5f8e7a2f3be73a04480b1d55a8084c14b5c7080636edbe8176c5aeb484877) |
| Ethereum Sepolia | 11155111 | Auctions | [`0x617435AB5aDb401E2BCb90F7Ff06e8785Ed67f92`](https://sepolia.etherscan.io/address/0x617435AB5aDb401E2BCb90F7Ff06e8785Ed67f92) | [block 12120714](https://sepolia.etherscan.io/tx/0x6ba5fb0ff97437dc00ccc3993dc47ec485cf05437df5ad9ce90d368d854ed670) |
| Polygon Amoy | 80002 | Accounts | [`0x6826734bCB9eA591Eb7018f30B8ce2f5a470a1F4`](https://amoy.polygonscan.com/address/0x6826734bCB9eA591Eb7018f30B8ce2f5a470a1F4) | [block 52687914](https://amoy.polygonscan.com/tx/0xc999ab501a7402671ba3d0c45b26851a43d07b5c55372547f30e960e74f19299) |
| Polygon Amoy | 80002 | Auctions | [`0xa67993678d19753F8fDa84159887D492e8041BCB`](https://amoy.polygonscan.com/address/0xa67993678d19753F8fDa84159887D492e8041BCB) | [block 52687918](https://amoy.polygonscan.com/tx/0xdddcbfdd3ef36fb73a9588ddc02656755f8ba461ff6b87e74771774ad7fc0e54) |
| Avalanche Fuji (C-Chain) | 43113 | Accounts | [`0x761A33762092E51f2CdaaF9A34543dD24EFD11D3`](https://testnet.snowtrace.io/address/0x761A33762092E51f2CdaaF9A34543dD24EFD11D3) | [block 60960933](https://testnet.snowtrace.io/tx/0x08fc31ca527cf8e6346e3f30ca1a34a7741f89c8ff1a52e43725084d9e88a168) |
| Avalanche Fuji (C-Chain) | 43113 | Auctions | [`0xA8e64e2568F0088d73209148a4D6462f0b6ED094`](https://testnet.snowtrace.io/address/0xA8e64e2568F0088d73209148a4D6462f0b6ED094) | [block 60960937](https://testnet.snowtrace.io/tx/0x0add5de8d0a3fc8a82a75f867fb640a1ef61fd71d8663922720de8dd22715589) |

* **Source:** [`truffle/contracts/Accounts.sol`](truffle/contracts/Accounts.sol)
  and [`truffle/contracts/Auctions.sol`](truffle/contracts/Auctions.sol),
  compiled with solc 0.8.21, optimizer off, EVM version `shanghai`. Each
  `Auctions` contract was constructed with the address of the `Accounts`
  contract on the same network.
* **Administrator:** the deploying address is the `superAdmin` of its network:
  `0xbdB61Ada027eF27ef0709D3848Db1Dd13c96F970` (Sepolia),
  `0x5cb5775931f5820e63D28B6d3f403a2120421969` (Amoy),
  `0x8ce4a9D2cc66003a89047fF14BA8F231528fDB16` (Fuji).
* **Machine-readable copy:** [`testnet/deployments.json`](testnet/deployments.json),
  with the transaction hashes. Its `previous` entries are superseded
  deployments that ran earlier versions of the rules; do not use them.
* **Checking the code at an address:** the executable code at all six
  addresses was compared with the compiler output of this source (12 November
  2026) and is identical. To repeat the check, run `node compile.js` in
  [`testnet`](testnet) and compare `deployedBytecode` in
  `testnet/build/<Contract>.json` with what the network returns for
  `eth_getCode`. Leave out the last 53 bytes: they are a hash of the source
  text that the compiler appends, and it changes with the line endings of the
  checkout (LF or CRLF), not with the code.

## From the paper to the code

The code was started before the paper's vocabulary settled, so some names
differ. The contracts keep the original names; the DApp shows the newer ones.

| In the paper | In this repository |
| --- | --- |
| Transportation hirer | `initiator` (older code also says "police"): `Accounts.addInitiator`, page `/initiator` |
| Transportation provider | `ambulance` in the contracts, "transport" in the DApp: `Accounts.addAmbulance`, page `/transport` |
| Delivery verifier | `hospital` in the contracts, "facility" in the DApp: `Accounts.addHospital`, page `/facility` |
| System administrator | `admin`; the deployer is the `superAdmin`: page `/admin` |
| Roles kept in a smart contract, the wallet address as identity | [`Accounts.sol`](truffle/contracts/Accounts.sol). The DApp asks it for the role of the connected address and shows the matching dashboard |
| Job (tender) and its escrow | `Auctions.postTender`, payable: the amount sent is the maximum price and stays in the contract until the tender is settled |
| Sealed bid: a hash of the bid and a secret nonce | `Auctions.secretBid`, with the commitment computed as in `Auctions.commitmentOf` |
| Revealing bids, validating them against the hashes | `Auctions.revealBid` |
| The lowest bid wins | `Auctions.determineWinner` |
| Delivery confirmation and immediate payment | `Auctions.verifyDelivery` |
| Late and missed deliveries | `deliveryDate` next to `dueDate` in each tender; `Auctions.reclaimTender` |
| Design principle #1, automated contract enforcement | The escrow and payout rules in [`Auctions.sol`](truffle/contracts/Auctions.sol): a tender's funds can only go to the winning provider or back to the hirer |
| Design principle #2, decentralized storage and computations | Every tender, commitment, revealed bid, winner and delivery time is contract state that anyone can read (`getAllTenders`, `bids`, `getFailedReveals`) |
| Design principle #3, auction-based dispatching | The commit-reveal auction described in the next section |
| Screens in the Demonstration section | [`project_code/pages`](project_code/pages): landing page (wallet connection), `/admin`, `/initiator`, `/transport`, `/facility` |
| Cost analysis (Table 6) | [`foundry/test/AuctionGas.t.sol`](foundry/test/AuctionGas.t.sol), [`AccountGas.t.sol`](foundry/test/AccountGas.t.sol) and [`plots`](plots); see [Cost analysis](#cost-analysis) |

## Auction rules as implemented

A tender posted at block time `t0` has three deadlines, fixed by the hirer when
posting and unchangeable afterwards. Time is always the timestamp of the block
that includes the transaction.

```
t0                      tc                      tr                      due
|---- commit phase -----|---- reveal phase -----|--- delivery window ---|
  secretBid               revealBid               determineWinner (anyone)
  retractTender (hirer)                           verifyDelivery (verifier)
                                                  reclaimTender (hirer, after due)
```

1. **Posting.** `postTender(timeLimit, revealTime, deliveryTime, …)` sets
   `tc = t0 + timeLimit`, `tr = tc + revealTime` and `due = tr + deliveryTime`.
   The amount sent with the call is the maximum price. The hirer lists the
   delivery verifiers allowed to confirm the delivery.
2. **Commit, while `t < tc`.** A registered provider that is not suspended
   submits one commitment per tender:
   `keccak256(abi.encode(tenderId, bidder, bid, nonce))` with a random 256-bit
   nonce. Because the commitment includes the bidder and the tender, a
   commitment copied from a rival, or reused from another tender, can never be
   opened. Nothing is paid or deposited with a bid.
3. **Reveal, while `tc <= t < tr`.** The bidder sends the bid and the nonce;
   the contract recomputes the commitment and rejects a mismatch. A bid must be
   below the maximum price. Revealing only records the bid.
4. **Winner determination, once `t >= tr`.** Anyone may call
   `determineWinner`, so no participant can stall an auction. The lowest
   revealed bid wins and equal bids go to the earlier commitment, so the
   result does not depend on the order of the reveals or on who makes the
   call. If no valid bid was revealed, the tender is closed as unawarded and
   the hirer is refunded.
5. **Failed reveals.** Every commitment left unopened is recorded against the
   provider's address at winner determination (`getFailedReveals`, event
   `RevealFailed`). A provider with `failedRevealLimit` failed reveals within
   `failedRevealWindow` is suspended from bidding for `suspensionPeriod`. The
   defaults are 3 failures, 30 days and 30 days; administrators change them
   with `setRevealPolicy`.
6. **Retraction.** The hirer can withdraw a tender only during the commit
   phase, not once bids are being revealed.
7. **Delivery.** A delivery verifier named in the tender calls
   `verifyDelivery`. The contract stores the confirmation time next to the due
   date, pays the winner its bid and returns the rest of the escrow to the
   hirer, all in the same transaction. A delivery confirmed after the due date
   is paid in full and stays on record as late (`deliveryDate > dueDate`).
8. **Missed delivery.** After the due date the hirer may call `reclaimTender`
   and take the escrow back. The tender stays in the public list as
   `Reclaimed`, with the provider's address and no delivery time.

No deposit and no monetary penalty is taken from bidders or winners. Failed
reveals, late deliveries and missed deliveries are instead recorded on chain
per provider, and the DApp's administrator page lists them.

| Outcome | Tender status | Winning provider receives | Hirer receives |
| --- | --- | --- | --- |
| Delivered, on time or late | `Closed` (0) | its bid | maximum price minus the bid |
| Retracted during the commit phase | `Retracted` (3) | n/a | maximum price |
| No valid bid revealed | `Unawarded` (5) | n/a | maximum price |
| Not delivered, reclaimed after the due date | `Reclaimed` (4) | nothing | maximum price |

The two remaining statuses are `Open` (2), from posting until winner
determination, and `InProgress` (1), from then until delivery or reclaim.

`Accounts` is the role registry. The `superAdmin` adds and removes
administrators; administrators add and remove hirers, providers and delivery
verifiers. A provider or an administrator holds no other role, while a
facility may be both a delivery verifier and a hirer (interfacility
transfers). The `superAdmin` holds every role, for demonstrations.

### What is stored where

| On chain, public | Off chain, in the DApp's database |
| --- | --- |
| The role of each address | User profiles: name, e-mail, organisation, postal address |
| Per tender: hirer, pick-up address (street, city, state, ZIP code), severity, allowed delivery verifiers, maximum price, the three deadlines, status | Patient records, keyed by tender id: name, gender, age, injuries, mechanism of injury |
| Per tender: bidders, their commitments and revealed bids, the winner and the winning bid, the delivery confirmation time | Each provider's own bid and nonce, saved when the bid is placed |
| Per provider: the time of every failed reveal, and the end of a suspension | |

All users, patients and addresses in the deployments above are made up.

## Repository layout

| Path | Contents |
| --- | --- |
| [`truffle/contracts`](truffle/contracts) | The two contracts. This is the source that is deployed |
| [`truffle/test`](truffle/test) | Truffle tests, including the latency measurements (`times.test.js`) |
| [`foundry`](foundry) | A copy of the contracts (`src`, kept identical to `truffle/contracts`) with Foundry unit tests and the gas-report tests |
| [`testnet`](testnet) | Scripts to compile, unit-test, deploy, check end to end and seed demo data on the three test networks; [`deployments.json`](testnet/deployments.json); [`DEPLOYMENT_REPORT.md`](testnet/DEPLOYMENT_REPORT.md), the full record of what was deployed and tested |
| [`project_code`](project_code) | The DApp: Next.js 11 and React 17, with useDApp and ethers.js for the contract calls |
| [`backend-api`](backend-api) | Express API over the off-chain database (SQLite by default, MySQL optional) |
| [`database-files`](database-files) | The original MySQL schema and its entity-relationship diagram |
| [`plots`](plots) | Gas reports, latency data and the plotting script behind the cost analysis |
| [`cloudrun`](cloudrun), [`Dockerfile`](Dockerfile) | The hosted demo on Google Cloud Run |
| [`README_docs`](README_docs) | Demo video |

## Trying it

### Hosted demo

https://scefsta-993855254741.us-central1.run.app runs the DApp against the
Sepolia contracts listed above. No wallet is needed: a panel in the bottom-left
corner switches between five test accounts (system administrator, hirer, two
providers, delivery verifier) and the server signs their transactions. The
first page can take about ten seconds to load, because the service sleeps when
idle.

The accounts are shared by everyone who opens the page and hold test ETH only,
and the tenders are made-up demo data that visitors can change. On this
deployment a suspension lasts one hour instead of the default 30 days, so that
a shared demo cannot be locked for a month.

### Video

[`README_docs/backup-demo.mp4`](README_docs/backup-demo.mp4) walks through the
interface. It was recorded in 2024, before the auction rules were revised, so
some forms differ from the current ones.

### Your own copy

Requires Node.js 22.5 or newer. The steps below deploy a fresh pair of
contracts under your own throw-away keys and run the DApp on your machine;
[`testnet/README.md`](testnet/README.md) explains each step, the faucets and
the MetaMask alternative.

```bash
cd project_code && npm ci && cd ../backend-api && npm ci && cd ../testnet && npm install

node accounts.js                    # creates throw-away keys in accounts.json (git-ignored)
# fund the deployer address it prints from a faucet of the chosen network
node deploy.js fuji                 # deploys Accounts, then Auctions; records the addresses
node fund-roles.js fuji             # gas money for the four role accounts
node e2e.js fuji                    # registers the roles and runs five tenders (about 7 minutes)
node seed-demo.js fuji              # optional: demo data for every dashboard

node app-env.js fuji --dev-wallet   # point the DApp and the API at this deployment
node run.js backend                 # http://localhost:5001
node run.js frontend                # http://localhost:3000
```

Use `sepolia` or `amoy` in place of `fuji` for the other networks. Fuji is the
most convenient: a block every second or two and negligible fees. Deploying
replaces the recorded addresses in your clone and moves the old ones to
`previous`.

If the frontend stops with an OpenSSL error, start it with
`NODE_OPTIONS=--openssl-legacy-provider` (`run.js` already sets it; Next.js 11
needs it on current Node versions). If it reports a full or stale cache, delete
`project_code/.next`.

## Tests and checks

| Suite | Command | What it covers | Status |
| --- | --- | --- | --- |
| Unit tests on an in-memory chain | `node local-test.js` in `testnet` | What a commitment binds, each deadline to the second, winner selection in any reveal order, ties, retraction, unawarded tenders, failed reveals and suspension, payouts, on-time and late delivery records, reclaim | 17 of 17 pass |
| End to end on a live network | `node e2e.js <network>` in `testnet` | Five tenders through every contract function, every payout checked to the wei, at least 12 calls that must be rejected, and the contract left holding nothing from the run | Passes on Sepolia, Amoy and Fuji (12 November 2026) |
| Foundry | `forge test` in `foundry` | Unit tests of both contracts, and the gas-report tests | Updated to the current rules, not re-run since |
| Truffle | `truffle test` in `truffle` | Unit tests and latency measurements | Updated to the current rules, not re-run since |

The first two suites need no tooling beyond Node.js and are the ones that were
run against the deployed version. The DApp's screens were also driven by hand
against the Fuji and Sepolia deployments; the steps and results are in
[`testnet/DEPLOYMENT_REPORT.md`](testnet/DEPLOYMENT_REPORT.md).

## Cost analysis

The paper's cost table is built from Foundry gas reports:

```bash
cd foundry
forge test --match-test testAuctionGasTimes --gas-report
forge test --match-test testAccountGasTimes --gas-report
```

The reports behind the table are kept in [`plots/static`](plots/static), and
those for increasing numbers of calls in [`plots/load`](plots/load). They were
produced with the contract version and compiler of the time (solc 0.8.15), and
a Foundry report gives the gas of the function's execution in a local EVM. The
paper converts gas to US dollars at the token prices in the table's caption.
[`plots/gas_time_plotter.py`](plots/gas_time_plotter.py) draws the figures:
`--static` and `--load` for gas reports, `--box` for the latency measurements
in [`plots/box`](plots/box), which `truffle/test/times.test.js` writes.

The figures below are a different measurement: gas of whole transactions, from
the receipts of the end-to-end runs on the deployed contracts (average per
call, 12 November 2026). They include the fixed cost of a transaction and
reflect the current rules, so they are not directly comparable with the
Foundry figures.

| Function | Sepolia | Amoy | Fuji |
| --- | ---: | ---: | ---: |
| `postTender` | 1,827,367 | 470,109 | 413,644 |
| `secretBid` | 334,075 | 132,515 | 102,553 |
| `revealBid` | 151,937 | 99,760 | 69,511 |
| `determineWinner`, two reveals | 170,284 | 102,888 | 73,488 |
| `determineWinner`, one reveal, one failed reveal with suspension | 511,350 | 195,690 | 151,170 |
| `determineWinner`, no bids (refund) | 53,188 | 68,608 | 49,288 |
| `verifyDelivery` | 179,818 | 129,514 | 96,514 |
| `reclaimTender` | 48,310 | 64,130 | 44,810 |
| `retractTender` | 46,151 | 58,611 | 42,651 |
| `setRevealPolicy` | 63,297 | 54,317 | 47,597 |
| Deploy `Accounts` | 13,232,067 | 1,922,209 | 1,905,409 |
| Deploy `Auctions` | 33,329,435 | 4,707,439 | 4,701,559 |

Fee = gas used × gas price, paid in the network's token. On the day of the
runs, fees on Sepolia and Fuji were a negligible fraction of a cent; on Amoy,
at 33 gwei, posting a tender cost about 0.016 POL and confirming a delivery
about 0.004 POL. In these runs Sepolia used far more gas than the other two
networks for calls that create contract storage. `determineWinner` loops over
a tender's bidders, so its cost grows with their number (about 115,000 gas for
ten revealed bids on a local chain).

## Limitations of the prototype

* **Bid storage in the demo backend.** So that a provider can reveal later
  from any browser, the DApp saves each bid and its nonce in the backend
  database, and the API that returns them asks for no sign-in. Secrecy of the
  bids therefore holds against observers of the blockchain, not against
  someone who queries this backend. A production client would keep the nonce
  in the provider's own wallet or device.
* **Late delivery or reclaim, whichever is mined first.** After the due date
  the hirer may reclaim and the verifier may still confirm. A late provider is
  paid only if the confirmation is included before a reclaim.
* **No automatic removal of providers.** Failed reveals lead to an automatic
  suspension; late and missed deliveries are only recorded. Removing a
  provider from the registry is an administrator's decision.
* **Timing follows block timestamps**, so deadlines are as precise as the
  network's block time (about 12 seconds on Sepolia, one to two seconds on
  Fuji and Amoy).
* **Payments are in the network's native token.** Stablecoin payments,
  discussed in the paper, are not implemented.
* **Centralized pieces of the demo.** The off-chain database and, in the
  hosted demo, the server-side signing for the shared test accounts are
  conveniences of the prototype. With MetaMask the DApp signs in the user's
  wallet and uses the backend only for profiles, patient records and the
  stored bids.

## History

* **2023 to 2024.** Original prototype: contracts, DApp, Foundry gas reports
  and latency measurements.
* **9 and 10 November 2026.** Deployed to Sepolia, Amoy and Fuji; the reveal
  and payout logic was corrected and the test and deployment scripts in
  `testnet` were added.
* **12 November 2026.** Auction rules aligned with the protocol and threat
  model described in the paper: commitments bound to tender and bidder, a
  reveal period set by the hirer, winner determination as a separate step
  open to anyone, recorded failed reveals with suspension, no deposits or
  penalties, and the delivery time recorded on chain. This is the version at
  the addresses above.

[`testnet/DEPLOYMENT_REPORT.md`](testnet/DEPLOYMENT_REPORT.md) has the details
of each step, including the superseded addresses.
