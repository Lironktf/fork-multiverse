/** Local development only: privileged signing never enters the Next.js bundle. */
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
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { makeClient, pda, BN, PROGRAM_ID } from "../client/anchor.js";
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

const directory = resolve(process.env.FORK_LOCAL_DIR ?? ".local/app");
mkdirSync(directory, { recursive: true, mode: 0o700 });
// Devnet: FORK_ADMIN_KEYPAIR points at a pre-funded signer kept outside the repo (mode 600).
const keyPath =
  process.env.FORK_ADMIN_KEYPAIR ?? join(directory, "admin.keypair.json");
const admin = existsSync(keyPath)
  ? Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8"))),
    )
  : Keypair.generate();
if (!existsSync(keyPath))
  writeFileSync(keyPath, JSON.stringify([...admin.secretKey]), { mode: 0o600 });
const { program, connection, send, local } = makeClient(admin);
// makeClient only allows a non-local RPC for the official devnet with ENABLE_DEVNET=yes.
// Collateral is always this service's own worthless mock mint on either cluster.
const CLUSTER = local ? "localnet" : "devnet";
// Devnet SOL cannot be airdropped (public faucet closed, measured 2026-11-20: HTTP 410),
// so the admin tops up each user wallet for fees, bounded per wallet and in total.
// ASSUMPTION: 0.02 SOL covers a session (~5,000 lamports/tx plus token-account rent);
// overturned if users hit insufficient-funds errors mid-session.
const FEE_TOPUP_LAMPORTS = 20_000_000;
const FEE_TOPUP_BUDGET_LAMPORTS = Number(
  process.env.FORK_FEE_TOPUP_BUDGET_LAMPORTS ?? 500_000_000,
);
let feeTopupSpent = 0;
const config = pda("config", admin.publicKey);
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
const log = (kind: string, data: unknown) =>
  appendFileSync(
    join(directory, "activity.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), kind, data }) + "\n",
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
const units = (n: number) => new BN(n * 1_000_000);
let markets: MarketDescriptor[] = [];
let mint: PublicKey;
let genesis: string;

async function verifyDeployment() {
  const account = await connection.getAccountInfo(PROGRAM_ID);
  if (!account?.executable)
    throw new Error("Program missing. Start npm run validator:live.");
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
}
async function initialize() {
  await verifyDeployment();
  genesis = await connection.getGenesisHash();
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
    mint =
      existing?.mint ??
      (await createMint(connection, admin, admin.publicKey, null, 6));
    if (!existing)
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
}
function publicConfig(): AppConfig {
  return {
    cluster: CLUSTER,
    rpc: connection.rpcEndpoint,
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
async function prepare(body: { parent: unknown; target: unknown }) {
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
      await program.methods
        .createMarket(units(100), new BN(0))
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
  process.env.FORK_AUTOBUYER_KEYPAIR ?? join(directory, "autobuyer.keypair.json");
const executor = existsSync(executorPath)
  ? Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(executorPath, "utf8"))),
    )
  : Keypair.generate();
if (!existsSync(executorPath))
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
  return rule;
}
function cancelRule(id: unknown) {
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error("Unknown rule.");
  if (rule.status !== "armed") throw new Error(`Rule is already ${rule.status}.`);
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
    rule.error = String((error as Error).message ?? error).slice(0, 400);
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
        prepare(body as { parent: unknown; target: unknown }),
      );
    else if (req.method === "POST" && url.pathname === "/refresh")
      data = await serial(() => refresh(descriptor(body.market)));
    else if (req.method === "GET" && url.pathname === "/rules")
      data = { executor: executor.publicKey.toBase58(), rules };
    else if (req.method === "POST" && url.pathname === "/rules")
      data = await serial(() =>
        body.op === "cancel"
          ? Promise.resolve(cancelRule(body.id))
          : createRule(body),
      );
    else if (req.method === "POST" && url.pathname === "/faucet")
      data = await serial(() => faucet(String(body.owner)));
    else {
      res.statusCode = 404;
      throw new Error("Unknown local endpoint.");
    }
    res.end(JSON.stringify({ ok: true, data }));
  } catch (error) {
    res.statusCode = res.statusCode === 404 ? 404 : 400;
    res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
  }
}).listen(Number(process.env.FORK_SERVICE_PORT ?? "8787"), "127.0.0.1", () =>
  console.log(
    `Fork ${CLUSTER} service: http://127.0.0.1:${process.env.FORK_SERVICE_PORT ?? "8787"} (mock funds, live Gemini, real oracle polling)`,
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
setInterval(() => {
  if (!rules.some((r) => r.status === "armed")) return;
  void serial(checkRules).catch((e) =>
    log("auto-buy-loop-error", { error: String(e) }),
  );
}, Number(process.env.FORK_AUTOBUY_INTERVAL_MS ?? 15_000)).unref();
