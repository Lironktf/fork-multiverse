# FORK devnet app

The Next.js app and its loopback-only operator service run on your computer. Wallet
transactions execute on public Solana devnet. The operator signs registration,
oracle and test-token minting transactions; Phantom signs your deposits, trades
and LP actions. No Phantom secret is imported into the service.

## Open the app

In the current workspace, the app is served at <http://localhost:3100>. To restart
after stopping the existing app and service, run from `fork/`:

```bash
SIGNER_PATH="$PWD/contracts/.local/lp-browser-app-20261120/admin.keypair.json" npm run dev:devnet
```

That is the existing devnet test operator, not your Phantom wallet. The script
sets matching devnet RPC/build settings, starts the service, waits for its verified
deployment/configuration, and starts Next.js. Operator data persists in
`contracts/.local/devnet-app`. Keep that ignored directory and the operator signer
on this machine; do not commit or share signing material. On another workstation,
use its separately provisioned test operator and initialize its own configuration.

Prerequisites: Node 22+, Rust 1.89.0, Anchor 1.1.2, Solana CLI/SBF 3.1.10. On a new
checkout, `npm run setup` installs dependencies and builds/synchronizes the IDL.
An executable matching program must already exist on devnet. Deployment is an
operator action, not something the browser performs.

## Phantom and trading

1. In Phantom, open your avatar → Settings → Developer Settings → Testnet Mode.
   Select **Solana Devnet**, not Solana Testnet.
2. Get devnet SOL for your Phantom address at <https://faucet.solana.com>. SOL pays
   network fees and account rent. The app's wallet menu links to this faucet.
3. Open the app, choose a target to enter the workspace, and connect Phantom with
   the wallet button at the top right.
4. Expand **FORK Positions**. Choose an existing conditional market, or inspect
   two exact Gemini instruments, review their rules and set their trading closes.
5. Choose **Get mock collateral**. This creates/fills the token account for the
   app's pinned SPL test-collateral mint. SOL itself is not betting collateral.
6. Enter a deposit amount and click **Deposit**. Review and sign in Phantom.
7. Choose Buy/Sell, YES/NO and a share quantity. Click **Request on-chain quote**,
   review the fee and maximum cost/minimum proceeds, then confirm in Phantom.
8. Confirmed transaction links open Solana Explorer with `cluster=devnet`.

Selling credits conditional cash inside the market. Wallet redemption remains
locked until valid settlement or VOID; this preserves original-deposit refunds.
LP contributions are available during Funding only. Automatically sponsored
markets already have their LP capital and cannot accept live LP additions.

Phantom's current instructions: <https://help.phantom.com/articles/5997313271699>.

## Available market

The initial app market binds **B: Copper ≥ $5.58** to **A: Brent oil ≥ $90**,
both observed November 27, 2026 at 22:00 UTC (5 p.m. Toronto). FORK trading closes
at 21:50 UTC (4:50 p.m. Toronto). This early close was chosen deliberately; it is
not presented as Gemini's trading close.

- A: `GEMI-BRENT2611272200-HI90`
- B: `GEMI-COPPER2611272200-HI5D58`
- Market: `FhwpcM5Ut66ctvMJ6LQVkfcfDUfrVz1zoRG2Nim43Kwd`
- Program: `2Hfano51aQbCLFE5mf348CXRb4YEzpnqvow7ucCV6Lyv`
- Collateral mint: `HhmR5iKRKGYrgEB4swyyw6jGKGro71H7WoMfTA9gGysg`

The full source rules and exact contracts were reviewed and their terms hashes
registered. The service polls live Gemini outcomes. It must remain running for
automatic reporting; it never invents a resolution from the elapsed clock.
This market is separate from the synthetic settlement markets used in RPC tests.

## Strategy bot

The original command-line strategy still exists. Its engine is now shared with
**FORK Positions → Strategy bot → Evaluate strategy**. The endpoint only reads
market/inventory and source data; it never signs or trades for a browser wallet.
An eligible proposal offers **Review strategy quote**, which obtains a fresh
on-chain quote and checks the proposal's limit. You then confirm the trade in
Phantom. Expired proposals must be evaluated again.

This quantitative history/calibration strategy is distinct from the app's LLM
forecasting panel. It may abstain because history, calibration, market eligibility,
inventory or conservative edge is insufficient. Calibration is optional via
`CALIBRATION_PATH`; it is not fabricated to make the bot trade. There is no
unattended Phantom trading or implied delegated wallet authority.

For an existing funded CLI test trader, from `fork/contracts`:

```bash
RPC_URL=https://api.devnet.solana.com ENABLE_DEVNET=yes \
  SIGNER_PATH=/path/to/existing-test-trader.json npm run bot -- MARKET_PDA
```

The default is a paper proposal. The existing explicit execution flags remain
`ENABLE_TESTNET_TRADING=yes` and `--execute-testnet`; despite their legacy names,
the supported public cluster is devnet. The trader must already have a deposit.

## Verification commands

From `fork/`, with the app/service running:

```bash
npm run verify
(cd contracts && cargo clippy --all-targets -- -D warnings)
npm --prefix contracts run test:validator
npx playwright install --with-deps chromium
RUN_DEVNET_WALLET=1 \
  SIGNER_PATH="$PWD/contracts/.local/lp-browser-app-20261120/admin.keypair.json" \
  npm test -- tests/e2e/devnet.spec.ts
```

The devnet browser test uses an ephemeral Wallet Standard test signer kept in the
test process. It tests real devnet RPC and SPL transfers, rejected signing,
deposit, buy, sell, locked redemption and strategy evaluation. It does not claim
to automate the Phantom extension itself. It spends 0.03 test SOL to fund its
test wallet plus fees and uses the current live market.

Full synthetic settlement verification, from `fork/contracts`:

```bash
RPC_URL=https://api.devnet.solana.com ENABLE_DEVNET=yes \
  SIGNER_PATH="$PWD/.local/lp-browser-app-20261120/admin.keypair.json" \
  npm run smoke:liquidity
```

This creates a separate configuration, mint and five synthetic markets. It waits
for real chain time before testing YES/NO/VOID payouts. Allow more than ten minutes
on public devnet and run it separately from browser tests to reduce RPC pressure.

## Operational limits

- This is a localhost-served devnet app, not a publicly hosted multiuser service.
  The privileged proxy deliberately rejects external hosts/cross-origin requests.
- Public devnet has rate limits. The backend reuses a TLS connection and paces
  requests; failed transactions remain explicit errors. The startup checks pin the
  program binary, IDL and devnet genesis hash. Mainnet is rejected.
- The service's test mint has no economic value. Fees do not guarantee LP profit.
- Real source settlement requires the actual future result. Synthetic smoke
  outcomes never become reports for a live Gemini-bound app market.
- The operator remains the trusted reporter and deployment upgrade authority.
  Existing V1 markets require the documented migration before typed reads.
