# Threat model, numerical bounds and release limits

## Assets and attackers

Protect legacy SPL collateral in PDA-owned vaults against malicious traders,
LPs, arbitrary account substitution, counterfeit event reports, repeated
redemptions, arithmetic extremes and transaction reordering. Rent and network
fees are outside USDC conservation. A reporter, admin or upgrade authority can
be compromised; this MVP does not cryptographically verify Gemini responses.
There is no production deployment or claim of audit certification.

The config is namespaced by its initial signer, so initialization cannot steal
another creator's configuration. Clients must pin the intended config PDA.
An admin can register future events, pause, transfer administration through a
pending/accept handshake and replace the reporter/pause authority. Admin cannot
edit existing terms, mint, b, offsets, positions, fees, final reports or vault
balances. Admin can indirectly influence resolution by replacing the trusted
reporter. The loader upgrade authority can replace the entire program and is
strictly more powerful than the application admin. Use separate protected keys
and a reviewed upgrade governance scheme before considering real assets.

## Safety versus liveness

Every trade and quote checks event account identities and source state, not just
cached market status. Both closes apply while A is unresolved. After A=YES,
only B's close applies. Final target reports freeze immediately. No waiting for
a keeper to call sync is required for safety. All terminal claims may be made
while globally paused. A source halt is sticky until final resolution; a false
halt affects availability but cannot select a winner. There is no timeout
resolution and no admin forced-refund escape hatch. If Gemini never publishes
a final result, funds may remain locked indefinitely. An unreported external
early result cannot be known by the chain; reporting latency is a real risk.

Final report retries must match outcome and source timestamp. Final payloads
are bound to event ticker/instrument hash and terms hash; account metas and the
reporter signature also bind the configuration and program. Shared events can
intentionally resolve several markets. Exact duplicate reports are harmless;
conflicting final reports are rejected. Non-final halt observations are
monotone; final source publication can predate the latest local observation of
a halt. Source future skew is limited to 30 seconds. All clocks are integer UTC
seconds and equality at close prohibits trading.

The adapter verifies the selected contract, expiry and a canonical terms hash
that includes the rules document SHA-256. It never substitutes another contract
in the same event, infers NO from missing data, or equates expiry with close.
Unknown fields are ignored and unknown statuses fail closed in the adapter.
Source terms changes produce an adapter error, requiring investigation; the
program's committed cutoff still applies. Invalid without a publication time
is reported as a halt until the source supplies final evidence. Registration
is a deliberate admin assertion of binary semantics; Gemini may group several
binary instruments inside a categorical event.

## Solvency proof

Refer to architecture.md for definitions. Initially the vault equals L+D and
sum(c)=D. Each buy/sell changes one c and aggregate cash by the same amount,
and one holding and aggregate inventory by the same amount. No token moves.
Deposits increase the actual vault, D, and c equally through a checked SPL CPI.
The explicit guard L+D >= sum(c)+max(Y,N) is tested after every trade.

At VOID, total trader liability is D and LP liability is L. At activated
settlement, total trader liability is sum(c)+Q_winner and LP equity is the
nonnegative residual. Terminal snapshots are immutable. Claims decrease a
recorded liability by exactly the transferred amount, with checked arithmetic
and one-time claim flags. Thus by induction assets cover all unpaid claims.
Settlement/claim order cannot change any claimant's entitlement. Floor-rounded
LP shares leave at most nLP-1 micro-USDC dust; nobody receives order-dependent
"last claimant" residue. Unsolicited token transfers also remain locked surplus.

The maker can lose essentially its entire initial subsidy. Guaranteed trader
payouts remain covered even then because the guard uses actual inventory and
cash, independently of the theoretical LMSR loss bound. LPs cannot withdraw
while trading is enabled, even when reserves appear excessive. LP capital and
b are fixed once started. No live liquidity repricing is implemented.

## Fixed-point approximation

Scale S=10^18. All monetary arithmetic uses checked u64/u128, no floating
point in the program. b is in [10^6,10^12]; virtual-inclusive inventories are
at most 10^15 and initial absolute log odds <=16. Integer exp(-x) is reduced
by ln(2) to r in [0,ln(2)) with at most 60 binary shifts. Twenty-four positive
Taylor terms approximate exp(r); its analytic remainder is below
2*(ln(2))^25/25! < 10^-28. The rounded ln(2) and integer operations contribute
less than 200/S absolute error in the resulting exp(-x). x>=42 is replaced by
zero; the omitted term contributes at most 10^12*exp(-42)<0.000001 micro-USDC.

For log(1+e), z=e/(2+e)<=1/3 and 40 odd powers are accumulated. The analytic
remainder is bounded by 2*z^81/(81*(1-z*z)) < 10^-40. Conservatively allowing
1000/S for all fixed-point arithmetic and propagated error gives <0.001
micro-USDC at maximum b. Flooring the final potential adds <1 micro-USDC;
two potential evaluations give a conservative <2.002 micro-USDC cost error.
A four micro-USDC buy surcharge / up-to-four sell haircut keeps trade rounding
on the reserve side. No minimum sale payment is invented when it rounds to
zero. Percentage LP fees are fixed per market, capped at 10%, and embedded in
conditional cash. Fees and rounding reserves are cancelled
and refunded with all conditional P&L on VOID/INVALID.

A common potential makes multi-step cycles telescope. A buy and exact inverse
sell at unchanged other inventory cannot create value even without relying on
the approximation bound: the same integer endpoints are used in reverse.
A numerical sweep against host f64 is a regression measurement, not a formal
proof or an arbitrary-precision certificate. See test-report.md for results.

## Remaining engineering risks

- This is a demo, without independent audit, formal verification or production
  incident procedures. Single-reporter and loader upgrade trust remain.
- No live LP additions, b changes, share transfers, shorting, margin,
  partial withdrawals, full account closure or dust recovery.
- Global config pause has a shared account-read dependency; each market has a
  single writable ledger/vault. Throughput is not production-benchmarked.
- Original toolchain versions are retained. Anchor's TS client requires legacy
  web3.js 1.x; compatibility stays in client/scripts. Transactions use legacy
  messages supported by this installed runtime, not unverified v1 APIs.
- npm overrides patch toml, jayson and uuid advisories while retaining Anchor.
  The remaining npm advisory is bigint-buffer's native toBigIntLE overflow,
  propagated through SPL token utilities (three high package findings). The
  demo reads fixed-size token amounts and does not accept arbitrary bigint
  buffers; replace/audit this dependency boundary before production use.
- Devnet deployment is supplied as an explicit script and has not been executed.
  All automated settlement evidence uses deterministic fixtures, not a live
  authenticated Gemini-to-devnet oracle run.

See [LP fees, funding and migration invariants](liquidity.md) for the appended
market fields, permissionless zero-fee migration, and budget-sized initial depth.
