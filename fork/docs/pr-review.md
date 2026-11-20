# PR review notes

## Proposed title

Integrate Solana conditional markets into Fork and consolidate the project

## Change

Fork previously displayed an undeployed Positions placeholder. Its original
Next.js interface now connects to the actual Anchor conditional market, using
exact live Gemini instrument bindings and wallet-signed local Solana transactions.
Users can obtain mock collateral, deposit, quote, trade YES/NO, inspect confirmed
balances and redeem eligible claims.

The entire application lives under `fork/`: Next.js in `src/`, the active Anchor
workspace and privileged oracle service in `contracts/`, and documentation in
`docs/`. Both Node lockfiles are retained to isolate their tested SDK versions.
The historical unused program is retained in `docs/legacy/`. Generated IDL,
private local signers, ledgers and build output are ignored.

The layout, global CSS, graph and forecasting journey are preserved. Browser
balances come from confirmed accounts. Conditional cash cannot be withdrawn
before terminal settlement, and VOID refunds principal. Source rules and exact
instrument bindings are immutable; real Gemini outcomes are never fabricated.

Repeated lifecycle refreshes also receive a unique memo so an identical sync
with a cached blockhash cannot fail as `AlreadyProcessed`. No economic
instruction or on-chain settlement rule changes for this fix.

## Reviewer entry points

- `src/components/solana/Positions.tsx`: trading inside the existing interface.
- `src/lib/contracts/client.ts`: generated IDL client, simulation, quote freshness,
  slippage limits, confirmation and authoritative account reads.
- `contracts/app/service.ts`: localhost-only mock funding, registration and oracle.
- `contracts/programs/fork-contracts`: active on-chain program and SBF tests.
- `tests/e2e`: original journey, live trading and isolated fixture redemption.
- `docs/integration.md`: exact setup commands and configuration.
- `docs/verification.md`: actual local transaction evidence and verification limits.

## Validation and limits

All 55 distinct contract/application tests have passing results, along with both
builds, type checks, lint, formatting and lockfile dry runs. The full browser run
exposed a duplicate-sync issue; after the fix, the complete live flow passed on
retry. See `docs/verification.md` for the evidence and initial failure details.
Use `npm run setup` from `fork/`, then start `npm run validator`, `npm run oracle`
and `npm run dev` in separate terminals. Copy `.env.example` to `.env.local` for
local defaults. No credentials or real collateral are needed.

This is a local mock-funds application, not an audited production deployment.
Specific wallet extensions and live Gemini settlement remain unverified; the
browser tests use Wallet Standard signing with isolated test keys. The dependency
audit findings and single-reporter/upgrade-authority assumptions are documented.

Branch: `integration/solana-monorepo`. No merge, force push or remote PR action is
part of this handoff. The old empty nested Git metadata is backed up locally in
`.git/nested-repositories/contracts.git`; all contract source belongs to this PR.
