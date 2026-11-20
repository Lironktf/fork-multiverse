/**
 * Loopback-only localnet/devnet service. Privileged signing never enters the Next.js bundle.
 *
 * Two collateral modes share this code and the same on-chain program (one instance each):
 *  - FORK_COLLATERAL=mock (default): the service's own worthless 6-decimal mint. Powers the
 *    "If this happens, buy" auto-buy rules, mock faucet and fee top-ups.
 *  - FORK_COLLATERAL=sol: native devnet SOL (9 decimals, `config-sol` PDA). Powers the
 *    graph-linked Trade tab: wallets deposit/withdraw real (devnet) SOL, markets are sized
 *    from a 0.1 SOL budget and charge an LP fee (FORK_FEE_BPS, default 100).
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { makeClient, pda, BN, PROGRAM_ID } from "../client/anchor.js";
import { validateNetwork } from "../client/network.js";
import { nativeSolAccount } from "../client/native-sol.js";
import { requiredSubsidy } from "../research/lmsr.js";
import { catalogPage } from "../demo/catalog.js";
import {
  bindingHash,
  exactContract,
  fetchEvent,
  fetchRules,
  parseEvent,
  relay,
  settlement,
  sha256,
  termsHash,
  timestamp,
  type Outcome,
} from "../oracle/gemini.js";
import {
  contractObservation,
  crosses,
  describeTrigger,
  parseRuleInput,
  resolveOutcome,
  CLOSE_BUFFER_S,
  spotObservation,
  type AutoBuyRule,
  type Observation,
} from "./autobuy.js";
import type {
  AppConfig,
  Instrument,
  MarketBinding,
  MarketDescriptor,
} from "../client/app-types.js";

const SOL = process.env.FORK_COLLATERAL === "sol";
if (!["sol", "mock", undefined].includes(process.env.FORK_COLLATERAL))
  throw new Error("FORK_COLLATERAL must be mock or sol.");
const directory = resolve(
  process.env.FORK_LOCAL_DIR ??
    process.env.FORK_APP_DIR ??
    (SOL ? ".local/sol-app" : ".local/app"),
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
// Devnet: FORK_ADMIN_KEYPAIR (or SIGNER_PATH) points at a pre-funded signer kept outside the repo (mode 600).
const configuredKey = process.env.FORK_ADMIN_KEYPAIR ?? process.env.SIGNER_PATH;
if (configuredKey && !existsSync(configuredKey))
  throw new Error("Configured operator signer does not exist.");
const keyPath = configuredKey ?? join(directory, "admin.keypair.json");
const admin = existsSync(keyPath)
  ? Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8"))),
    )
  : Keypair.generate();
if (!existsSync(keyPath))
  writeFileSync(keyPath, JSON.stringify([...admin.secretKey]), { mode: 0o600 });
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const { program, connection, send, local } = makeClient(admin, rpc);
// makeClient only allows a non-local RPC for devnet (official or Helius) with ENABLE_DEVNET=yes.
const CLUSTER = local ? "localnet" : "devnet";
if (!local && !configuredKey)
  throw new Error(
    "Devnet requires FORK_ADMIN_KEYPAIR (or SIGNER_PATH) for an existing funded operator.",
  );
// Devnet SOL cannot be airdropped (public faucet closed, measured 2026-11-20: HTTP 410),
// so the admin tops up each user wallet for fees, bounded per wallet and in total.
// ASSUMPTION: 0.02 SOL covers a session (~5,000 lamports/tx plus token-account rent);
// overturned if users hit insufficient-funds errors mid-session.
const FEE_TOPUP_LAMPORTS = 20_000_000;
const FEE_TOPUP_BUDGET_LAMPORTS = Number(
  process.env.FORK_FEE_TOPUP_BUDGET_LAMPORTS ?? 500_000_000,
);
let feeTopupSpent = 0;
// SOL configurations use their own seed so legacy 6-decimal accounts can never be read as SOL.
const config = pda(SOL ? "config-sol" : "config", admin.publicKey);
// A single upstream gate also covers rules documents and concurrent selectors.
let sourceQueue: Promise<unknown> = Promise.resolve();
let lastSourceCall = 0;
const sourceFetch: typeof fetch = async (input, init) => {
  const call = sourceQueue.then(async () => {
    const delay = Math.max(0, lastSourceCall + 1000 - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastSourceCall = Date.now();
    return fetch(input, init);
  });
  sourceQueue = call.catch(() => {});
  return call;
};
const manifestPath = join(directory, "session.json");
const idlHash = sha256(
  readFileSync(new URL("../target/idl/fork_contracts.json", import.meta.url)),
);
/** RPC URLs (e.g. Helius) carry an API key in the query string: strip it from anything we log or return. */
const redact = (text: string) =>
  text.replace(/api-key=[^&\s"']+/gi, "api-key=REDACTED");
const log = (kind: string, data: unknown) =>
  appendFileSync(
    join(directory, "activity.jsonl"),
    redact(JSON.stringify({ at: new Date().toISOString(), kind, data })) + "\n",
  );
const transact = async (
  label: string,
  ix: Parameters<typeof send>[0][number],
  unique = false,
) => {
  const instructions = [ix];
  // Repeated syncs can otherwise have identical signatures when simulation
  // reuses a recent blockhash. A memo changes identity, not market balances.
  if (unique)
    instructions.push(
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
        data: Buffer.from(`fork-sync:${randomUUID()}`),
      }),
    );
  const signature = await send(instructions);
  log("transaction", { label, signature });
  return signature;
};
const DECIMALS = SOL ? 1_000_000_000 : 1_000_000;
const units = (n: number) => new BN(Math.round(n * DECIMALS));
let markets: MarketDescriptor[] = [];
let mint: PublicKey;
let genesis: string;

let deploymentCheckedAt = 0;
async function verifyDeployment() {
  if (Date.now() - deploymentCheckedAt < 30_000) return;
  const account = await connection.getAccountInfo(PROGRAM_ID);
  if (!account?.executable)
    throw new Error(
      "Program missing on the configured network. Deploy it before starting the service.",
    );
  const binary = readFileSync(
    new URL("../target/deploy/fork_contracts.so", import.meta.url),
  );
  let deployed: Buffer;
  if (
    account.owner.toBase58() === "BPFLoaderUpgradeab1e11111111111111111111111"
  ) {
    const dataAddress = new PublicKey(account.data.subarray(4, 36));
    const data = await connection.getAccountInfo(dataAddress);
    if (!data || data.data.readUInt32LE(0) !== 3)
      throw new Error("Invalid deployed ProgramData.");
    deployed = data.data.subarray(45, 45 + binary.length);
  } else {
    deployed = account.data.subarray(0, binary.length);
  }
  if (!binary.equals(deployed))
    throw new Error(
      "Stale deployed program: binary differs from target/deploy. Use a new validator ledger or explicitly redeploy; no ledger is reset automatically.",
    );
  deploymentCheckedAt = Date.now();
}
async function initialize() {
  genesis = await connection.getGenesisHash();
  validateNetwork(CLUSTER, rpc, genesis);
  await verifyDeployment();
  if (existsSync(manifestPath)) {
    const saved = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      saved.genesis !== genesis ||
      saved.program !== PROGRAM_ID.toBase58() ||
      saved.idlHash !== idlHash
    )
      throw new Error(
        "Stale application session: genesis/program/IDL changed. Use a new FORK_LOCAL_DIR.",
      );
    mint = new PublicKey(saved.mint);
    if (SOL !== mint.equals(NATIVE_MINT))
      throw new Error(
        "This app directory holds the other collateral type. Use a separate FORK_LOCAL_DIR per collateral.",
      );
    markets = saved.markets;
    const c = await program.account.config.fetch(config);
    if (!c.mint.equals(mint) || !c.admin.equals(admin.publicKey))
      throw new Error("Configuration mismatch.");
  } else {
    if (local) {
      const sig = await connection.requestAirdrop(
        admin.publicKey,
        20_000_000_000,
      );
      const result = await connection.confirmTransaction(sig, "confirmed");
      if (result.value.err) throw new Error("Local SOL funding failed.");
    } else if ((await connection.getBalance(admin.publicKey)) < 100_000_000)
      throw new Error(
        `Devnet admin ${admin.publicKey.toBase58()} needs at least 0.1 SOL (faucet.solana.com).`,
      );
    const existing = await program.account.config.fetchNullable(config);
    if (existing && !existing.admin.equals(admin.publicKey))
      throw new Error(
        "Configuration authority changed; cannot resume initialization.",
      );
    if (SOL) {
      mint = NATIVE_MINT;
      if (existing && !existing.mint.equals(NATIVE_MINT))
        throw new Error("SOL config has incompatible collateral.");
    } else
      mint =
        existing?.mint ??
        (await createMint(connection, admin, admin.publicKey, null, 6));
    if (!existing && SOL)
      await transact(
        "initialize SOL config",
        await program.methods
          .initializeSolConfig(
            admin.publicKey,
            admin.publicKey,
            units(10),
            units(1000),
          )
          .accountsStrict({
            admin: admin.publicKey,
            config,
            mint,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      );
    else if (!existing)
      await transact(
        "initialize config",
        await program.methods
          .initializeConfig(
            admin.publicKey,
            admin.publicKey,
            units(1000),
            units(1_000_000),
          )
          .accountsStrict({
            admin: admin.publicKey,
            config,
            mint,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      );
    save();
  }
  // LP fee for future markets. Mock collateral keeps 0 by default so the if-then flow is unchanged.
  const feeBps = Number(process.env.FORK_FEE_BPS ?? (SOL ? "100" : "0"));
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000)
    throw new Error("FORK_FEE_BPS must be 0..1000");
  if ((await program.account.config.fetch(config)).feeBps !== feeBps)
    await transact(
      "set fee for future markets",
      await program.methods
        .setFee(feeBps)
        .accountsStrict({ authority: admin.publicKey, config })
        .instruction(),
    );
}
function publicConfig(): AppConfig {
  return {
    cluster: CLUSTER,
    // never expose the service's RPC URL to the browser on devnet: it may carry an API key
    rpc: local ? connection.rpcEndpoint : "https://api.devnet.solana.com",
    genesis,
    program: PROGRAM_ID.toBase58(),
    config: config.toBase58(),
    mint: mint.toBase58(),
    idlHash,
  };
}
function save() {
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...publicConfig(), markets }, null, 2),
  );
}
function plain(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as { value?: string; content?: unknown[] };
  return (node.value ?? "") + (node.content?.map(plain).join(" ") ?? "");
}
function eventPda(b: MarketBinding) {
  return pda(
    "event",
    config,
    Uint8Array.from(bindingHash(b.ticker, b.instrument)),
  );
}
function descriptor(address: unknown) {
  const found = markets.find((m) => m.address === address);
  if (!found) throw new Error("Unknown market in this configuration.");
  return found;
}
async function inspect(
  ticker: string,
  instrument: string,
): Promise<Instrument> {
  const event = parseEvent(await fetchEvent(ticker, sourceFetch));
  const contract = exactContract(event, { ticker, instrument });
  const rules = await fetchRules(
    contract.termsAndConditionsUrl ?? "",
    sourceFetch,
  );
  const rulesDirectory = join(directory, "rules");
  mkdirSync(rulesDirectory, { recursive: true });
  writeFileSync(join(rulesDirectory, sha256(rules) + ".pdf"), rules);
  log("source-inspection", { event, instrument, rulesSha256: sha256(rules) });
  const registered = await program.account.externalEvent.fetchNullable(
    pda("event", config, Uint8Array.from(bindingHash(ticker, instrument))),
  );
  return {
    ticker,
    instrument,
    title: ticker,
    label: instrument,
    status: event.status === "active" ? contract.status : event.status,
    marketState: contract.marketState,
    expiry: contract.expiryDate!,
    rulesUrl: contract.termsAndConditionsUrl!,
    description: plain(contract.description ?? event.description),
    termsHash: termsHash(event, contract, rules),
    closeTs: registered?.closeTs.toNumber(),
  };
}
async function binding(input: unknown): Promise<MarketBinding> {
  const value = input as {
    ticker: string;
    instrument: string;
    termsHash: string;
    close: string;
    reviewed: boolean;
  };
  if (!value || value.reviewed !== true)
    throw new Error("Review source rules before registration.");
  const item = await inspect(value.ticker, value.instrument);
  if (item.status !== "active" || item.marketState === "closed")
    throw new Error("Choose an active, open source contract.");
  if (item.termsHash !== value.termsHash)
    throw new Error("Source terms changed. Review them again.");
  const closeTs = timestamp(value.close),
    observationTs = timestamp(item.expiry);
  if (closeTs <= Math.floor(Date.now() / 1000) || closeTs > observationTs)
    throw new Error(
      "Trading close must be future UTC, no later than observation; review the source rules.",
    );
  if (item.closeTs !== undefined && closeTs !== item.closeTs)
    throw new Error(
      "Immutable trading close differs from the registered instrument.",
    );
  const result = {
    ticker: value.ticker,
    instrument: value.instrument,
    closeTs,
    observationTs,
    termsHash: value.termsHash,
  };
  log("source-selection", { ...item, closeTs });
  return result;
}
async function prepare(body: {
  parent: unknown;
  target: unknown;
  communityFunding?: boolean;
}) {
  const a = await binding(body.parent),
    b = await binding(body.target);
  if (a.instrument === b.instrument)
    throw new Error("A and B must be distinct exact contracts.");
  const parent = eventPda(a),
    target = eventPda(b),
    market = pda("market", config, parent, target),
    vault = pda("vault", market);
  const existing = markets.find((m) => m.address === market.toBase58());
  if (existing) return existing;
  for (const item of [a, b]) {
    const event = eventPda(item);
    const current = await program.account.externalEvent.fetchNullable(event);
    if (current) {
      if (
        current.closeTs.toNumber() !== item.closeTs ||
        Buffer.from(current.termsHash).toString("hex") !== item.termsHash
      )
        throw new Error("Immutable registration mismatch.");
    } else {
      await transact(
        "register " + item.instrument,
        await program.methods
          .registerEvent(
            bindingHash(item.ticker, item.instrument),
            item.ticker,
            item.instrument,
            [...Buffer.from(item.termsHash, "hex")],
            new BN(item.closeTs),
            new BN(item.observationTs),
          )
          .accountsStrict({
            admin: admin.publicKey,
            config,
            event,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      );
    }
  }
  if (!(await program.account.market.fetchNullable(market))) {
    await transact(
      "create conditional market",
      await (
        SOL
          ? // depth sized from a 0.1 SOL budget (see docs/liquidity.md)
            program.methods.createMarketForBudget(units(0.1), new BN(0))
          : program.methods.createMarket(units(100), new BN(0))
      )
        .accountsStrict({
          admin: admin.publicKey,
          config,
          parent,
          target,
          mint,
          market,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
  }
  if (SOL)
    await fundSolLiquidity(
      market,
      parent,
      target,
      vault,
      body.communityFunding,
    );
  else await fundMockLiquidity(market, parent, target, vault);
  const result: MarketDescriptor = {
    address: market.toBase58(),
    parent: parent.toBase58(),
    target: target.toBase58(),
    vault: vault.toBase58(),
    bindings: [a, b],
  };
  markets.push(result);
  save();
  return result;
}
/** SOL: the operator funds the exact required subsidy, unless wallets fund it (community). */
async function fundSolLiquidity(
  market: PublicKey,
  parent: PublicKey,
  target: PublicKey,
  vault: PublicKey,
  communityFunding?: boolean,
) {
  if (communityFunding) return;
  const lp = pda("lp", market, admin.publicKey);
  if (!(await program.account.lp.fetchNullable(lp)))
    await transact(
      "open LP",
      await program.methods
        .openLp()
        .accountsStrict({
          owner: admin.publicKey,
          market,
          lp,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
  const state = await program.account.market.fetch(market);
  if (state.started) return;
  const needed = new BN(
    requiredSubsidy({
      b: BigInt(state.b.toString()),
      offsetYes: BigInt(state.offsetYes.toString()),
      offsetNo: BigInt(state.offsetNo.toString()),
    }).toString(),
  ).sub(state.lpDeposits);
  if (needed.gt(new BN(0))) {
    const native = await nativeSolAccount(
      connection,
      admin.publicKey,
      BigInt(needed.toString()),
    );
    const signature = await send([
      ...native.open,
      await program.methods
        .fundLp(needed)
        .accountsStrict({
          owner: admin.publicKey,
          config,
          market,
          parent,
          target,
          lp,
          mint,
          vault,
          userToken: native.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
      native.close,
    ]);
    log("transaction", { label: "fund SOL liquidity", signature });
  }
  await transact(
    "start market",
    await program.methods
      .startMarket()
      .accountsStrict({ config, market, parent, target })
      .instruction(),
  );
}
/** Mock collateral: mint and fund the fixed 80-unit subsidy, then start trading. */
async function fundMockLiquidity(
  market: PublicKey,
  parent: PublicKey,
  target: PublicKey,
  vault: PublicKey,
) {
  const lp = pda("lp", market, admin.publicKey);
  const userToken = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mint,
      admin.publicKey,
    )
  ).address;
  if (!(await program.account.lp.fetchNullable(lp)))
    await transact(
      "open LP",
      await program.methods
        .openLp()
        .accountsStrict({
          owner: admin.publicKey,
          market,
          lp,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
  const state = await program.account.market.fetch(market);
  if (!state.started) {
    const needed = units(80).sub(state.lpDeposits);
    if (needed.gt(new BN(0))) {
      await mintTo(
        connection,
        admin,
        mint,
        userToken,
        admin,
        BigInt(needed.toString()),
      );
      await transact(
        "fund mock LP subsidy",
        await program.methods
          .fundLp(needed)
          .accountsStrict({
            owner: admin.publicKey,
            config,
            market,
            parent,
            target,
            lp,
            mint,
            vault,
            userToken,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
      );
    }
    await transact(
      "start market",
      await program.methods
        .startMarket()
        .accountsStrict({ config, market, parent, target })
        .instruction(),
    );
  }
}
async function refresh(m: MarketDescriptor) {
  for (const b of m.bindings) {
    const event = eventPda(b),
      current = await program.account.externalEvent.fetch(event);
    if (!("unresolved" in current.outcome)) continue;
    const raw = await fetchEvent(b.ticker, sourceFetch),
      parsed = parseEvent(raw),
      contract = exactContract(parsed, b);
    const rules = await fetchRules(
      contract.termsAndConditionsUrl!,
      sourceFetch,
    );
    const payload = settlement(raw, b, rules, Math.floor(Date.now() / 1000));
    log("source-poll", {
      market: m.address,
      instrument: b.instrument,
      raw,
      payload,
    });
    if (payload && !(payload.outcome === "unresolved" && current.halted)) {
      await relay(
        payload,
        {
          async current() {
            const state = await program.account.externalEvent.fetch(event);
            return {
              outcome: Object.keys(state.outcome)[0] as Outcome,
              sourceTs: state.sourceTs.toNumber(),
            };
          },
          async submit(p) {
            return transact(
              "oracle report",
              await program.methods
                .report(
                  p.binding,
                  p.termsHash,
                  { [p.outcome]: {} },
                  new BN(p.sourceTs),
                )
                .accountsStrict({ reporter: admin.publicKey, config, event })
                .instruction(),
            );
          },
        },
        (data) => log("oracle", data),
      );
    }
  }
  const accounts = {
    config,
    market: new PublicKey(m.address),
    parent: new PublicKey(m.parent),
    target: new PublicKey(m.target),
  };
  // Materialize status even when sources remain unresolved. Never infer a final outcome.
  // Only send a sync transaction when the on-chain status would change: this mirrors
  // Market::derive_status in state.rs exactly, and saves a fee-paying tx per market per poll.
  const before = await program.account.market.fetch(accounts.market);
  const [parentState, targetState] = await Promise.all([
    program.account.externalEvent.fetch(accounts.parent),
    program.account.externalEvent.fetch(accounts.target),
  ]);
  const outcome = (x: typeof parentState) => Object.keys(x.outcome)[0];
  const a = outcome(parentState),
    b = outcome(targetState);
  const desired =
    a === "no" || a === "invalid" || b === "invalid"
      ? "void"
      : a === "yes" && b === "yes"
        ? "settledYes"
        : a === "yes" && b === "no"
          ? "settledNo"
          : parentState.halted || targetState.halted
            ? "halted"
            : b !== "unresolved"
              ? "frozen"
              : !before.started
                ? "funding"
                : a === "yes"
                  ? "active"
                  : "pending";
  if (
    !["void", "settledYes", "settledNo"].includes(
      Object.keys(before.status)[0]!,
    ) &&
    !(desired in before.status)
  )
    await transact(
      "sync lifecycle",
      await program.methods.syncMarket().accountsStrict(accounts).instruction(),
      true,
    );
  return { checkedAt: new Date().toISOString() };
}
async function faucet(ownerText: string) {
  const owner = new PublicKey(ownerText);
  const signatures: string[] = [];
  if (local && (await connection.getBalance(owner)) < 100_000_000) {
    const signature = await connection.requestAirdrop(owner, 1_000_000_000);
    const result = await connection.confirmTransaction(signature, "confirmed");
    if (result.value.err) throw new Error("SOL faucet failed.");
    signatures.push(signature);
  } else if (
    !local &&
    (await connection.getBalance(owner)) < FEE_TOPUP_LAMPORTS / 2
  ) {
    if (feeTopupSpent + FEE_TOPUP_LAMPORTS > FEE_TOPUP_BUDGET_LAMPORTS)
      throw new Error(
        "Devnet fee top-up budget exhausted; fund this wallet at faucet.solana.com.",
      );
    feeTopupSpent += FEE_TOPUP_LAMPORTS;
    signatures.push(
      await transact(
        "devnet fee top-up",
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: owner,
          lamports: FEE_TOPUP_LAMPORTS,
        }),
      ),
    );
  }
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    mint,
    owner,
  );
  if (ata.amount < 1000_000_000n)
    signatures.push(
      await mintTo(
        connection,
        admin,
        mint,
        ata.address,
        admin,
        1000_000_000n - ata.amount,
      ),
    );
  log("faucet", { owner: ownerText, signatures });
  return { signatures };
}
// ---------------------------------------------------------------------------
// Auto-buy rules. A browser wallet cannot sign while its owner is away, so rules
// execute from a dedicated auto-trader keypair held by this service (mock funds
// only, never the user's wallet). Each rule escrows its max cost into the
// auto-trader's position in that market when armed, and fires at most once.
const rulesPath = join(directory, "autobuy.json");
const executorPath =
  process.env.FORK_AUTOBUYER_KEYPAIR ??
  join(directory, "autobuyer.keypair.json");
const executor = existsSync(executorPath)
  ? Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(executorPath, "utf8"))),
    )
  : Keypair.generate();
if (!existsSync(executorPath) && !SOL)
  writeFileSync(executorPath, JSON.stringify([...executor.secretKey]), {
    mode: 0o600,
  });
let rules: AutoBuyRule[] = existsSync(rulesPath)
  ? JSON.parse(readFileSync(rulesPath, "utf8"))
  : [];
const saveRules = () =>
  writeFileSync(rulesPath, JSON.stringify(rules, null, 2));
function traderAccounts(m: MarketDescriptor) {
  const market = new PublicKey(m.address);
  return {
    owner: executor.publicKey,
    config,
    market,
    parent: new PublicKey(m.parent),
    target: new PublicKey(m.target),
    trader: pda("trader", market, executor.publicKey),
  };
}
async function escrowForRule(m: MarketDescriptor, maxCost: number) {
  // rent for the auto-trader's position account (fees are paid by admin)
  if ((await connection.getBalance(executor.publicKey)) < 10_000_000) {
    if (local) {
      const sig = await connection.requestAirdrop(
        executor.publicKey,
        1_000_000_000,
      );
      await connection.confirmTransaction(sig, "confirmed");
    } else
      await transact(
        "auto-trader rent",
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: executor.publicKey,
          lamports: 20_000_000,
        }),
      );
  }
  const amount = BigInt(Math.round(maxCost * 1_000_000));
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    mint,
    executor.publicKey,
  );
  await mintTo(connection, admin, mint, ata.address, admin, amount);
  const acc = traderAccounts(m);
  const ixs = [];
  if (!(await program.account.trader.fetchNullable(acc.trader)))
    ixs.push(
      await program.methods
        .openTrader()
        .accountsStrict({
          owner: executor.publicKey,
          market: acc.market,
          trader: acc.trader,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
  ixs.push(
    await program.methods
      .deposit(new BN(amount.toString()))
      .accountsStrict({
        ...acc,
        mint,
        vault: new PublicKey(m.vault),
        userToken: ata.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  );
  const signature = await send(ixs, [executor]);
  log("transaction", { label: "auto-buy escrow", signature });
  return signature;
}
async function createRule(input: unknown) {
  const parsed = parseRuleInput(input);
  const m = descriptor(parsed.market);
  const closeTs = Math.min(...m.bindings.map((b) => b.closeTs));
  if (closeTs <= Math.floor(Date.now() / 1000))
    throw new Error("This market's trading close has passed.");
  if (rules.filter((r) => r.status === "armed").length >= 20)
    throw new Error("At most 20 armed auto-buy rules.");
  await escrowForRule(m, parsed.action.maxCost);
  const rule: AutoBuyRule = {
    id: randomUUID(),
    ...parsed,
    status: "armed",
    createdAt: new Date().toISOString(),
    executor: executor.publicKey.toBase58(),
  };
  rules.unshift(rule);
  saveRules();
  log("auto-buy-armed", { ...rule, label: describeTrigger(rule.trigger) });
  // check right away instead of waiting for the next 15 s tick
  setTimeout(() => void serial(checkRules).catch(() => {}), 0);
  return rule;
}
/**
 * One-step rule from the app: "if A happens, buy B". A and B arrive as the world's
 * (ticker, outcome) pairs; this resolves the exact contracts, registers the B|A=YES
 * market if needed (close = 1h before the earliest observation, or the immutable
 * close already registered), escrows and arms a trigger on A's odds.
 */
async function quickRule(body: Record<string, unknown>) {
  const cond = body.condition as { ticker?: string; outcome?: string };
  const tgt = body.target as { ticker?: string; outcome?: string };
  const tickerOk = (t?: string) => !!t && /^[A-Za-z0-9._-]{1,64}$/.test(t);
  if (
    !tickerOk(cond?.ticker) ||
    !tickerOk(tgt?.ticker) ||
    !cond.outcome ||
    !tgt.outcome
  )
    throw new Error("Both A and B must be live Gemini outcomes.");
  const a = resolveOutcome(
    await fetchEvent(cond.ticker!, sourceFetch),
    cond.outcome,
  );
  if (!a.yes)
    throw new Error(
      "A must be a YES outcome: these markets only support “B given A = YES”.",
    );
  const b = resolveOutcome(
    await fetchEvent(tgt.ticker!, sourceFetch),
    tgt.outcome,
  );
  if (a.instrument === b.instrument)
    throw new Error("A and B are the same contract.");
  const ia = await inspect(cond.ticker!, a.instrument);
  const ib = await inspect(tgt.ticker!, b.instrument);
  for (const i of [ia, ib])
    if (i.status !== "active" || i.marketState === "closed")
      throw new Error(`${i.instrument} is not open for trading on Gemini.`);
  const earliest =
    Math.min(timestamp(ia.expiry), timestamp(ib.expiry)) - CLOSE_BUFFER_S;
  const closeFor = (i: Instrument) =>
    new Date((i.closeTs ?? earliest) * 1000).toISOString();
  const market = await prepare({
    parent: {
      ticker: cond.ticker,
      instrument: a.instrument,
      termsHash: ia.termsHash,
      close: closeFor(ia),
      reviewed: true,
    },
    target: {
      ticker: tgt.ticker,
      instrument: b.instrument,
      termsHash: ib.termsHash,
      close: closeFor(ib),
      reviewed: true,
    },
  });
  const against = body.against === true;
  return createRule({
    market: market.address,
    trigger: {
      kind: "contract",
      ticker: cond.ticker,
      instrument: a.instrument,
      op: ">=",
      value: Number(body.threshold),
    },
    action: {
      side: b.yes !== against ? "yes" : "no",
      shares: body.shares,
      maxCost: body.maxCost,
    },
    labels: body.labels,
  });
}
function cancelRule(id: unknown) {
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error("Unknown rule.");
  if (rule.status !== "armed")
    throw new Error(`Rule is already ${rule.status}.`);
  rule.status = "cancelled";
  saveRules();
  log("auto-buy-cancelled", { id });
  return rule;
}
async function observe(rule: AutoBuyRule): Promise<Observation | null> {
  const t = rule.trigger;
  if (t.kind === "spot") {
    const r = await sourceFetch(
      `https://api.gemini.com/v1/pubticker/${encodeURIComponent(t.symbol)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!r.ok) throw new Error(`Gemini ticker HTTP ${r.status}`);
    return spotObservation(await r.json());
  }
  return contractObservation(
    await fetchEvent(t.ticker, sourceFetch),
    t.instrument,
  );
}
async function fire(rule: AutoBuyRule, o: Observation) {
  const m = descriptor(rule.market);
  rule.firedAt = new Date().toISOString();
  rule.fired = o;
  try {
    await refresh(m); // materialize lifecycle first; trading may have closed
    const limit = new BN(Math.round(rule.action.maxCost * 1_000_000));
    const signature = await send(
      [
        await program.methods
          .trade(
            rule.action.side === "yes",
            true,
            units(rule.action.shares),
            limit,
          )
          .accountsStrict(traderAccounts(m))
          .instruction(),
      ],
      [executor],
    );
    rule.status = "fired";
    rule.signature = signature;
    log("auto-buy-fired", { id: rule.id, observation: o, signature });
  } catch (error) {
    rule.status = "failed";
    rule.error = redact(String((error as Error).message ?? error)).slice(
      0,
      400,
    );
    log("auto-buy-failed", { id: rule.id, observation: o, error: rule.error });
  }
  saveRules();
}
async function checkRules() {
  const now = Math.floor(Date.now() / 1000);
  for (const rule of rules.filter((r) => r.status === "armed")) {
    const m = markets.find((x) => x.address === rule.market);
    if (!m || Math.min(...m.bindings.map((b) => b.closeTs)) <= now) {
      rule.status = "expired";
      saveRules();
      continue;
    }
    try {
      const o = await observe(rule);
      if (o) rule.last = o;
      if (crosses(rule.trigger, o)) await fire(rule, o!);
    } catch (error) {
      log("auto-buy-observe-error", { id: rule.id, error: String(error) });
    }
  }
  saveRules();
}

await initialize();
// Serialize privileged operations and polling to avoid duplicate registration/report races.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}
createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.headers["x-fork-local"] !== "1" || req.headers.origin)
      throw new Error("Use the local Fork application proxy.");
    const url = new URL(req.url!, "http://127.0.0.1");
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 16_384) throw new Error("Request too large.");
      }
      body = JSON.parse(raw);
    }
    let data: unknown;
    if (req.method === "GET" && url.pathname === "/config") {
      await verifyDeployment();
      data = publicConfig();
    } else if (req.method === "GET" && url.pathname === "/markets")
      data = markets;
    else if (req.method === "GET" && url.pathname === "/catalog") {
      const offset = Number(url.searchParams.get("offset") ?? "0");
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
        throw new Error("Invalid page.");
      const page = await catalogPage(
        (url.searchParams.get("q") ?? "").slice(0, 80),
        offset,
        sourceFetch,
      );
      data = {
        ...page,
        events: undefined,
        items: page.events.flatMap((e, i) =>
          e.contracts
            .filter((c) => c.status === "active" && c.marketState !== "closed")
            .map((c) => ({
              ticker: e.ticker,
              title: page.titles[i],
              instrument: c.instrumentSymbol,
              label:
                (c as unknown as { label?: string }).label ??
                c.instrumentSymbol,
              status: c.status,
              expiry: c.expiryDate,
              rulesUrl: c.termsAndConditionsUrl,
            })),
        ),
      };
    } else if (req.method === "GET" && url.pathname === "/instrument")
      data = await inspect(
        url.searchParams.get("ticker") ?? "",
        url.searchParams.get("instrument") ?? "",
      );
    else if (req.method === "POST" && url.pathname === "/markets")
      data = await serial(() =>
        prepare(
          body as {
            parent: unknown;
            target: unknown;
            communityFunding?: boolean;
          },
        ),
      );
    else if (req.method === "POST" && url.pathname === "/refresh")
      data = await serial(() => refresh(descriptor(body.market)));
    // Auto-buy rules and the mock faucet exist only on the mock-collateral instance.
    else if (SOL && ["/rules", "/faucet"].includes(url.pathname)) {
      res.statusCode = 404;
      throw new Error("Not available on the SOL collateral service.");
    } else if (req.method === "GET" && url.pathname === "/rules")
      data = { executor: executor.publicKey.toBase58(), rules };
    else if (req.method === "POST" && url.pathname === "/rules")
      data = await serial(() =>
        body.op === "cancel"
          ? Promise.resolve(cancelRule(body.id))
          : body.op === "quick"
            ? quickRule(body)
            : createRule(body),
      );
    else if (req.method === "POST" && url.pathname === "/faucet")
      data = await serial(() => faucet(String(body.owner)));
    else {
      res.statusCode = 404;
      throw new Error("Unknown local endpoint.");
    }
    res.end(
      JSON.stringify({ ok: true, data }, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  } catch (error) {
    res.statusCode = res.statusCode === 404 ? 404 : 400;
    res.end(
      JSON.stringify({ ok: false, error: redact((error as Error).message) }),
    );
  }
}).listen(Number(process.env.FORK_SERVICE_PORT ?? "8787"), "127.0.0.1", () =>
  console.log(
    `Fork ${CLUSTER} service: http://127.0.0.1:${process.env.FORK_SERVICE_PORT ?? "8787"} (${SOL ? "native SOL" : "mock"} collateral, live Gemini, real oracle polling)`,
  ),
);
let polling = false;
setInterval(() => {
  if (polling) return;
  polling = true;
  void serial(async () => {
    for (const m of markets) {
      try {
        await refresh(m);
      } catch (error) {
        log("poll-error", { market: m.address, error: String(error) });
      }
    }
  }).finally(() => {
    polling = false;
  });
}, 30_000).unref();

// Auto-buy watcher: every 15s, through the same serialized queue and 1 req/s Gemini gate.
setInterval(
  () => {
    if (!rules.some((r) => r.status === "armed")) return;
    void serial(checkRules).catch((e) =>
      log("auto-buy-loop-error", { error: String(e) }),
    );
  },
  Number(process.env.FORK_AUTOBUY_INTERVAL_MS ?? 15_000),
).unref();
