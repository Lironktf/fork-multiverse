# Liquidity verification — 2026-11-20

This report records the original local-validator verification. Subsequent public
devnet deployment and application verification are recorded in
[devnet-deployment.json](devnet-deployment.json) and [the app guide](../../docs/devnet.md).
These original tests used real compiled SBF code and mock SPL collateral. No production funds or
devnet transactions were submitted during that original run. Public devnet read checks returned genesis
`EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`; deployment is not inferred from
that connectivity check.

## Baseline and contract checks

Before implementation, `npm run verify` from `fork/` passed the existing build,
typechecks, lint, formatting, 16 TypeScript tests, 2 Rust unit tests, 15 Rust
integration tests and 10 frontend unit tests. The initial browser run could not
launch Chromium because libnspr4/libnss3 were missing. After supplying those local
runtime libraries, all seven existing journey tests passed.

Final contract `npm run verify` passed: Anchor SBF/IDL build, TypeScript typecheck,
19 TypeScript tests, 3 Rust unit tests, 18 Rust integration tests (17 execute the
compiled program in LiteSVM), and formatting.
`cargo clippy --all-targets -- -D warnings` passed. The Solana program static checker
reported no findings. Its result is a linter check, not an independent audit.

Coverage includes fee-inclusive buy/sell quotes and slippage rollback; fee cap,
rounding and snapshot immutability; unequal LP deposits, withdrawals and pro rata
claims; rejection of live funding/exits and unauthorized withdrawals; every terminal
outcome; full refunds after profitable exits; LP loss despite positive fees;
12 seeded trade sequences of 80 decisions; original oracle and lifecycle cases;
69 Rust/TypeScript arithmetic differential vectors; and V1 account migration before
and after partial redemption with every original byte preserved. A focused
migration rerun also exercises the rent top-up CPI from the actual V1 rent balance.

## Real validator evidence

`npm run test:validator` starts an isolated real Solana validator, deploys the
compiled program using `solana program deploy`, then executes SPL/RPC flows.
The successful run’s public evidence, including the program
binary SHA-256, deployment signature and tracked transaction signatures, is in
[liquidity-rpc-evidence.json](liquidity-rpc-evidence.json). Signatures are local-ledger
evidence; they cannot be looked up on devnet.

Five markets share a collateral mint but have distinct vaults. Each has two LPs
with contributions 20/60 and three traders with 1,000 collateral deposits each.
124 tracked transactions plus SPL setup and the deployment execute via RPC.
The script checks every tracked signature, individual token payouts, aggregate
collateral conservation, per-market liabilities, fee accounting, claim ordering,
and rejection of unauthorized/double claims. Clock time advances normally.

| Outcome          | Conditional fees accrued | Final LP pool from 80 | Dust after all claims |
| ---------------- | -----------------------: | --------------------: | --------------------: |
| A YES, B YES     |                 7.199394 |              7.851947 |              0.000001 |
| A YES, B NO      |                 7.199394 |            604.851947 |              0.000001 |
| A NO             |       7.199394, canceled |             80.000000 |                     0 |
| A INVALID        |       7.199394, canceled |             80.000000 |                     0 |
| A YES, B INVALID |       7.199394, canceled |             80.000000 |                     0 |

All three VOID cases refund every trader's original 1,000, including the trader
who exited at a conditional profit. Claims in one vault cannot use another vault's
reserves. Positive fee accrual plainly does not imply positive LP returns.

## Application and reproducibility

App TypeScript, ESLint, formatting, the production build and 11 frontend unit tests
passed. All seven original UI journey tests also passed against the final production build. All four browser wallet fixtures passed, including the existing VOID,
YES and NO single-redemption cases. The new LP fixture verifies: wallet rejection, contribution,
partial Funding withdrawal, funding lock, fee-inclusive quote/trade and a claim
that realizes an LP loss despite positive fees. A stale Webpack cache was moved out of the project and the build rerun
successfully. Browser fixtures are run against a production server to avoid dev
watcher rebuilds while validator ledgers are changing.

From `fork/`, use separate terminals (local tools and Chromium runtime required):

```bash
# Terminal 1: new dedicated ledger; do not reset an existing developer ledger.
FORK_VALIDATOR_LEDGER=.local/review-lp-validator npm run validator

# Terminal 2: new session after any IDL change.
FORK_LOCAL_DIR=.local/review-lp-app npm run oracle

# Terminal 3: compile localnet wallet config, then serve that build.
FORK_LOCAL_SERVICE=http://127.0.0.1:8787 \
NEXT_PUBLIC_SOLANA_CLUSTER=localnet NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899 \
NEXT_DIST_DIR=.next-prod npm run build
FORK_LOCAL_SERVICE=http://127.0.0.1:8787 NEXT_DIST_DIR=.next-prod npm start -- --port 3100

# Terminal 4
RUN_SOLANA_FIXTURES=1 npm test -- tests/e2e/liquidity.spec.ts tests/e2e/redemption.spec.ts
npm test -- tests/e2e/journey.spec.ts
```

The fixture browser uses the existing Wallet Standard bridge to sign real validator
transactions. API routing provides synthetic discovery descriptors, while every
market, deposit, fee, trade, oracle report and redemption is on-chain. No private
keys are in browser bundles, logs, evidence or commits. The existing live Gemini
browser test remains opt-in and was not rerun with fabricated live instruments.

The program ID in Rust, Anchor localnet/devnet configuration, generated IDL and the
ignored deployment keypair agrees: `2Hfano51aQbCLFE5mf348CXRb4YEzpnqvow7ucCV6Lyv`.
The migration CLI also ran successfully against already-current accounts; actual
V1 resizing and preservation are covered in compiled-program LiteSVM tests.
