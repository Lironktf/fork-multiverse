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
4. Click **Trade** in the top bar. Under **Available markets**, click **Open in graph & trade** on the Copper/Brent market. The target and condition appear in the graph and in the Trade panel.
5. Connect Phantom on devnet. Open **Add trading funds**, click **Get test USDC**, then **Deposit** an amount such as 100. Review and sign in Phantom.
6. Choose Buy/Sell, YES/NO and a share quantity. Click **Review trade**, review the exact contract quote and fee, then **Confirm buy YES** (or the selected side) in Phantom.
7. Selling returns cash to the market. Withdrawals appear after settlement; a failed condition returns the original deposit.
8. To build another market, select a live Gemini target and fork a world with a live YES assumption (or a specific categorical outcome). Open **Trade → Build this market**, review both source rules and proposed trading closes, then **Create market**. The operator registers the pair and supplies 80 test USDC of liquidity through the standard contract instructions.

Each trade supports one selected condition. If a graph world has more assumptions,
the Trade panel explicitly selects which one applies. Binary NO conditions,
custom events and demo events remain forecast-only. A binary NO target is tradable
as the NO side of the target's exact YES instrument. Forecast probabilities are
never execution prices. Transaction links open Explorer on the configured cluster.

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

## Rust contract sources

The active program is `contracts/programs/fork-contracts/src/lib.rs`.
`instructions.rs` defines account constraints, `state.rs` the lifecycle and
accounts, and `math.rs` the integer LMSR pricing. `tests/market.rs` exercises
instructions with LiteSVM. `docs/legacy/fork_positions` is historical only.

The optional research strategy remains a CLI tool. No bot, background auto-buy,
or operator-owned trader is exposed in the app. Browser trades use the connected
wallet and standard deposit, quote, trade, redeem and LP instructions.

## Consolidated branch

`demo/graph-markets` includes upstream `master` at `34d5336`, the LP fee and
capital-efficiency changes, the verified devnet integration, and the graph-linked
Trade UI. It uses program `2Hfano51aQbCLFE5mf348CXRb4YEzpnqvow7ucCV6Lyv`
with the matching generated IDL. The earlier upstream program ID is a different
deployment; do not reuse its accounts with this IDL. The frontend can build
without Anchor because the generated public client files are committed.

## Verification commands

From `fork/`, with the app/service running:

```bash
npm run verify
RUN_DEVNET_READ=1 npm test -- tests/e2e/devnet-read.spec.ts
npm test -- tests/e2e/graph-trading.spec.ts
(cd contracts && cargo clippy --all-targets -- -D warnings)
npm --prefix contracts run test:validator
npx playwright install --with-deps chromium
RUN_DEVNET_WALLET=1 \
  SIGNER_PATH="$PWD/contracts/.local/lp-browser-app-20261120/admin.keypair.json" \
  npm test -- tests/e2e/devnet.spec.ts
```

The devnet browser test uses an ephemeral Wallet Standard test signer kept in the
test process. It tests real devnet RPC and SPL transfers, rejected signing,
deposit, buy, sell and locked redemption through the graph-linked Trade panel. It does not claim
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
