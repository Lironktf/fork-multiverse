# Solana conditional prediction markets

The app and devnet demo use **native SOL collateral** with nine-decimal lamport
accounting. Follow [the SOL demo walkthrough](../docs/devnet.md). The Rust program
is in [`programs/fork-contracts/src`](programs/fork-contracts/src), with backing
and authorization tests in [`tests/market.rs`](programs/fork-contracts/tests/market.rs).

An Anchor 1.1.2 program for **B conditional on A=YES**, with an integer binary
LMSR, immutable Gemini instrument bindings and a trusted oracle adapter. Native
SOL accounts hold actual lamports; the app never mints collateral. Legacy
six-decimal configurations remain separate for existing claims and historical
CLI test fixtures. No mainnet deployment has been performed.

If A=YES, winning B shares pay one collateral unit. If A=NO or either event is
INVALID, the market voids and every trader receives their entire deposited
collateral, even after profitable exits, losing exits, partial closes or
reversals. Rounding reserves are refunded too. Network fees are separate.

## Historical CLI fixture — custom test collateral

The CLI workflow below is retained for legacy contract testing. For the current
SOL app, use [the SOL walkthrough](../docs/devnet.md).

In terminal 1, from `fork/contracts`:

```bash
npm ci
npm run validator:live
```

In terminal 2:

```bash
npm run demo:live
```

Search and page through the **live Gemini catalog**, select the exact parent A
and target B instruments, read their source rules, and enter each conservative
trading close in UTC. The demo registers those immutable bindings on Solana,
creates mock USDC, funds an LMSR and two separate trader wallets. No fixture
markets or fabricated outcomes are used in this workflow.

At the prompt, for example:

```text
quote yes 10
buy yes 10
trader bob
buy no 8
trader alice
sell yes 4
status
watch 60
```

Each buy/sell is a real transaction on the local validator. Output includes
exact finite-size quotes, transaction signatures, source bid/ask data, the
conditional LMSR probability, individual holdings and locked/withdrawable
balances. The 50% starting conditional price is a configurable-market baseline,
not an estimate derived from Gemini marginals. Trades change that price.

`poll` checks both real source contracts and submits eligible oracle reports.
`watch SECONDS` repeats this every 15 seconds. Trades also refresh source data
first and abort if it cannot be verified. Actual source resolution may take
hours or days; time passing never fabricates an outcome. After terminal
settlement, use `redeem` for each trader, then `lp-withdraw` for the LP.

Sessions, development-only signer files, source snapshots, downloaded rules
and timestamped transaction/balance logs live in ignored `.local/live-demo`.
The persistent validator ledger is `.local/live-validator`; it is not reset
by the launcher. Resume with:

```bash
npm run demo:live -- --resume
# Or keep several selections:
npm run demo:live -- --session my-market
npm run demo:live -- --session my-market --resume
```

The validator must keep its ledger for sessions to remain usable. Stop/restart
it normally; do not run the old resetting fixture launcher against this demo.
Local signatures can be inspected with `solana confirm -v SIGNATURE --url
http://127.0.0.1:8899`. The public audit log is `activity.jsonl` inside the session. Check all saved
transaction statuses and the current collateral/inventory invariants with
`npm run demo:audit -- live-demo` (or your chosen session name).

For reproducible live runs, exact selections are accepted as
`--parent EVENT_TICKER/INSTRUMENT_SYMBOL`, `--target ...`,
`--parent-close ISO_UTC`, `--target-close ISO_UTC`, and
`--commands 'buy yes 10;trader bob;buy no 8;status'`. Choose instruments currently
open on Gemini. The displayed rules govern appropriate close choices.

`npm run demo` now starts this live interactive workflow. The original synthetic
settlement harness is explicitly named `npm run demo:fixture`.

Format all TypeScript and Rust with `npm run format`; enforce formatting with
`npm run format:check`. Anchor account constraints are also laid out one per line.

See [the actual live run and transaction evidence](docs/live-demo-report.md).

## Build and independently verify

Prerequisites: Rust **1.89.0** (rust-toolchain.toml), Anchor CLI **1.1.2**, Solana
CLI / cargo-build-sbf **3.1.10**, Node **22+**, npm. The dependency lockfiles are
included. These retain the initialized workspace's versions. Run from this
`fork/contracts` directory:

```bash
npm ci
npm run verify
```

`verify` builds the actual SBF program and IDL, type-checks TypeScript, runs the
oracle/research tests, runs Rust tests including LiteSVM against the compiled
`.so`, and checks formatting. The Rust integration suite also executes the
TypeScript adapter and submits its encoded instruction to LiteSVM. It does not
replace the program with a native processor or mock success receipts.

Individual commands:

```bash
NO_DNA=1 anchor build
npm run typecheck
npm test
cargo test --locked -- --nocapture
cargo clippy --all-targets -- -D warnings
npm run simulate
```

Build before type-checking: the client consumes generated
`target/types/fork_contracts.ts` and `target/idl/fork_contracts.json`.
Tests manipulate LiteSVM's Clock, create an actual SPL mint/token accounts,
execute mint/transfer CPIs, and inspect account data and token balances.
See [test results](docs/test-report.md) for the measured results and coverage.

## Architecture and balances

Config, external events, conditional markets, traders and LPs are PDAs. A
market owns a single six-decimal collateral vault. Trader positions and LP
interests are **nontransferable program accounts**, not bearer tokens.
Configurations are namespaced by their creator; clients must pin their chosen
config. The program's loader upgrade authority is separate from config admin.
Admin transfer requires proposal and acceptance. Reporter and pause authority
are explicit roles; oracle quorum is **one trusted reporter**. New markets snapshot a configurable LP fee (0–10%); no admin instruction can
change an existing market’s fee or drain escrow. See [LP economics and migration](docs/liquidity.md).

For trader i:

- D_i = cumulative deposited collateral.
- K_i = buys paid minus sells received, including rounding.
- c_i = D_i - K_i >= 0 = conditional trading cash.
- y_i,n_i = nonnegative YES and NO shares.

Before final settlement, **none of these balances is withdrawable**. A trader
can sell their entire exposure and reuse conditional cash for another trade;
selling does not send USDC out of escrow. This restriction continues after
A=YES until B settles, preserving the refund guarantee if B later invalidates.
There is no shorting, borrowing, partial collateral withdrawal or margin.

VOID redemption pays D_i. Activated YES redemption pays c_i+y_i; activated NO
pays c_i+n_i. Each account redeems once, in full. Thus a trader who deposits
$50, trades into $70 conditional cash and then sees A=NO receives $50, with
zero conditional trading P&L. No clawback from an external wallet is needed.

Let L be LP deposits, D=sum D_i, C=sum c_i, and Y,N aggregate holdings.
The vault holds L+D before claims. Every trade enforces:

```
L + D >= C + max(Y,N)
```

VOID needs exactly D+L. Activated settlement needs C+winning inventory; the LP
receives the nonnegative residual. Final liabilities are snapshotted and
reduced by exactly each payout. This proves solvency independently of pricing
approximation. Full equations and induction are in
[architecture](docs/architecture.md) and [security](docs/security.md).

## LMSR and liquidity providers

With fixed virtual initial inventory oY,oN:

```
F(Y,N) = max(Y+oY,N+oN)
       + b * ln(1 + exp(-abs(Y+oY-N-oN)/b))
pYES   = 1 / (1 + exp((N+oN-Y-oY)/b))
trade  = F(after) - F(before)
```

Initial log odds configure probability; zero gives 50%. Stable range reduction
and bounded integer series use a 10^18 scale and checked u128 intermediates.
Final amounts are micro-USDC. Buys add four micro-USDC and sells subtract up
to four as a conservative rounding reserve; the snapshotted LP fee is then applied to the collateral flow.
Quotes return the same integer amounts that trades use. Maximum input ranges,
error bounds and compute measurements are documented in the linked reports.

One virtual offset is zero. Required initial subsidy is floor(F(0,0))+4,
which is b\*ln(2) plus rounding only for a balanced initialization. Off-center
initialization requires a larger worst-case reserve. An LP can lose almost all
of this subsidy when traders win; all trader entitlements remain covered.
LPs receive residual equity, including conditional fees on valid settlement,
proportionally to their deposited capital. Fees cancel on VOID and do not guarantee profit.

Multiple LPs may fund or withdraw during Funding. Once started, **LP ownership,
b and reserves are locked until terminal settlement**. Live LP additions and
liquidity parameter changes are intentionally unsupported. Terminal LP claims
can occur before or after trader claims. Integer-floor pro rata division leaves
at most nLP-1 micro-USDC of locked dust; unsolicited vault transfers are also
locked surplus. There is no order-dependent last-claimant bonus.

## Lifecycle and timestamps

| Condition                     | Behavior                                               |
| ----------------------------- | ------------------------------------------------------ |
| Funding                       | LPs fund; trading disabled until subsidy is sufficient |
| Both unresolved and open      | Pending; trade YES/NO on B                             |
| A YES, B unresolved/open      | Active; trading may continue until B close             |
| B final before A              | Frozen; await A, no new trades                         |
| A NO or either INVALID        | Terminal VOID; full deposit refunds                    |
| A YES, B YES/NO               | Terminal normal settlement                             |
| Source under review/closed    | Halt until a supported final report                    |
| Close passed, no final report | Trading rejected; no inferred outcome                  |

Close, observation/expiry, source publication and on-chain submission are
separate fields. Pending trades require `now < closeA` and `now < closeB`.
Active trades require `now < closeB`. Equality rejects. Reporting can happen
much later. Source future skew has a 30-second limit; trading cutoffs have none.
Final source timestamps must meet the committed observation time (invalidation
may be earlier). Exact final retries are idempotent and conflicts are rejected.

Permissionless `sync_market` materializes lifecycle status; quote and trade
read both authoritative events themselves, so omitting sync cannot permit
trading after a known result. Simultaneous reports and arbitrary claim order
produce identical entitlements. There is no admin-selected winner and no
unreported-result-to-NO fallback.

## Gemini registration and oracle

The program does not create or trade Gemini contracts. The admin registers an
exact event ticker **and contract instrumentSymbol**, committing
SHA256(ticker + NUL + instrumentSymbol), a terms/rules hash, an explicit trading
close and observation time. Those fields cannot be replaced. Several binary
instruments may belong to one categorical Gemini event; selecting its first
contract or using the event-level result is unsafe.

[Gemini's public event API](https://developer.gemini.com/prediction-markets-spec/markets)
and [schemas](https://developer.gemini.com/prediction-markets-spec/~schemas)
were checked alongside live responses. `oracle/gemini.ts` fetches the exact
instrument, verifies its terms and expiry, requires supported final status and
resolutionSide, and preserves separate contract resolvedAt. The terms hash
includes canonical descriptions, terms URL, contract expiry and the actual
rules document SHA-256. The API has no stable dedicated close field in this
binding: admin must select a conservative cutoff from the contract rules;
expiry is not silently treated as close.

`fixtures/registrations.json` and `scripts/demo.ts` show registration; the demo
uses synthetic rules and reports and must never be described as a Gemini
attestation. Actual bindings can be constructed with exported `bindingHash`,
`termsHash`, `fetchEvent`, `exactContract` and `fetchRules`, then registered via
the generated Anchor client. Inspect the source terms before registration.

To run one relayer pass against an already registered real Gemini instrument:

```bash
SIGNER_PATH=/absolute/path/to/local-or-devnet-reporter.json \
  npm run oracle -- EVENT_PDA
```

The relayer logs source JSON and signatures, checks on-chain finality before
retries, and never submits a guessed NO. Invalid without source publication
freezes instead of fabricating a timestamp. Solana verifies the **reporter's
signature**, not the authenticity of Gemini HTTPS. Reporter compromise can
misresolve markets; reporter failure can lock funds indefinitely.

## Local validator and devnet

The expanded deployment/RPC suite is `npm run test:validator`: five markets,
multiple LPs and traders, actual SPL transfers, fees, exits, valid settlements and
VOID refunds. See [the reproducible workflow and migration](docs/liquidity.md).

LiteSVM requires no validator. For a separate validator smoke demo, terminal 1:

```bash
NO_DNA=1 anchor build
bash scripts/local-validator.sh
```

This resets only `.local/validator` and preloads the compiled program. Terminal 2:

```bash
npm run demo:fixture                       # buy, partial sell, A NO, full refunds
DEMO_OUTCOME=yes npm run demo:fixture       # A YES, B YES, normal payout
DEMO_OUTCOME=no npm run demo:fixture        # A YES, B NO, normal payout
```

Each fixture demo generates an ephemeral signer, requests local SOL, creates a
mock six-decimal mint, funds the market, simulates transactions, trades and
settles. It waits roughly 30–45 seconds for real validator timestamps and
asserts total collateral conservation and an empty vault. No keys are written.

For a conventional deployment to an already running validator or **devnet**,
supply your own funded test signer outside the repository:

```bash
SIGNER_PATH=/absolute/path/to/test-signer.json bash scripts/deploy.sh localnet
SIGNER_PATH=/absolute/path/to/test-signer.json bash scripts/deploy.sh devnet

RPC_URL=https://api.devnet.solana.com ENABLE_DEVNET=yes \
SIGNER_PATH=/absolute/path/to/test-signer.json npm run demo:fixture
```

On a fresh checkout the generated program keypair has a new public ID. The
deploy script runs `anchor keys sync` and rebuilds; review its source/config
changes. Clients and the local loader read the resulting IDL address. Program
keypairs stay ignored under target. The current devnet deployment and browser verification are recorded in [devnet-deployment.json](docs/devnet-deployment.json); see the [app walkthrough](../docs/devnet.md).
The demo is one run per configured signer; use a fresh test signer/config for
another run. Mainnet is rejected by the supplied client/scripts.

## Research bot and limitations

See [research model and commands](docs/research.md). The default is paper mode
and no calibrated edge means no trade. Frechet bounds are enforced, correlation
of market-price changes is explicitly a heuristic, and empirical terminal
analogues require comparable outcome data. The synthetic simulations include
wrong-model losses. No model output can resolve an event.

This demo has no independent audit, general Boolean conditions, deeper trees,
production oracle quorum, live LP repricing, transferable shares, pre-terminal
withdrawals, partial claims, fee collection, account-rent closure or surplus
recovery. Infinite source delay can lock deposits. An upgrade authority remains
a privileged trust assumption. The legacy TypeScript dependency boundary has
three npm high-severity package findings from one unresolved bigint-buffer
advisory; see [security limitations](docs/security.md). Real-data calibration,
Gaussian-copula fitting and a live oracle-to-devnet run remain unvalidated.
