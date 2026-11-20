/** Loopback-only localnet/devnet service. Privileged signing stays outside Next.js. */
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
import { validateNetwork } from "../client/network.js";
import { strategyForWallet } from "../research/live-strategy.js";
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
import type {
  AppConfig,
  Instrument,
  MarketBinding,
  MarketDescriptor,
} from "../client/app-types.js";

const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const devnet = !["localhost", "127.0.0.1", "[::1]"].includes(
  new URL(rpc).hostname,
);
if (devnet && (!process.env.SIGNER_PATH || process.env.ENABLE_DEVNET !== "yes"))
  throw new Error(
    "Devnet service requires ENABLE_DEVNET=yes and SIGNER_PATH for the existing funded test operator.",
  );
const directory = resolve(
  process.env.FORK_APP_DIR ??
    process.env.FORK_LOCAL_DIR ??
    (devnet ? ".local/devnet-app" : ".local/app"),
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const keyPath =
  process.env.SIGNER_PATH ?? join(directory, "admin.keypair.json");
if (process.env.SIGNER_PATH && !existsSync(keyPath))
  throw new Error("Configured operator signer does not exist.");
const admin = existsSync(keyPath)
  ? Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8"))),
    )
  : Keypair.generate();
if (!existsSync(keyPath))
  writeFileSync(keyPath, JSON.stringify([...admin.secretKey]), { mode: 0o600 });
const client = makeClient(admin, rpc);
const { program, connection, send, local } = client;
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
  validateNetwork(local ? "localnet" : "devnet", rpc, genesis);
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
    } else if ((await connection.getBalance(admin.publicKey)) < 100_000_000) {
      throw new Error(
        `Fund devnet operator ${admin.publicKey.toBase58()} with test SOL at https://faucet.solana.com before initialization.`,
      );
    }
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
  const feeBps = Number(process.env.FORK_FEE_BPS ?? "100");
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
    cluster: local ? "localnet" : "devnet",
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
      await program.methods
        .createMarketForBudget(units(80), new BN(0))
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
  if (!body.communityFunding) {
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
      const needed = new BN(
        requiredSubsidy({
          b: BigInt(state.b.toString()),
          offsetYes: BigInt(state.offsetYes.toString()),
          offsetNo: BigInt(state.offsetNo.toString()),
        }).toString(),
      ).sub(state.lpDeposits);
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
  const before = await program.account.market.fetch(accounts.market);
  const events = await Promise.all([
    program.account.externalEvent.fetch(accounts.parent),
    program.account.externalEvent.fetch(accounts.target),
  ]);
  const [parentState, targetState] = events;
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
  return {
    signatures,
    needsSol: (await connection.getBalance(owner)) < 10_000_000,
  };
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
    else if (req.method === "POST" && url.pathname === "/strategy") {
      const market = descriptor(body.market);
      data = await serial(() =>
        strategyForWallet(
          client,
          new PublicKey(market.address),
          new PublicKey(String(body.owner)),
          sourceFetch,
        ),
      );
    } else if (req.method === "POST" && url.pathname === "/faucet")
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
    res.end(JSON.stringify({ ok: false, error: (error as Error).message }));
  }
}).listen(Number(process.env.FORK_SERVICE_PORT ?? "8787"), "127.0.0.1", () =>
  console.log(
    `Fork ${local ? "localnet" : "devnet"} service: http://127.0.0.1:${process.env.FORK_SERVICE_PORT ?? "8787"} (test collateral, live Gemini, real oracle polling)`,
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
