# LP fees, funding and capital efficiency

Markets retain binary LMSR pricing and P(B|A). A=YES activates B payouts;
A=NO or either INVALID refunds every original trader and LP deposit. Selling
changes conditional cash and holdings; it never sends collateral out before
terminal settlement. The trusted oracle and immutable event bindings are unchanged.

## Fee and ownership terms

`set_fee(fee_bps)` lets the config admin set a default of 0–1,000 bps (0–10%)
**for future markets only**. Each market snapshots that rate at creation, before
LP funding or trader deposits. Existing markets cannot be repriced. Initialization
still defaults to zero; the local application sets `FORK_FEE_BPS` (default 100).

For a trade with the existing integer LMSR quote `gross` (including its four
micro-unit rounding reserve), `fee = ceil(gross * fee_bps / 10,000)`. A buy debits
`gross + fee`; a sell credits `gross - fee`. Zero proceeds have zero fee; at the
cap the rounded sell fee cannot exceed proceeds. Quotes, trade limits, events,
browser confirmations and the research bot use the same fee-inclusive amounts.
Rounding up prevents bypassing the fee by splitting gross collateral flow.

Fees are deducted from conditional cash, never from recorded principal or the
physical vault. `fees_accrued` is a cumulative **conditional** accounting metric,
not a separately withdrawable pot. On valid settlement, fees are already included
in LP residual equity. On VOID they earn zero and original deposits are refunded
in full, including fees and rounding. There is no protocol fee recipient or admin
withdrawal. Fees do not guarantee LP profit: informed traders can consume most of
the initial subsidy, and the adverse-outcome tests deliberately demonstrate this.

Anyone may open their `[lp, market, owner]` PDA, fund using the pinned legacy SPL
collateral mint, and withdraw contributions before trading starts. Net contributed
capital determines shares. A second LP receives no preferential price or access
to past fees. Once started, funding, exits and ownership changes lock until terminal
settlement; no unresolved LP NAV estimate or dilution mechanism is needed.
Terminal payouts use the original, frozen denominator regardless of claim order:

```
normal LP payout = floor(lp_pool * contribution / total_lp_contributions)
VOID LP payout   = contribution
```

LPs may claim before traders because the terminal trader liability is reserved.
Each claim marks the PDA paid once, including zero payouts. At most nLP−1 micro-units
of pro rata dust remain locked. Donations are excluded from shares and remain
locked surplus. Pre-start withdrawals reduce both LP contribution and the total.

## Invariants and depth

Let L be LP capital, D trader original deposits, C conditional cash, and Y,N
outstanding shares. Before claims, accounted vault assets are L+D. Every trade
checks:

```
L + D >= C + max(Y, N)
```

Fees only decrease C relative to a fee-free trade, so they cannot weaken that
inequality. VOID liabilities are exactly D+L. Valid liabilities are C+winning
shares; `lp_pool = L+D−trader_liability`. Terminal claims decrement their own
remaining liability, never the other class's reserve. All token movements use
mint/authority constrained SPL accounts and the canonical market signer PDA.
Arithmetic is checked u64/u128 fixed point; no floating point enters the program.

`create_market_for_budget(budget, log_odds_e6)` sizes immutable b and offsets
before funding. With M=MAX_B, x=abs(log_odds), and P the existing integer potential:

```
slope = P(M*x/1e6, 0, M) + 2
b = min(M, floor((budget − ROUNDING) * M / slope))
required = P(floor(b*x/1e6), 0, b) + ROUNDING
```

The two micro-unit buffer covers potential flooring and the documented series
error; the full-scale offset is exact. The program also checks `required <= budget`
using its actual potential and rejects unsupported b. The existing `create_market`
remains available for explicit depth. Balanced 80 mock USDC budgets buy roughly
115.4156 units of b, versus the app's former 100 b with 80 locked. The app's automatic
sponsor funds the exact requirement; the optional community Funding phase lets
wallets supply it. Funding above that requirement is extra risk capital and does
not change depth. LPs can reclaim surplus before start. Changing b after deposits
or trading is deliberately unsupported.

The market panel shows total/required/missing funding, b, wallet contribution,
proportional conditional fees, current YES/NO equity scenarios, capital at risk,
paid claims and withdrawal eligibility. Scenario estimates assume current holdings;
they are not forecasts or guaranteed final yields. Browser math is BigInt, shared
from the tested research mirror; the TypeScript target is ES2020 for BigInt literals.

## Compatibility and migration

Config, ExternalEvent, Trader and Lp layouts and all existing instruction arguments
are unchanged. Market grows from 259 to 269 bytes (including its discriminator), appending **10 bytes**: `fee_bps: u16`, `fees_accrued: u64`.
TradeEvent/QuoteEvent append a fee amount; regenerate the IDL for event consumers.
PDA seeds and the program ID remain unchanged in this repository.

After an upgrade, V1 markets require `migrate_market` before typed reads/trading.
It is permissionless: the signer only tops up rent. It checks program ownership,
exact old/new lengths, discriminator, canonical PDA and bump; copies the original
bytes unchanged and appends zeroes. Thus even funded, live or partly claimed old
markets retain zero fees and their existing rights. Repeating migration on a new
account validates it and does nothing; it cannot erase accrued fees. No balances
or trader/LP accounts move. Tests cover live and partly redeemed terminal markets,
retries, bad accounts and preservation of every original byte.

From `fork/contracts`, with a funded test signer already held outside source control:

```bash
SIGNER_PATH=/absolute/path/to/test-signer.json bash scripts/deploy.sh devnet
RPC_URL=https://api.devnet.solana.com ENABLE_DEVNET=yes \
  SIGNER_PATH=/absolute/path/to/test-signer.json npm run migrate:markets
RPC_URL=https://api.devnet.solana.com ENABLE_DEVNET=yes \
  SIGNER_PATH=/absolute/path/to/test-signer.json npm run smoke:liquidity
```

Deployment synchronizes Anchor/program public IDs with the ignored deployment
keypair, rebuilds and refreshes app IDL/types. Review any public-ID diff on a fresh
checkout. For an existing deployment, retain its deployment keypair/upgrade authority;
do not accidentally deploy a new ID as a migration. Browser/service sessions pin the
IDL hash and reject stale state; restart with a new `FORK_LOCAL_DIR` after upgrading.
The browser, CLI, oracle and smoke flow support localnet and devnet. See
[the devnet app guide](../../docs/devnet.md) for matching service/browser settings. The smoke uses mock SPL tokens and explicitly synthetic
outcomes; it is not a live Gemini resolution test. It requires funded test SOL and
waits for real chain time. No devnet deployment is claimed by local test results.

For the complete isolated Linux validator deployment and five-market RPC suite:

```bash
npm ci
npm run test:validator
```

Requires the repository's Solana/Anchor/Rust/Node tools plus Python 3, curl and Linux
memfd support. It launches a real `solana-test-validator` on port 18999 with a new
ignored ledger, deploys via `solana program deploy`, then simulates and confirms
RPC transactions using actual SPL transfers. Ephemeral test payer bytes reach the
CLI through an in-memory descriptor, never a key file or log. Public signatures and
validator logs stay in the printed `.local/liquidity-validator.*` directory. The
runner stops its own validator on exit and never resets another ledger.

## Shared liquidity decision and limitations

No shared vault is implemented. Until terminal settlement, every market must cover
its entire original-deposit VOID liability and its maximum valid liability. Without
additional enforceable joint-outcome constraints, several markets can require their
maximum reserves simultaneously. Off-chain correlation is not collateral. A common
custody vault with exclusive, fully backed per-market allocations could be solvent,
but would not save required reserves and adds allocation and withdrawal attack
surfaces. The current design keeps a distinct vault for each market, consolidates
LP funding within each vault, and reuses capital only after actual withdrawals.

Remaining limits: no live LP additions or early withdrawals after start; no dust
sweep/account closure; single trusted reporter may delay settlement indefinitely;
loader upgrade authority remains trusted; no independent audit or production
readiness claim. The original fixed-point approximation and explicit reserve checks
remain in force. Fees cancel on VOID, so frequent voids and adverse selection can
make liquidity provision unattractive despite volume.
