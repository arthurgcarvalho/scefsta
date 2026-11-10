# Testnet deployment report — 9–10 November 2026

The contracts were deployed twice. The first deployment was the unmodified
source; it exposed the contract problems listed in "Contract fixes" below. The
second deployment, with those fixed, is the current one.

## Deployed contracts (current: fixed version)

| Network | Contract | Address |
| --- | --- | --- |
| Ethereum Sepolia | Accounts | [`0xc3CA7f0Aa0ED37612DcC548743EF6b3422d201Fc`](https://sepolia.etherscan.io/address/0xc3CA7f0Aa0ED37612DcC548743EF6b3422d201Fc) |
| Ethereum Sepolia | Auctions | [`0x38274122442B8bb4d9F685C8cDD9F239f7F7032c`](https://sepolia.etherscan.io/address/0x38274122442B8bb4d9F685C8cDD9F239f7F7032c) |
| Polygon Amoy | Accounts | [`0x000e505402B9EB8a041746bDd8fFFe9E72cA466e`](https://amoy.polygonscan.com/address/0x000e505402B9EB8a041746bDd8fFFe9E72cA466e) |
| Polygon Amoy | Auctions | [`0xa7b7d18Aa90e5135a21eF12E0e5389106490b202`](https://amoy.polygonscan.com/address/0xa7b7d18Aa90e5135a21eF12E0e5389106490b202) |
| Avalanche Fuji | Accounts | [`0xcf2e105F63275756d9dBB0c8183e113aEA18101E`](https://testnet.snowtrace.io/address/0xcf2e105F63275756d9dBB0c8183e113aEA18101E) |
| Avalanche Fuji | Auctions | [`0x9549d6EF5b36c83dbA8d77c4D0812164fA5082E1`](https://testnet.snowtrace.io/address/0x9549d6EF5b36c83dbA8d77c4D0812164fA5082E1) |

Source: `truffle/contracts/Accounts.sol` and `Auctions.sol`, compiled with solc
0.8.21 (optimizer off). `deployments.json` has the transaction hashes, block
numbers and, under `previous`, the superseded addresses.

Superseded first deployment (original, unfixed source — do not use):

| Network | Accounts | Auctions |
| --- | --- | --- |
| Sepolia | `0x4f34d6779619D2746184F032Bc65FfC2A25dB1E4` | `0x177e5Dd67287C68F331d6EdCE59F326b7043a498` |
| Amoy | `0x14b87ef914B81dABdfE25483C4f5a4Bfc5f4018c` | `0xC9d768e3c0977857746cC67DfD32a26299b3E6FC` |
| Fuji | `0x452a35eC100e4B4FD1E77f8f81B65d628382b0C0` | `0x7c476B1d85f83e7fE30AED5842be3fF251c9406b` |

## Accounts

Private keys are in [`accounts.json`](accounts.json) (git-ignored; testnet use only).

| Name | Address | Origin | Role |
| --- | --- | --- | --- |
| deployers.sepolia | `0xbdB61Ada027eF27ef0709D3848Db1Dd13c96F970` | supplied | superAdmin on Sepolia |
| deployers.amoy | `0x5cb5775931f5820e63D28B6d3f403a2120421969` | created | superAdmin on Amoy |
| deployers.fuji | `0x8ce4a9D2cc66003a89047fF14BA8F231528fDB16` | created | superAdmin on Fuji |
| roles.initiator | `0x3A2Da6ce572951f4B46EecBD3ec592b808f29053` | created | transportation hirer |
| roles.transport1 | `0xDcfC58296dbe9d97D2b53BA9899608b2de4421e3` | created | transportation provider |
| roles.transport2 | `0x2737bd08621Bb9b6CbF161bB0473013A5aeDEFC5` | created | transportation provider |
| roles.facility | `0xb7a0b24dba198F3CF7F7fC5A7F71aF375Ae9cAEb` | created | delivery verifier |

The four role accounts are registered in the current `Accounts` contract on all
three networks and hold gas money from each network's deployer.

Funding of the new deployers: 1 POL from https://faucet.polygon.technology and
0.005 AVAX from https://faucet.zalalena.com/avalanche (both claimed by hand).
After both deployments and all tests the Amoy deployer holds about 0.06 POL
(a third deployment there would need another faucet claim); Fuji and Sepolia
have plenty.

## Contract fixes

| Problem in the original contracts | Fix |
| --- | --- |
| The first provider to reveal won; every later reveal failed with "Tender not open" | `revealBid` accepts reveals from all bidders until the reveal period ends and keeps the lowest one (the earlier reveal wins a tie). Bidders who do not reveal cannot win |
| The penalty was paid twice, at bid and at reveal | It is deposited once, with the sealed bid. `revealBid` takes no payment |
| On-time delivery paid the bid only; late delivery paid bid + penalty (reversed) | On time: the winner gets the bid plus its deposit back. Late: the winner gets the bid; the deposit goes to the hirer |
| Losing bidders' deposits stayed in the contract for good | New `withdrawDeposit(tenderId)`: any bidder who is not the winner takes the deposit back once the reveal period is over, or at once if the tender was retracted. This includes bidders who never revealed |
| `Accounts` registered six hard-coded addresses (one an admin) | The constructor registers only the deployer |
| `getAllTenders()` never showed bidders (tenders were stored twice and only one copy was updated) | Each tender is stored once; the list shows bidders and sealed bids. This also roughly halves the gas of posting and revealing |
| *Not in the original list (confirmed afterwards):* `reclaimTender` was allowed only **before** the due date, so a hirer could take the escrow and the winner's penalty while the delivery was still under way, and could never reclaim a job that was actually missed | Reclaim is allowed only **after** the due date. It had to change with the penalty rules: otherwise the deposit that an on-time delivery now returns could always be taken first |

After a due date passes, either outcome is possible until one happens: the
facility confirms a late delivery (provider paid, penalty to hirer) or the
hirer reclaims (escrow and penalty to hirer).

Interface changes for anything that calls the contracts: `revealBid` is no
longer payable; `withdrawDeposit(uint256)` and `depositHeld(uint256,address)`
are new; the `tenderMapping` and `tenderIds` getters are gone (`tenders` and
`getAllTenders` remain).

The same changes were applied to the copies in `foundry/src`, and
`foundry/test/Auctions.t.sol` / `AuctionGas.t.sol` were updated to the new
rules (two tests added). **The Foundry tests were not run** — Foundry is not
installed on this machine. `truffle/build` still holds the old compiled
artifacts; the web app no longer reads them.

## What was tested (fixed contracts)

### Local unit tests, `node local-test.js` — 12/12 pass

In-memory chain with time travel: lowest bid wins in either reveal order,
ties, reveal validation, single deposit, on-time and late payouts, reclaim
only after the due date, deposit withdrawal rules (too early, winner, twice,
retracted tender, no reveals), bidder list, no pre-registered accounts, and
the contract balance returning to its starting value after every scenario.

### Live check, `node e2e.js <network>` — passes on all three networks

Four tenders per run: A (both bidders reveal, higher bid first; lowest wins;
on-time delivery; loser withdraws), B (never delivered; reclaimed after the
due date; non-revealer withdraws), C (retracted; bidder withdraws), D (late
delivery). Every payout is checked to the wei, seven calls that must be
rejected are checked, and the run ends by confirming the contract holds
nothing from it.

On Sepolia the first attempt stopped at a check that read stale data from the
public RPC endpoint; the script was made tolerant of that, the four tenders it
had posted were retracted and their deposits withdrawn, and the second run
passed (so Sepolia has tenders 0–3 retracted and 4–7 from the passing run).

### Through the Dapp

Checked against the new Fuji contracts (tender 4, posted by script):

| Step | How | Result |
| --- | --- | --- |
| Both providers place sealed bids (80000 and 60000 wei) | Dapp | Both mined; nonces saved |
| The 80000 bid is revealed first | script, using the nonce the Dapp stored | That bidder leads |
| The 60000 bid is revealed, with no second payment | Dapp, changed reveal popup | Mined; on chain the tender moved to the lower bidder |
| Winner tries "Withdraw Deposit" during the reveal period | Dapp, new button | Refused; the popup shows "Reveal period is not over" |
| Delivery verified | script | Tender closed; 100500 of the 101000 wei in escrow paid out |
| Outbid provider clicks "Withdraw Deposit" after the reveal period | Dapp, new button | Mined (Fuji block 60834404); the popup shows "Your penalty deposit has been returned to your wallet"; on chain `depositHeld` is false and the contract balance is 0 |

**Not done in the browser:** the facility and initiator pages against the new
contracts (their code did not change). The full Dapp flow described in the
first part of this project was run against the first deployment only.

### Gas used (average per call, from the e2e runs)

| Function | Sepolia | Amoy | Fuji | First deployment (Fuji) | Paper, Table 6 |
| --- | ---: | ---: | ---: | ---: | ---: |
| postTender | 1,939,643 | 495,653 | 435,803 | 826,751 | 778,738 |
| secretBid | 528,504 | 176,980 | 141,978 | 150,220 | 94,674 |
| revealBid | 151,142 | 118,318 | 76,318 | 322,500 | 143,693 |
| verifyDelivery | 76,636 | 119,028 | 81,588 | 176,248 | 26,485 |
| reclaimTender | 51,542 | 73,698 | 52,458 | 52,749 | 9,210 |
| retractTender | 44,040 | 53,140 | 40,540 | 46,000 | 8,718 |
| withdrawDeposit | 38,205 | 58,492 | 44,252 | — | — |
| deploy Accounts | 13,232,067 | 1,922,209 | 1,905,409 | 2,073,125 | — |
| deploy Auctions | 28,656,205 | 4,031,935 | 4,028,587 | 5,189,059 | — |

Fees: negligible on Sepolia and Fuji (gas price about 1e-7 gwei). On Amoy
(about 30 gwei): postTender 0.015 POL, secretBid 0.0053, revealBid 0.0035,
verifyDelivery 0.0041, and 0.18 POL for the two deployments.

These are whole-transaction gas figures from the receipts. The same call costs
different amounts on the three testnets, Sepolia most of all.

## Other changes to the application code

* `project_code/components/Popup/RevealBid.jsx` – no payment on reveal; new
  "Withdraw Deposit" button; explanatory text updated to the new rules.
* `project_code/config.js` – the ABIs are read from `contractAbis.json`, which
  `testnet/compile.js` regenerates from the Solidity source on every deploy
  (previously a hand-pasted copy inside `config.js`).
* `project_code/components/Tenders/BiddingForm.jsx` – the "Finalize" step read
  `receipt.events[0]`. Sepolia emits a system `Transfer` log for the ETH sent
  with a bid ahead of the contract's `BidPlaced` event, so the bid id was not
  found and the nonce was never saved. It now looks `BidPlaced` up by name.
* `project_code/components/Popup/RetractTender.jsx`, `ReclaimTender.jsx` –
  `APP_DOMAIN` was referenced without the `Constants.` prefix, so "Finalize"
  threw a ReferenceError.
* `project_code/config.js`, `pages/_app.js`, `constants.js`,
  `TopNavLanding.jsx` – network, contract addresses and API URL come from
  `deployments.json` / environment variables; Polygon Amoy is described to
  useDApp; a "Switch to …" button appears when the wallet is on another chain.
* `backend-api/db.js`, `sqlite-schema.sql`, `index.js` – local SQLite database
  by default, one file per deployed contract, with no pre-registered users
  (the university MySQL/API host is not reachable from outside); MySQL still
  available with `DB_DRIVER=mysql`. `database-files/CreateAIS.sql` was left as
  it was and still inserts the original default users.
* `project_code/devWallet.js` – optional MetaMask stand-in for local testing.
