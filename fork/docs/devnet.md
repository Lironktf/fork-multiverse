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

The current workspace uses an existing funded test operator:

```bash
cd fork
SIGNER_PATH="$PWD/contracts/.local/lp-browser-app-20261120/admin.keypair.json" npm run dev:devnet
```

The script starts the loopback-only service and frontend with matching devnet
settings. SOL state lives in ignored `contracts/.local/devnet-sol`. The operator
signs registrations and oracle reports; Phantom signs deposits, trades and
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

## Verified devnet deployment

The SOL program upgrade and Copper/Brent market are confirmed on devnet.
The installed binary matches SHA-256
`507ee8c5d4cf511ec4963606538757d4c98cf26a9cdbbcb94f58be53c8181f13`.
The market is open with 99,999,999 lamports of LP funding (the integer reserve
required for a 0.1 SOL budget). Vault SOL equals that funding plus account rent.
Total operator spend was 0.205939799 devnet SOL, within the approved 0.35 SOL;
the deployment buffer was closed and its temporary balance recovered.

See [public deployment evidence](../contracts/docs/devnet-deployment.json) and
[local SOL payout evidence](../contracts/docs/native-sol-verification.json).
The production demo currently runs at <http://localhost:3100>.

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
