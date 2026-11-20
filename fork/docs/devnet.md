# FORK: trade with devnet SOL

The app uses **SOL on Solana devnet**. Deposit SOL from your wallet, buy or sell
conditional shares, and withdraw SOL when the market settles. There is no custom
collateral currency, minting faucet, or separate wrapping step.

## Demo flow

1. Open <http://localhost:3100> and enter the workspace.
2. Click **Trade**. Under **Available markets**, choose **Open in graph & trade**.
   The Copper target and Brent condition appear in the graph and the Trade panel.
3. Connect Phantom with **Solana Devnet** selected. Get devnet SOL from
   <https://faucet.solana.com> if needed.
4. Open **Deposit SOL**, enter `0.1`, and sign in Phantom. Leave SOL in your
   wallet for transaction fees and account rent.
5. Choose Buy, YES or NO, and a fractional share quantity such as `0.01`.
   **Review trade** displays the exact on-chain cost and fee. Confirm in the wallet.
6. Sell shares to return cash to the market. Withdrawals unlock after settlement.
   A winning whole share pays 1 SOL; fractional shares pay proportionally. If the
   condition fails or either event is invalid, original deposits are refunded.

To create a market, select a live Gemini target and fork a world with a live YES
assumption or specific categorical outcome. Open **Trade → Build this market**,
review both source rules and trading closes, then **Create market**. The operator
supplies up to 0.1 devnet SOL of liquidity using the standard LP instructions.
Multi-assumption worlds explicitly select one condition for trading. Binary NO
conditions, demo events and custom events remain forecast-only.

## Start the app

```bash
cd fork
npm run dev:devnet   # SIGNER_PATH defaults to ~/.config/solana/fork-devnet-deployer.json
```

This starts two instances of one service on program `13Z5QXDCa7bNddx55di4qxg7cAepcjy8BjDxag9bBJdN`
plus the frontend: the mock-USDC instance (port 8788, "If this happens, buy" rules) and the
native-SOL instance (port 8789, this Trade tab). Both use Helius' devnet RPC when
`~/.config/helius/api_key` exists (the key stays server-side and is redacted from logs),
otherwise the public endpoint. SOL state lives in ignored `contracts/.local/devnet-sol`. The
operator signs registrations and oracle reports; Phantom signs deposits, trades and
withdrawals. No browser-wallet secret is imported or exported.

A clean frontend checkout needs Node 22+ and `npm ci`; generated public client
files are committed. Building/deploying the program additionally requires the
pinned Rust, Anchor and Solana tools described in `contracts/README.md`.

## Backing and account boundaries

The collateral is the canonical native SOL mint
`So11111111111111111111111111111111111111112`, with nine-decimal lamport accounting.
The SPL Token native-account mechanism holds actual SOL; it has no mint authority.
Each wallet deposit creates a temporary native account, deposits the exact SOL
amount into the market vault, and closes the temporary account in one atomic
transaction. Withdrawal uses a fresh temporary account and returns SOL and its
rent directly to the signing wallet. Existing wallet token accounts are untouched.

New SOL configurations use `config-sol` PDA seeds, so old six-decimal collateral
accounts cannot be interpreted as SOL. The original initialization instruction
and legacy seed validation remain for compatibility; existing claims keep their
original mint and accounting. The current service and browser reject legacy
collateral configurations. No conversion of old balances into SOL occurs.

The market vault is controlled by the market PDA. Trader and LP accounts are
bound to their owners and market. Trading is limited by the existing integer
LMSR reserve checks. LP funding locks once trading starts. Fees are included in
LP equity and cancel on VOID. There is no operator withdrawal or sweep of trader
collateral, vault rent, or unsolicited deposits.

The reporter and upgrade authority remain trusted roles. Live events wait for
actual source outcomes; synthetic test reports are isolated from live markets.

## Rust source

- [`lib.rs`](../contracts/programs/fork-contracts/src/lib.rs): instructions and transfers.
- [`instructions.rs`](../contracts/programs/fork-contracts/src/instructions.rs): account and signer constraints, canonical SOL mint validation.
- [`state.rs`](../contracts/programs/fork-contracts/src/state.rs): lifecycle and reserve accounting.
- [`math.rs`](../contracts/programs/fork-contracts/src/math.rs): integer pricing and fees.
- [`market.rs`](../contracts/programs/fork-contracts/tests/market.rs): legacy and SOL backing/security tests.

## Devnet deployment

PR #3 was first deployed by its author to a separate program,
`2Hfano51aQbCLFE5mf348CXRb4YEzpnqvow7ucCV6Lyv` (upgrade authority held by the author); its
evidence is kept in [devnet-deployment.json](../contracts/docs/devnet-deployment.json). FORK runs
the merged code as an **upgrade of its own program** `13Z5QXDCa7bNddx55di4qxg7cAepcjy8BjDxag9bBJdN`,
so existing if-then markets keep working: the upgrade appends two fee fields to `Market`, and
`npm --prefix contracts run migrate:markets` resizes existing markets (zero fees, every original
byte preserved) before they are read with the new layout.

## Verification

```bash
npm run verify
npm test -- tests/e2e/graph-trading.spec.ts
RUN_DEVNET_READ=1 npm test -- tests/e2e/devnet-read.spec.ts
# Dedicated local SOL validator + service + localnet frontend:
RUN_NATIVE_SOL=1 npm run test:solana
RUN_SOLANA_FIXTURES=1 npm test -- tests/e2e/redemption.spec.ts
```

The native-SOL browser test checks rejected signing, real SOL deposits, buys,
sells, exact vault backing, and preservation of a pre-existing wrapped-SOL
account. Settlement tests check SOL receipts net of fees and one-time claims.
The contract tests cover normal/VOID payouts, unauthorized collateral access,
custom mint rejection, insufficient funds and locked withdrawals.

The consolidated branch is `demo/graph-markets`, based on upstream `master`
`b7f7456`. The PR is prepared locally at the user's request.
