# Fork + Solana integration

## Repository layout

The Next.js app and Anchor workspace are consolidated under `fork/` on branch
`integration/solana-monorepo`. Contract sources are ordinary files in the root
repository. The previously empty nested Git metadata was preserved locally under
`.git/nested-repositories/contracts.git`; it is not required by a checkout.

- `src/`: original Next.js interface, API routes and browser client.
- `contracts/programs/`: active Anchor program and Rust integration tests.
- `contracts/client/`, `oracle/`, `app/`: typed Node client, Gemini adapter and local service.
- `contracts/scripts/`, `demo/`, `tests/`: build/setup tools and contract verification.
- `tests/`: frontend domain and browser tests.
- `docs/`: architecture, verification and original product specification.
- `docs/legacy/fork_positions/`: historical unused program draft.

The Node packages retain separate lockfiles to preserve their tested Anchor/web3
compatibility boundaries. Build artifacts, local signers and validator ledgers
remain ignored. The original Fork appearance is unchanged.

## Compatibility map

| Existing surface                                   | Integration                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Next.js 15 / React 19 / Tailwind / Zustand         | Retained; no visual redesign or replacement application                                                        |
| Wallet Standard via existing wallet-adapter        | Retained; Anchor 1.1.2 requires web3.js 1.x; pin compatible versions                                           |
| Gemini event-level discovery                       | Retained; normalize Bitcoin/BTC and Solana/SOL searches; trading additionally selects exact instrument symbols |
| Forecast/model probabilities                       | Research only; never converted to conditional execution prices or final outcomes                               |
| SPL Memo Verse attestation                         | Retained, with correct local network labeling                                                                  |
| Undeployed `fork/docs/legacy/fork_positions` draft | Historical reference; active trading uses `fork/contracts` only                                                |
| `fork/contracts/target/idl` and `target/types`     | Generated source of browser instruction/account formats; copied by an explicit sync script                     |
| Config/event/market/trader/vault PDAs              | Derived from the generated program ID and one pinned local config                                              |
| Oracle adapter and rules hashes                    | Reused server-side; no reporter or mint-authority keys in browser bundles                                      |
| Local live demo / fixtures / research bot          | Preserved; bot remains optional and paper mode by default                                                      |

## Financial and source constraints

The only supported condition is B given exact A=YES. Multi-assumption Verses are
not automatically made into equivalent tradable claims. A=NO or supported
invalidation produces VOID and refunds original deposits. All conditional cash
and profits remain locked until final settlement. Normal payouts are conditional
cash plus winning shares. Use contract quote return data, existing reserve
checks, and a bounded execution limit. Keep trading close, observation/expiry,
source publication and Solana submission times distinct. A registration requires
explicit rules review and a conservative close; expiry is never silently used as
close. Missing source data blocks new execution; no guessed final result.

## Run from a clean checkout

Prerequisites: Node 22+, npm, Rust 1.89.0, Anchor CLI 1.1.2 and Solana CLI /
`cargo-build-sbf` 3.1.10 (the contracts project's existing pinned toolchain).
No Gemini API key is required. Use only local mock collateral.

From the repository root:

```bash
npm --prefix fork/contracts ci
npm --prefix fork ci
npm --prefix fork/contracts run build
npm --prefix fork/contracts run app:sync
```

In terminal 1, start a persistent local validator with the compiled program:

```bash
npm --prefix fork/contracts run app:validator
```

In terminal 2, start local configuration, mock collateral and oracle polling:

```bash
npm --prefix fork/contracts run app:serve
```

In terminal 3, start the original Fork application:

```bash
FORK_LOCAL_SERVICE=http://127.0.0.1:8787 \
NEXT_PUBLIC_SOLANA_CLUSTER=localnet \
NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899 \
npm --prefix fork run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`. Choose a target in Fork, then open **FORK Positions**
at the bottom of the existing Forecast panel. Search exact parent A and target B
instruments, read their rules and resolution criteria, enter a conservative UTC
trading close for each and acknowledge the rules. **Create or connect market**
registers immutable bindings and starts a local LMSR with b=100, initial log odds
zero and an 80 mock USDC funding budget. Depth is sized to that budget, with
a default 1% LP fee for new markets (`FORK_FEE_BPS`). An optional community
Funding phase allows connected wallets to fund, withdraw before start and claim
terminal LP equity. See [accounting and migration](../contracts/docs/liquidity.md). No Gemini orders are ever submitted.

Connect a Wallet Standard Solana wallet through the existing top-right button.
The wallet must support local transactions with the configured RPC. Use **Get
mock collateral + SOL**, then deposit. Request an on-chain quote, review its cost
and slippage limit, and confirm a YES/NO buy or sell in the wallet. Sells credit
conditional cash. **Redeem eligible balance** is enabled only when a confirmed
terminal state has a positive entitlement. The mock faucet tops the wallet up to
1,000 mock USDC; it is disabled outside localhost. Wallet extension compatibility
varies; the automated demonstration uses an isolated Wallet Standard bridge.

The Positions card is independent of model forecasts and multi-assumption
Verses. Its A and B instrument symbols are always displayed. Choosing a Verse or
forecast target never silently changes an existing position's economic meaning.

Production build (same local development backend):

```bash
FORK_LOCAL_SERVICE=http://127.0.0.1:8787 \
NEXT_PUBLIC_SOLANA_CLUSTER=localnet \
NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899 \
npm --prefix fork run build

FORK_LOCAL_SERVICE=http://127.0.0.1:8787 \
npm --prefix fork start -- --hostname 127.0.0.1 --port 3000
```

Public network variables are build-time values. Rebuild if they change. This is
not a production financial deployment: the local service deliberately refuses
nonlocal RPCs. The historical devnet memo capability remains available when
running Fork without this local trading integration.

## Configuration and architecture

| Setting                      | Default                     | Owner / purpose                                                          |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `RPC_URL`                    | `http://127.0.0.1:8899`     | Contracts service RPC, local only                                        |
| `FORK_LOCAL_DIR`             | `fork/contracts/.local/app` | Service session, dev signer, source audit log; relative to contracts cwd |
| `FORK_SERVICE_PORT`          | `8787`                      | Service binds only to 127.0.0.1                                          |
| `FORK_LOCAL_SERVICE`         | unset                       | Next server-only proxy address; unset disables trading backend           |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet`                    | Set `localnet` for this integration                                      |
| `NEXT_PUBLIC_SOLANA_RPC`     | network default             | Browser's public RPC; must match service genesis                         |
| `FORK_VALIDATOR_LEDGER`      | `.local/app-validator`      | Dedicated persistent app ledger                                          |
| `FORK_RPC_PORT`              | `8899`                      | Validator RPC (WebSocket uses next port)                                 |
| `FORK_FAUCET_PORT`           | `9900`                      | Validator faucet                                                         |
| `FORK_GOSSIP_PORT`           | `8001`                      | Validator gossip                                                         |
| `FORK_DYNAMIC_PORT_RANGE`    | `8002-8030`                 | Validator local dynamic ports                                            |

`fork/contracts/app/service.ts` reuses the actual oracle adapter and generated
Anchor client. It owns registration/admin/reporter/mint signing and the mock LP.
It polls registered source contracts every 30 seconds, verifies exact symbols,
terms bytes and expiry, then submits only supported real reports. Readiness checks
compare the deployed binary to the compiled `.so`. A saved session pins genesis,
program, config, mint and IDL hash. Restarting with an incompatible deployment
fails explicitly. The service exposes public DTOs, not signing material.

`fork/src/app/api/solana/[...path]/route.ts` proxies a fixed endpoint allowlist to
the loopback service. It rejects nonlocal hosts and cross-origin writes. Next
must also be served on loopback. No service code is imported into the frontend.

`fork/src/lib/contracts/client.ts` uses the generated IDL and types copied by
`app:sync`, the original Wallet Standard adapter, and web3.js 1.x as required by
Anchor. Transactions use the existing legacy wallet format, confirmed commitment,
preflight simulation and the exact submitted blockhash lifetime. Quotes come
from the program's u64 return data and QuoteEvent, not a marginal-price formula.
The execution limit uses integer micro-units. Quotes expire after 30 seconds or
changes to market/trader state. RPC genesis, account owners, discriminators,
source bindings and collateral-account mint/authority are checked. Every
confirmed write is followed by an authoritative account read at least as recent
as its confirmation slot. Polling and reloads also read the chain; localStorage
holds only selection and transaction references, never balances.

The original screens, graph renderer, global CSS, typefaces, layouts and
forecast logic remain intact. The only trading UI is the expandable existing
Positions card and network-aware wallet labels. The source-level
`fork/docs/legacy/fork_positions` draft is retained but not used for execution.
The optional research bot is unchanged and defaults to paper mode.

## Persistence and recovery

Keep the validator ledger and `.local/app` together. Restarting both and reopening
Fork restores market selection and confirmed holdings, including when switching
wallet accounts. A new browser can choose a saved pair from **Existing conditional
market**. Private local signer files, ledger data, source snapshots, downloaded
rules, generated browser IDL/types and build output are ignored.

Never run a resetting fixture validator on the app ledger. If a stale deployed
binary is detected, use a separate new ledger and `FORK_LOCAL_DIR`, or deliberately
redeploy using your local upgrade authority. No automatic reset/redeploy occurs.
With another validator already using 8899, the verification run uses:

```bash
FORK_RPC_PORT=18999 FORK_FAUCET_PORT=19900 FORK_GOSSIP_PORT=18001 \
FORK_DYNAMIC_PORT_RANGE=18002-18030 \
npm --prefix fork/contracts run app:validator

RPC_URL=http://127.0.0.1:18999 npm --prefix fork/contracts run app:serve
```

Set the browser RPC to 18999 as well. The explorer link uses a custom local RPC;
local transaction signatures are not available on public devnet explorers.

## Verification commands

```bash
npm --prefix fork/contracts run build
npm --prefix fork/contracts run app:sync
npm --prefix fork/contracts run typecheck
npm --prefix fork/contracts test
(cd fork/contracts && cargo test --locked -- --nocapture)
npm --prefix fork/contracts run format:check
npm --prefix fork run typecheck
npm --prefix fork run lint
npm --prefix fork run format:check
(cd fork && npx playwright install --with-deps chromium)
BASE_URL=http://127.0.0.1:3000 npm --prefix fork test
```

The live integration test is opt-in and requires currently open instruments and
reviewed conservative trading closes. It uses real Gemini data, the local service,
an actual validator and wallet signatures. Its test-only Wallet Standard bridge
keeps private keys in the Node test process. It does not mock RPC success.

```bash
BASE_URL=http://127.0.0.1:3000 RUN_SOLANA_E2E=1 \
FORK_TEST_PARENT=EXACT_PARENT_INSTRUMENT \
FORK_TEST_TARGET=EXACT_TARGET_INSTRUMENT \
FORK_TEST_PARENT_CLOSE=REVIEWED_ISO_UTC \
FORK_TEST_TARGET_CLOSE=REVIEWED_ISO_UTC \
npm --prefix fork run test:solana
```

See [verification.md](verification.md) for the actual run, transaction evidence,
source-rule review and remaining verification limits. Live tests never fabricate
settlement. Deterministic contract/LiteSVM tests cover VOID refunds, winning
claims, invalidation, report authorization, delayed publication, close boundaries,
reserve checks and slippage independently of unresolved live Gemini events.

To run the separate synthetic browser settlement checks against a running local
app (never the live source markets):

```bash
BASE_URL=http://127.0.0.1:3000 RUN_SOLANA_FIXTURES=1 \
  npm --prefix fork test -- tests/e2e/redemption.spec.ts
```

These tests create new isolated on-chain fixture configurations and exercise the
actual redemption button for VOID, YES and NO. Public fixture discovery is
injected by the test; no fixture outcome is routed through the live Gemini oracle.

Repeated lifecycle sync transactions carry a unique memo to avoid duplicate
signatures when simulation reuses a recent blockhash. This changes transaction
identity only; the program still enforces all lifecycle and balance rules.
