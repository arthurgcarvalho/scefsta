# Testnet deployment report — 9–12 November 2026

The contracts went through three versions. The first deployment (9 November)
was the unmodified source; it exposed the contract problems listed in
"Contract fixes" below. The second (10 November) fixed those. The third
(12 November) changed the auction rules to match the threat model described in
the paper and removed the penalty. A small addition later the same day made
the contract record when each delivery is confirmed, which meant deploying
once more; that final deployment is the current one on all three networks, and
the addresses, test counts and gas figures in the first section are its own.
The sections after it are the 9–10 November record and are out of date
wherever they mention penalties, deposits or the order of reveals.

## 12 November 2026: auction rules aligned with the paper's threat model

### What changed in `Auctions.sol`

| Topic | 10 November version | Now |
| --- | --- | --- |
| Commitment | `keccak256(bid + nonce)`: a hash of the sum, so one commitment opened to any bid, and it could be copied by another bidder. Nonce of 48 bits | `keccak256(abi.encode(tenderId, bidder, bid, nonce))` with a 256-bit nonce (`commitmentOf`). A commitment opens to one bid only, for one bidder, on one tender |
| Periods | Hirer chose the bidding period; the reveal period was a constant (60 s) | `postTender(timeLimit, revealTime, deliveryTime, …)`: the hirer sets both. Commitments while `t < tc`, reveals while `tc <= t < tr`, by block timestamp |
| Winner | A running lowest bid updated by every reveal; the earlier reveal won a tie | `revealBid` only records the bid. `determineWinner(tenderId)`, callable by anyone once `t >= tr`, picks the lowest revealed bid; a tie goes to the earlier commitment. The order of reveals has no effect |
| Not revealing | No consequence | Recorded per address at winner determination (`getFailedReveals`, event `RevealFailed`). `failedRevealLimit` failed reveals within `failedRevealWindow` suspend the address for `suspensionPeriod` (`suspendedUntil`, `isSuspended`); `secretBid` rejects a suspended address. Defaults 3 / 30 days / 30 days; admins change them with `setRevealPolicy` |
| Retraction | Allowed until the first reveal landed, with no time limit | Only while `t < tc` |
| No valid reveal | Tender stayed open; the hirer had to retract it | `determineWinner` closes it as `Unawarded` (new status 5) and refunds the hirer |
| Penalty | Every bidder deposited the tender's penalty with the bid; refunded to non-winners, paid to the hirer on a late or missing delivery | Removed. Nobody deposits anything. A delivery is paid the bid whether on time or late; an undelivered job can be reclaimed after the due date, as before |
| Delivery record | Confirming a delivery only closed the tender; when it was confirmed was not stored, so a late delivery looked like any other | `verifyDelivery` stores the block time in the tender (`deliveryDate`, right after `dueDate`; zero until then) and emits `DeliveryVerified(tenderId, provider, deliveryDate, dueDate)`. A delivery was late if `deliveryDate > dueDate`. A missed delivery is a `Reclaimed` tender: it keeps the winning provider's address and has no delivery time |

Interface changes for anything that calls the contracts: `postTender` has a
`revealTime` argument and no `penalty`; `secretBid(uint256, bytes32)` and
`revealBid(uint256 tenderId, uint256 bid, uint256 nonce)` are not payable and
the reveal takes no bid index; `determineWinner`, `commitmentOf`,
`setRevealPolicy`, `getFailedReveals`, `isSuspended`, `suspendedUntil`, `bids`
and the three policy getters are new; `withdrawDeposit`, `depositHeld`, the
`penalty` and `bidHashArray` tender fields are gone; the tender details have a
new `deliveryDate` field after `dueDate`, and the `DeliveryVerified` event is
new.

Two things about late and missed deliveries are as they were. Once the due
date has passed, the hirer may reclaim and the facility may still confirm: the
late provider is paid in full only if the confirmation is mined before a
reclaim. And nothing removes a provider automatically: the record is there for
an administrator, who removes a provider from the registry by hand (Admin
page, Transports).

Not changed: the bid and its nonce are still saved in the backend database
when a bid is placed (table `Salts`, now as text: a 256-bit nonce does not fit
a number column), and the API that returns them still asks for no sign-in.

### Deployed contracts (current)

| Network | Contract | Address |
| --- | --- | --- |
| Ethereum Sepolia | Accounts | [`0xEF2486576172193Ae9a407ee2A7d8424E8c1B615`](https://sepolia.etherscan.io/address/0xEF2486576172193Ae9a407ee2A7d8424E8c1B615) |
| Ethereum Sepolia | Auctions | [`0x617435AB5aDb401E2BCb90F7Ff06e8785Ed67f92`](https://sepolia.etherscan.io/address/0x617435AB5aDb401E2BCb90F7Ff06e8785Ed67f92) |
| Avalanche Fuji | Accounts | [`0x761A33762092E51f2CdaaF9A34543dD24EFD11D3`](https://testnet.snowtrace.io/address/0x761A33762092E51f2CdaaF9A34543dD24EFD11D3) |
| Avalanche Fuji | Auctions | [`0xA8e64e2568F0088d73209148a4D6462f0b6ED094`](https://testnet.snowtrace.io/address/0xA8e64e2568F0088d73209148a4D6462f0b6ED094) |
| Polygon Amoy | Accounts | [`0x6826734bCB9eA591Eb7018f30B8ce2f5a470a1F4`](https://amoy.polygonscan.com/address/0x6826734bCB9eA591Eb7018f30B8ce2f5a470a1F4) |
| Polygon Amoy | Auctions | [`0xa67993678d19753F8fDa84159887D492e8041BCB`](https://amoy.polygonscan.com/address/0xa67993678d19753F8fDa84159887D492e8041BCB) |

The first deployment of 12 November, the same contracts without the delivery
record, is superseded: Auctions at `0x255b9c373b407245293788A6AAf86d891c71D15e`
on Sepolia and `0xB1E17855eEC6D6f83f9548112A694414CF8760f3` on Fuji (listed
under `previous` in `deployments.json`). It was never on Amoy.

Amoy was deployed last, after a faucet claim: its deployer held about 0.06 POL
and the two deployments cost 0.22 POL at 33 gwei. Until then it carried the
10 November contracts. All tenders from its test run are settled, the contract
holds nothing and the failed-reveal rule is at its default.

### What was tested

**Local unit tests, `node local-test.js` — 17/17 pass.** In-memory chain with
time travel: what a commitment binds (changed bid with shifted nonce, copied
commitment, reuse on another tender: all rejected); commit accepted at
`tc - 1` and rejected at `tc`; reveal accepted at exactly `tc` and at
`tr - 1`, rejected at `tr`; winner determination rejected at `tr - 1` and
accepted at exactly `tr`; lowest bid wins in either reveal order and whoever
triggers the determination; equal bids go to the earlier commitment in either
reveal order; retraction only before `tc`; unawarded tender and refund; failed
reveals recorded and public; suspension at the limit, bidding blocked until it
ends, failed reveals outside the rolling window not counted; payouts with
nothing deposited; the confirmation time recorded in the tender and in the
event, on or before the due date for an on-time delivery and after it for a
late one that is still paid in full; reclaim only after the due date, leaving
the provider's address and no delivery time on the tender.

**Live check, `node e2e.js <network>` — passes on Sepolia, Fuji and Amoy** (83
transactions and checks on Sepolia and Fuji, 12 of them calls that must be
rejected; 84 and 13 on Amoy, where one more optional check had time to run). Five tenders per run: A
(both reveal; a bystander determines the winner; lowest wins; delivered on
time, with a confirmation time not after the due date), B (one bidder never
reveals: failed reveal recorded, provider suspended and turned away by
`secretBid`, later free to bid again; job never delivered; reclaimed, the
tender keeping the provider's address and no delivery time), C (retracted
during bidding), D (late delivery, still paid, with a confirmation time after
the due date), E (no bid: unawarded, hirer refunded). Every payout is checked
to the wei and the run ends with the contract holding nothing from it. Each
run leaves one failed reveal on `transport2`'s record and one late and one
missed delivery on `transport1`'s.

**Foundry and Truffle tests** (`foundry/test`, `truffle/test`) were updated
to the new interface and seven Foundry tests were added. The Foundry tests
compile with solc 0.8.21; **neither suite was run**, because Foundry and
Truffle are not installed on this machine.

**The delivery record in the Dapp**, in the browser with the dev wallet,
against the current Fuji contracts (tenders 0 to 5 there):

| Step | Role | Result |
| --- | --- | --- |
| Tender Dashboard: new "Delivery Confirmed" column, right after "Delivery Due Date" | initiator | The on-time tender shows its confirmation time; the late one shows the time followed by "(late)"; the reclaimed one shows "Not delivered"; the retracted and unawarded ones are blank |
| Admin page, Transports: new "Late Deliveries" and "Missed Deliveries" columns, next to the failed reveals | superAdmin | transport1: 1 late, 1 missed, 0 failed reveals; transport2: 0, 0 and 1 failed reveal, as the e2e run left them |
| Accepted Patients: new "Delivery Confirmed" column | facility | Same times as on the hirer's list, the late one marked "(late)"; the pending and incoming lists do not have the column |
| Confirm the arrival of a patient whose tender is in progress (tender 5) | facility | Mined; "Patient successfully verified! Funds have been transferred!"; the patient moved to Accepted Patients with its confirmation time, about half an hour before the due date |

The transport pages and the bid, reveal and winner popups were not driven
again: their code did not change after the checks below.

**Through the Dapp, the auction rules**, checked the same way earlier on 12
November against that day's first Fuji deployment (tenders 5 to 7 there),
whose contract differs from the current one only in not recording the delivery
time:

| Step | Role | Result |
| --- | --- | --- |
| Post a tender with the changed form (no penalty field; new "Reveal Period (Minutes)" field: auction 4 min, reveal 3 min) | initiator | Mined; on chain the reveal deadline is 180 s after the commit deadline |
| Place sealed bids of 90000 and 80000 wei on a tender | transport1, transport2 | Both mined with nothing paid; the 256-bit nonces were saved, and each commitment on chain equals the hash of (tender, bidder, bid, saved nonce) |
| Retract a tender after its auction end date | initiator | Refused: "Bidding period is over" |
| "Determine Winner" on a tender nobody bid on, after its reveal date | initiator | Mined; the popup reports that no valid bid was revealed and that the funds were returned; tender `Unawarded` |
| "Reveal Bid" and "Determine Winner" before their time | transport1 | Refused: "Tender under auction", "Reveal period is not over" |
| Reveal the 90000 bid during the reveal period; the 80000 bid is left unrevealed | transport1 | Mined; the bid shows as revealed on chain |
| "Determine Winner" after the reveal date | transport1 | Mined; the popup announces the 90000 bid as the lowest revealed one and that this account won |
| Admin page, Transports: set the rule to 1 failed reveal / 1 h / 0.1 h beforehand, and back to 3 / 720 h / 720 h afterwards | superAdmin | Both mined; the table shows 2 failed reveals and a "Suspended Until" time for transport2, 0 for transport1 |
| Place a bid while suspended | transport2 | Refused in the form: "This account is suspended from bidding until …" |
| Confirm the patient's arrival | facility | Mined; winner paid, tender `Closed` |

Not driven in the browser: the reclaim popup and the "Tenders In Progress"
winner check (their code changed only in the wording of messages), and
MetaMask (the dev wallet was used throughout). These steps were run on the
development server. On the current Fuji contracts every tender is settled (the
contract holds nothing) and the rule is at its default; `transport2` has one
failed reveal on record there, `transport1` one late and one missed delivery.

### Hosted copy (Cloud Run, Sepolia)

Redeployed twice on 12 November with `node cloudrun/deploy.js`, once per
Sepolia deployment (now revision `scefsta-00007-dlz`, same address and access
setting as before). It runs against the current Sepolia contracts and started
from a fresh database, filled with `node e2e.js sepolia` and
`node seed-demo.js sepolia` before the upload: 16 tenders (six open, with
auctions closing between 19 November and 27 December 2026 and one-day reveal
periods; three in progress, due by 12 December; four delivered, one of them
late; one each reclaimed, retracted and unawarded), 17 stored bids, eight
extra organisations. The seeding script set the failed-reveal rule there to
three failed reveals within 30 days and a **one-hour** suspension, so that a
shared demo with two provider accounts cannot be locked for a month. From the
e2e run, `transport2` starts with one failed reveal and `transport1` with one
late and one missed delivery.

Checked on the hosted copy after the second redeployment: the landing and
initiator pages answer; the API returns the 16 patient records and the 17
stored bids (66-character nonces); the page scripts name the current Auctions
address and not the previous one; in a browser, the initiator dashboard lists
the 16 tenders with the "Delivery Confirmed" column (a time for the on-time
delivery, a time marked "(late)" for the late one, "Not delivered" for the
reclaimed one), and the Admin page's Transports table shows 1 late and 1
missed delivery for `transport1` and 1 failed reveal for `transport2`. The
transport dashboard and its popups were checked on the first redeployment and
not again. No transaction was sent from the hosted copy.

### Gas used (average per call, from the e2e runs)

| Function | Sepolia | Amoy | Fuji | Fuji, 10 November version |
| --- | ---: | ---: | ---: | ---: |
| postTender | 1,827,367 | 470,109 | 413,644 | 435,803 |
| secretBid | 334,075 | 132,515 | 102,553 | 141,978 |
| revealBid | 151,937 | 99,760 | 69,511 | 76,318 |
| determineWinner, two reveals | 170,284 | 102,888 | 73,488 | — |
| determineWinner, one reveal and one failed reveal with suspension | 511,350 | 195,690 | 151,170 | — |
| determineWinner, no bids (refund) | 53,188 | 68,608 | 49,288 | — |
| verifyDelivery | 179,818 | 129,514 | 96,514 | 81,588 |
| reclaimTender | 48,310 | 64,130 | 44,810 | 52,458 |
| retractTender | 46,151 | 58,611 | 42,651 | 40,540 |
| setRevealPolicy | 63,297 | 54,317 | 47,597 | — |
| deploy Accounts | 13,232,067 | 1,922,209 | 1,905,409 | 1,905,409 |
| deploy Auctions | 33,329,435 | 4,707,439 | 4,701,559 | 4,028,587 |

At Amoy's gas price that day (33 gwei) the calls cost between 0.002 POL
(retract, reclaim) and 0.016 POL (posting a tender); confirming a delivery
cost 0.0043 POL, and the two deployments 0.22 POL. On Sepolia and Fuji the
fees were a negligible fraction of a cent.

Recording the delivery time is what `verifyDelivery` pays for: before it, the
call used 65,040 gas on Sepolia and 69,656 on Fuji. The addition is one new
storage slot and one event, about 27,000 gas on Fuji and about 115,000 on
Sepolia, where a new storage slot is priced far higher (the same gap shows in
`secretBid` and `postTender`).

`determineWinner` loops over the tender's bidders, so its cost grows with
their number: on the local chain, about 115,000 gas for ten revealed bids.
The figures in the paper's Table 6 were measured on the original contracts and
do not describe this version.

## Deployed contracts on 10 November (superseded)

| Network | Contract | Address |
| --- | --- | --- |
| Ethereum Sepolia | Accounts | [`0x0583988901e843DfaB1456C0BDD88E6aAB20c3E1`](https://sepolia.etherscan.io/address/0x0583988901e843DfaB1456C0BDD88E6aAB20c3E1) |
| Ethereum Sepolia | Auctions | [`0xf819dD6C3B8FB90E5bf82785fFE218De83f9Be7A`](https://sepolia.etherscan.io/address/0xf819dD6C3B8FB90E5bf82785fFE218De83f9Be7A) |
| Polygon Amoy | Accounts | [`0x000e505402B9EB8a041746bDd8fFFe9E72cA466e`](https://amoy.polygonscan.com/address/0x000e505402B9EB8a041746bDd8fFFe9E72cA466e) |
| Polygon Amoy | Auctions | [`0xa7b7d18Aa90e5135a21eF12E0e5389106490b202`](https://amoy.polygonscan.com/address/0xa7b7d18Aa90e5135a21eF12E0e5389106490b202) |
| Avalanche Fuji | Accounts | [`0xcf2e105F63275756d9dBB0c8183e113aEA18101E`](https://testnet.snowtrace.io/address/0xcf2e105F63275756d9dBB0c8183e113aEA18101E) |
| Avalanche Fuji | Auctions | [`0x9549d6EF5b36c83dbA8d77c4D0812164fA5082E1`](https://testnet.snowtrace.io/address/0x9549d6EF5b36c83dbA8d77c4D0812164fA5082E1) |

Source: `truffle/contracts/Accounts.sol` and `Auctions.sol`, compiled with solc
0.8.21 (optimizer off). `deployments.json` has the transaction hashes, block
numbers and, under `previous`, the superseded addresses.

The Sepolia contracts were deployed a third time on 10 November (same fixed
source) to start from an empty tender list: tender addresses are stored on
chain, and the earlier test tenders used real place names. The test data there
is now made up at random (`sample-data.js`). The gas and test figures below
for Sepolia come from the second deployment, which it replaced:
`0xc3CA7f0Aa0ED37612DcC548743EF6b3422d201Fc` (Accounts) and
`0x38274122442B8bb4d9F685C8cDD9F239f7F7032c` (Auctions).

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
After those two deployments and their tests the Amoy deployer held about 0.06
POL, so the 12 November deployment there took a second faucet claim of 1 POL;
after it and its test run the deployer holds about 0.70 POL. Fuji and Sepolia
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

## Hosted copy on Google Cloud Run (Sepolia, dev wallet)

*State on 10 November; for the 12 November redeployment see "Hosted copy
(Cloud Run, Sepolia)" above.*

Deployed on 10 November 2026 with `node cloudrun/deploy.js` (see
[`../cloudrun/README.md`](../cloudrun/README.md)): project `apps-489516`,
region `us-central1`, service `scefsta`,
https://scefsta-993855254741.us-central1.run.app. One container runs the web
app and the backend API; the database is copied to the bucket
`apps-489516-scefsta-data` after every change.

The test accounts' private keys are kept in Secret Manager and used only by
the backend API, which signs the dev wallet's transactions; the page receives
the addresses only. (The first hosted build still had the keys in the page; it
was never public and was replaced the same day.)

The service is deployed with **sign-in required** (not public). With the dev
wallet, anyone who can open the app can act as the test accounts, so opening
it to everyone is left as an explicit step (the README gives the command).

Checked on the deployed service: an anonymous request is refused (403); signed
in, the landing page and the API answer; a write through the API refreshed the
database copy in the bucket; the container restored the database from the
bucket at start-up; in a browser (through `gcloud run services proxy`) the
transport1 and initiator accounts log in with the dev wallet and the initiator
dashboard lists the eight Sepolia tenders. After the keys moved to the
backend: none of the 39 pages and scripts the service serves contains a
private key; two transactions sent from the hosted page as superAdmin (add,
then remove, a dummy provider address) were signed by the backend and mined on
Sepolia; a request to send to another address was refused. The tender forms
themselves were not driven on the hosted copy.

For anonymity, the hosted copy has no developer credits on the About page and
no footer on the landing page, and it runs against the third Sepolia
deployment, whose tenders and test users are made up at random. The page's
scripts list only that deployment (no other networks or earlier addresses).

Demo data was then added with `node seed-demo.js sepolia` and copied to the
hosted database (`node cloudrun/db.js push`): eight extra organisations, six
open tenders (auctions closing between 17 November and 25 December 2026, seven
sealed bids on them), three tenders in progress (deliveries due 24 November to
10 December) and two more delivered ones, 15 tenders in all, each with a
patient record that has injury details. Checked on the hosted copy: the
transport dashboard shows 6 available tenders, 9 placed bids and 3 in
progress; the facility dashboard shows 6 pending, 3 incoming and 4 accepted
patients.

The hosted copy has its own database. It and the local Sepolia setup use the
same contracts, so a tender posted from one has no patient record in the
other; use one of them for Sepolia from here on.

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
