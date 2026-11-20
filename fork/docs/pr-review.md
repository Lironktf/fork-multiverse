# PR: simplify graph-linked trading and use devnet SOL

Target: `Lironktf/fork-multiverse:master`

Local branch: `demo/graph-markets`

Upstream consolidated: `34d53363577078dbc2770dc52cd93dc26808b783`

The Positions and auto-buy controls made it unclear which graph assumptions
mapped to a contract or who signed a trade. The new Trade tab follows the graph's
exact Gemini target and selected condition. Users review source rules to create
a market, connect a wallet, deposit SOL, then review and sign buys or sells.
Opening an existing market restores its matching graph world. Unsupported
assumptions remain forecast-only with an explanation.

Collateral is now native SOL using canonical SPL native accounts with real
lamport backing. The app has no collateral minting faucet or custom currency.
Deposits and withdrawals atomically create and close a temporary native account;
existing wrapped-SOL accounts are untouched. New `config-sol` PDAs isolate SOL
from legacy six-decimal configurations. Original claims and standard contract
reserve, signer, market, mint and lifecycle constraints remain enforced.

Advanced LP controls, balances and source details are collapsed. The user-facing
bot and auto-buy panels are removed. The Rust source is under
`contracts/programs/fork-contracts/src`; generated public client artifacts are
committed so frontend builds do not require the Rust toolchain.

## Validation

- Production Next.js build, application/contract type checks, ESLint and formatting.
- 25 frontend unit tests and 25 contract TypeScript tests.
- 23 Rust tests: 3 pricing/math tests and 20 integration tests, including native
  SOL conservation through YES/NO/VOID, rejected custom mints, foreign collateral
  and payout accounts, insufficient funds and premature withdrawals.
- 4 browser tests against the actual local validator: SOL deposits/buy/sell and
  all three terminal payout outcomes, one-time claims, rejected wallet signing,
  exact native vault backing and existing wrapped-SOL account preservation.
- 13 production-browser graph, market-creation review, mobile, Atlas and journey tests.
- Program static checker: no findings in modified Rust source.

Devnet deployment and public account evidence are recorded separately in
`contracts/docs/devnet-deployment.json`. Live source settlement waits for actual
Gemini results; synthetic settlement tests run only on local fixtures. The
reporter and upgrade authority remain trusted roles. Wallet tests use a Wallet
Standard bridge; manual Phantom extension compatibility is not claimed as tested.

## Local handoff

Per the user's request, this PR is prepared locally and has not been published.
See `docs/devnet.md` for the demo and startup commands. Once GitHub authentication
is available, push this branch and open a PR against the upstream target above.
