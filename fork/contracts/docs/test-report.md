# Verification report

Client date: 2026-11-18. Workspace: `fork-contracts`. No production or devnet
transactions were submitted. Separate application source was not modified.

## Actual results

| Check | Result |
| --- | --- |
| `NO_DNA=1 anchor build` | PASS: SBF binary and Anchor IDL generated |
| `npm run typecheck` | PASS |
| `npm test` | PASS: 13 tests, 0 failed |
| `cargo test --locked -- --nocapture` | PASS: 2 unit + 15 integration tests, 0 failed |
| Actual compiled-program LiteSVM cases | 14 of the 15 Rust integration tests |
| Rust/TypeScript exact arithmetic comparison | 69 boundary quote/potential vectors matched exactly |
| `cargo fmt --all -- --check` | PASS |
| `cargo clippy --all-targets -- -D warnings` | PASS |
| `npm run verify` | PASS, exit 0 |
| Local validator VOID demo | PASS, full deposit refund, zero vault balance |
| Local validator A YES / B YES demo | PASS, exact payouts, zero vault balance |
| `npm run simulate` | PASS: 12 deterministic research scenarios |
| `npm audit` | 3 high package findings from one unresolved bigint-buffer advisory; not a clean audit |

Total executable named tests: **30 passed, 0 failed, 0 ignored**. The six seeded
random sequences, sixteen report/claim order permutations, precision sweep and
69 differential vectors execute inside these named tests. There are no doc
tests. LiteSVM tests load `target/deploy/fork_contracts.so`; they use real SPL
Token instructions and CPIs. No native Anchor processor substitution is used.

Toolchain observed inside this workspace: Rust/cargo 1.89.0, Anchor CLI and
crates 1.1.2, Solana CLI 3.1.10, LiteSVM 0.10.0, Node 22.22.2. Lockfiles record
exact dependencies. The installed SBF post-processing tool emits a warning
about unresolved Solana syscall names, plus the normal dual cdylib/lib LTO
warning. Those syscalls execute successfully in both LiteSVM and the full
local validator. No stack-frame-overflow diagnostics remain. An initial stack
issue found by runtime testing was corrected by boxing account wrappers.

## Coverage

- Real six-decimal mint creation, token account initialization and minting;
  PDA/vault ownership, collateral mint and zero protocol fee checks.
- Underfunded start rejection, multiple LPs, Funding deposits/withdrawals,
  repeated start rejection, locked live LP withdrawals/additions.
- YES/NO purchases and sales, partial/full exits, repeated entry, reversal,
  multiple traders, slippage, insufficient cash/holdings, zero/oversized trades.
- Non-50% initial price, 50 tiny round trips, six deterministic random sequences
  of 80 attempted trading decisions, with aggregate and physical invariants
  checked after every successful trade.
- A YES before B YES/NO; A NO before B; B YES/NO before A YES/NO; sixteen
  simultaneous report-order/claim-order permutations across terminal outcomes.
- Exact close boundaries via LiteSVM Clock changes, delayed publication,
  no inferred outcome, known-result trading rejection without prior sync.
- INVALID from either event, under-review halt, final publication predating
  the last observed halt, future/source-time rejection, unauthorized reporter,
  exact duplicate report, conflicting report, wrong identifier and terms hash.
- Unauthorized token destination/trader substitution, event substitution,
  unauthorized pause, admin propose/accept, previous-admin access rejection.
- Profitable Alice full exit, losing Bob full exit, attempted early withdrawal,
  then VOID returning both original deposits, including rounding.
- Worst-case maker loss approaching the full b*ln(2) subsidy while all trader
  claims remain payable; LP-before-trader and trader-before-LP claims.
- Duplicate redemption, failed instruction atomic rollback, post-VOID target
  reports having no economic effect, exact final token entitlements.
- Read-only on-chain quote returning the exact executed amount; TypeScript
  Gemini adapter encoding a real report instruction executed in LiteSVM.
- Oracle missing/unknown statuses, changed immutable terms/rules, absent prices,
  exact instrument matching, HTTP failure, ambiguous-send retry idempotence.
- Research default abstention, Frechet bounds, timestamp pairing, clipping,
  rolling windows, missing/stale data, bad spreads, risk/slippage/close gates,
  known synthetic outcome distributions, and wrong-model losses.

## Numerical and compute measurements

The Rust precision sweep uses 30,003 inventory/b combinations: b=10^6,10^8,10^12
micro-USDC and imbalance/b from 0 through 50 in increments of 0.005. Each also
checks an exact inverse round trip. Against host f64 reference formulas:

- Maximum absolute integer potential error: **1 micro-USDC**.
- Maximum absolute marginal probability error: **2.220446049250313e-16**.
- Rust and TypeScript BigInt potential/quote differences: **zero**, 69 vectors.

These are observed measurements, not a formal proof. The conservative analytic
budget is <1.001 micro-USDC per potential and <2.002 per unbuffered difference;
buys/sells add/subtract the documented four-micro rounding reserve. Exact cycle
non-extraction follows from common-potential telescoping independently.
See security.md for range and remainder bounds.

Measured on the installed LiteSVM runtime, default 200,000-CU instruction cap:

- On-chain quote, including a price event: **143,857 CU**.
- Maximum recorded non-quote successful transaction in the final suite:
  **100,007 CU** (including setup and trading).
- All tested transactions fit the default limit without a raised budget.

PDA bump search and account shape affect compute; these are measurements,
not a universal worst-case bound. Throughput/latency were not benchmarked.

## Full local validator evidence

Both runs created fresh mock USDC and ephemeral local signers. Each started
with 10,000 USDC, allocated 80 USDC to the LP and 200 USDC to the trader, bought
100 YES shares, then sold 40 YES shares. Buy quote was 62.011454 USDC.

| Run | Trader payout | LP payout | Final wallet | Final vault |
| --- | ---: | ---: | ---: | ---: |
| A NO / VOID | 200.000000 | 80.000000 | 10,000.000000 | 0 |
| A YES / B YES | 225.565915 | 54.434085 | 10,000.000000 | 0 |

The demo uses one owner for the trader and LP to assert total conservation;
LiteSVM uses distinct owners and multiple LPs to check individual entitlements.

## Solvency invariants checked

Before claims, vault=L+D, market cash=sum trader cash, inventory=sum holdings,
and L+D >= cash+max(YES,NO). On terminal claims, actual vault >= remaining
trader liability + remaining LP equity. Every transferred token matches the
claimant's entitlement; duplicate claims fail; total residual is at most the
one-micro LP floor dust for two funded LPs. VOID entitlements equal original
deposits even with offsetting contingent gains/losses. Pausing and oracle order
do not grant anyone a vault-drain capability.

## Remaining limits and unfulfilled extensions

The requested MVP and paper research workflow are implemented and locally
verified. The following are explicit scope/safety limitations:

- Live LP additions, changing b, and LP withdrawals during trading are rejected.
  Liquidity ownership changes are supported only before start and at settlement.
- All trader withdrawals remain locked until terminal settlement, even after
  A activates. This preserves later INVALID refunds without clawbacks.
- Single-reporter trust, admin reporter rotation, source latency and loader
  upgrade authority remain. No independent security audit/formal verification.
- Real Gemini connectivity was inspected manually; tests use fixtures. No live
  oracle-to-devnet run, devnet deployment, or real-money bot run was performed.
- No defensible real-data mapping from co-movement to terminal dependence was
  available. The default abstains. Empirical terminal analogues are implemented;
  Gaussian-copula fitting and validated real-data calibration are deferred.
- Three npm package findings remain (`bigint-buffer`, propagated through
  `@solana/buffer-layout-utils` and `@solana/spl-token`). Updated overrides remove
  the other observed advisories; this dependency boundary needs replacement or
  audit before production. Fixed-size demo reads do not establish general safety.
- Account-rent recovery, live b changes, transferable positions, deeper trees,
  permissionless oracle verification and surplus/dust recovery are not present.

[Simulation results](simulation-results.md) include model estimates, prices,
trade counts, exposure and expected P&L, including the misspecified model's
negative result. [Security](security.md) and [research](research.md) explain the
assumptions. Independently rerun `npm ci && npm run verify` before integration.
