# Conditional market architecture and accounting

Implementation specification, 2026-11-18. Scope: one immutable binary Gemini
contract A and one distinct binary contract B; activation is A=YES. Each admin
creates a namespaced configuration (there is no front-runnable global singleton).
Positions and LP interests are nontransferable PDA accounts. SPL Token, six
decimals only; no Token-2022 extensions. Protocol fees are fixed at zero.

## Accounts and authority

Config `[config, creator]` binds a collateral mint, admin, pending admin,
single trusted reporter, pause authority and bounded risk limits. Admin transfer
uses propose/accept; the original creator remains in the PDA seed. The Solana
loader upgrade authority is separate and must be secured by the deployer.
Event `[event, config, SHA256(ticker || NUL || instrumentSymbol)]` permanently
binds the exact identifiers, terms hash, close and observation times. Reports
carry that binding and terms hash; only the configured reporter may submit.
Final reports are immutable; exact retries are idempotent. Under-review/closed
reports latch a trading halt until a final report. UNKNOWN is never NO.
Market `[market, config, A, B]` owns its `[vault, market]` token escrow.
Trader and LP PDAs use `[trader|lp, market, owner]`.

## Conditional ledger and solvency

Amounts and shares are millionths (one whole winning share pays one USDC).
For trader i, let D_i be cumulative deposits, K_i net trading payments (buys
minus sells, including conservative rounding), c_i=D_i-K_i >= 0, and y_i,n_i
the nonnegative holdings. No shorting or borrowing. Every trade updates c and
holdings atomically; selling can realize a contingent profit but transfers no
tokens. All trader withdrawals remain locked until a terminal outcome, including
after A=YES. This intentionally conservative restriction also permits a later
B=INVALID refund without clawbacks. Deposits can be added before termination.

Let L be LP deposits, D=sum D_i, K=sum K_i, Y=sum y_i, N=sum n_i.
Before claims the physical vault V=L+D (unsolicited transfers are surplus).
Every trade verifies L+K >= max(Y,N). Thus V >= sum(c_i)+max(Y,N).
VOID/INVALID trader claims are D_i and LP claims are their original deposits;
V=L+D exactly covers them, regardless of round trips or contingent gains.
Activated YES claims are c_i+y_i; NO claims c_i+n_i. LP equity is
L+K-Y or L+K-N respectively and is nonnegative by the explicit reserve check.
Terminal snapshot fixes trader liability and LP equity; each withdrawal reduces
the corresponding remaining liability. Claimed accounts cannot claim again.
LP activated equity is distributed pro rata with integer floors, independently
of claim order; at most (number of LPs - 1) micro-USDC remains as locked dust.
No fee collector or privileged drain exists. On VOID, rounding is refunded too.

LPs may fund and withdraw during Funding. Starting requires the full subsidy.
LP ownership, b and initial offsets freeze at start; no live LP minting or
withdrawal. This avoids share dilution, retroactive risk transfers and the need
to price unresolved conditional LP equity. More reserves can be funded before
start without changing b. Active liquidity changes are deliberately out of scope.

## Pricing

Use fixed virtual offsets oY,oN >= 0 (one is zero) and actual holdings Y,N.
F(Y,N)=max(Y+oY,N+oN)+b*ln(1+exp(-abs(Y+oY-N-oN)/b)).
Prices use the corresponding logistic. Offsets configure initial log odds;
initial probability is exp(oY/b)/(exp(oY/b)+exp(oN/b)).
The worst activated loss is F(0,0)-min(oY,oN), which equals b*ln(2)
only when balanced. Required initial subsidy is floor(F(0,0))+4 micro-USDC.
Independent integer liability checks protect against numerical implementation
error. The floating-point formulas are never used in the on-chain program.

Integer scale 10^18; range-reduced exp and an atanh-series logarithm, with
bounded loops, use checked u128 arithmetic. b is at most 10^12 micro-USDC,
initial log odds at most 16, inventory at most 10^15. The scalar potential is
rounded down to micro-USDC; buys add four micro-USDC and sells subtract up to
four. This is a documented rounding reserve, not a percentage protocol fee.
It prevents extracting rounding value by repeated cycles; identical reverse
trades telescope in the common potential and lose at most eight micro-USDC.
Numerical measurements and bounds are recorded with the test results.

## Lifecycle and timing

Funding -> Pending -> Active (A YES) -> SettledYes/SettledNo.
Pending -> Frozen (B final before A), then settled when A YES or VOID when A NO.
Any A NO or either INVALID -> VOID. Under review -> Halted until final reports.
Terminal states never change. Permissionless sync derives state from both
events; trade/quote derives eligibility directly so an omitted sync cannot
permit a trade on stale market status. Pending requires both closes in future;
Active requires B close in future. Equality at close rejects. Final YES/NO
requires source publication >= observation; invalidation may occur earlier.
Publication may be delayed indefinitely. Future source times have a 30-second
skew allowance; the trading cutoff has no allowance. Reporting itself does not
enumerate linked markets; every trade reads authoritative event accounts.

## Trust and limitations

The reporter attests to Gemini HTTPS data; Solana cannot authenticate that data.
Final results cannot be amended. A source halt not yet reported is unknowable
on-chain; committed closes limit that window. Admin registration must choose
conservative close times from source terms, since expiry is not a close field.
No administrative winner selection or timeout-to-NO exists. A failed reporter
can lock assets indefinitely; admin can rotate the reporter, not choose outcomes
without possessing reporter authority. Upgrade authority remains a trust risk.
Phase 2 estimates are advisory research, never settlement inputs.
