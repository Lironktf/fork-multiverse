import { catalogPage, catalogSearch } from "./catalog.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
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
  Transaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { makeClient, pda, BN, PROGRAM_ID } from "../client/anchor.js";
import {
  fetchEvent,
  parseEvent,
  exactContract,
  fetchRules,
  bindingHash,
  termsHash,
  timestamp,
  settlement,
  relay,
  type Binding,
  type Outcome,
} from "../oracle/gemini.js";
import { price } from "../research/lmsr.js";

const { values: args } = parseArgs({
  options: {
    session: { type: "string" },
    parent: { type: "string" },
    target: { type: "string" },
    "parent-close": { type: "string" },
    "target-close": { type: "string" },
    commands: { type: "string" },
    resume: { type: "boolean", default: false },
  },
});
const directory = resolve(".local", args.session ?? "live-demo");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const manifestPath = join(directory, "session.json");
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (question: string) => (await rl.question(question)).trim();
const key = (name: string) => {
  const path = join(directory, `${name}.keypair.json`);
  if (existsSync(path))
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))),
    );
  const signer = Keypair.generate();
  writeFileSync(path, JSON.stringify([...signer.secretKey]), { mode: 0o600 });
  return signer;
};
const admin = key("admin");
const client = makeClient(admin);
if (!client.local)
  throw new Error(
    "This demo uses a local validator and mock USDC. Use npm run demo:live without RPC_URL overrides.",
  );
const { program, connection, send } = client;
const log = (kind: string, data: unknown) => {
  appendFileSync(
    join(directory, "activity.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), kind, data }) + "\n",
  );
};
const transact = async (
  label: string,
  instruction: Parameters<typeof send>[0][number],
  signers: Keypair[] = [],
) => {
  const signature = await send([instruction], signers);
  console.log(`  ${label}: ${signature}`);
  log("transaction", { label, signature });
};
const amount = (s: string) => {
  if (!/^\d+(\.\d{1,6})?$/.test(s))
    throw new Error("Use a positive amount with at most six decimal places.");
  const [whole, fraction = ""] = s.split(".");
  const n = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (n <= 0n || n > 1_000_000_000_000n)
    throw new Error("Amount must be in (0, 1,000,000].");
  return new BN(n.toString());
};
const money = (v: { toString(): string }) =>
  (Number(v.toString()) / 1e6).toFixed(6);

async function select(
  role: string,
  supplied?: string,
  suppliedClose?: string,
): Promise<Binding> {
  let selection = supplied;
  while (!selection) {
    let search = await ask(
      `${role}: search live Gemini events (words, or blank for all): `,
    );
    let offset = 0;
    for (;;) {
      const normalized = catalogSearch(search);
      if (normalized !== search) {
        console.log(
          `Searching Gemini for "${normalized}" (its ticker name for "${search}").`,
        );
        search = normalized;
      }
      const { events, titles, hasNext } = await catalogPage(search, offset);
      if (events.length === 0) {
        if (search) {
          console.log(
            `No active events matched "${search}". Showing all active events instead; use s to search again.`,
          );
          search = "";
          offset = 0;
          continue;
        }
        if (offset > 0) {
          console.log("No more events. Returning to the first page.");
          offset = 0;
          continue;
        }
        console.log(
          "Gemini currently returned no active events. Try again later or press Ctrl+C to exit.",
        );
        break;
      }
      console.table(
        events.map((e, i) => ({
          number: i + 1,
          ticker: e.ticker,
          title: titles[i],
          contracts: e.contracts.length,
        })),
      );
      const choice = await ask(
        "Event number, n = next page, s = new search, or exact EVENT_TICKER/INSTRUMENT_SYMBOL: ",
      );
      if (choice === "n") {
        if (!hasNext) {
          console.log(
            "You are on the last page. Choose an event or enter s to search again.",
          );
          continue;
        }
        offset += 20;
        continue;
      }
      if (choice === "s") break;
      if (choice.includes("/")) {
        selection = choice;
        break;
      }
      const event = events[Number(choice) - 1];
      if (!event) {
        console.log("Choose a displayed event.");
        continue;
      }
      console.table(
        event.contracts.map((c, i) => ({
          number: i + 1,
          symbol: c.instrumentSymbol,
          label: (c as unknown as { label?: string }).label,
          status: c.status,
          expiry: c.expiryDate,
          prices: JSON.stringify(c.prices),
        })),
      );
      const contract =
        event.contracts[Number(await ask("Contract number: ")) - 1];
      if (contract) {
        selection = `${event.ticker}/${contract.instrumentSymbol}`;
        break;
      }
    }
  }
  const parts = selection.split("/");
  if (parts.length !== 2)
    throw new Error("Selection must be EVENT_TICKER/INSTRUMENT_SYMBOL.");
  const [ticker, instrument] = parts as [string, string];
  const event = parseEvent(await fetchEvent(ticker));
  const contract = exactContract(event, { ticker, instrument });
  if (
    event.status !== "active" ||
    contract.status !== "active" ||
    contract.marketState === "closed"
  )
    throw new Error("Choose an active, open source contract.");
  const observationTs = timestamp(contract.expiryDate);
  if (!contract.termsAndConditionsUrl)
    throw new Error("Source contract has no rules document.");
  const rules = await fetchRules(contract.termsAndConditionsUrl);
  console.log(
    `\n${role}: ${ticker} / ${instrument}\nRules: ${contract.termsAndConditionsUrl}\nObservation/expiry: ${contract.expiryDate}`,
  );
  console.log(
    JSON.stringify(contract.description ?? event.description, null, 2),
  );
  console.log(
    "Expiry is not a verified trading cutoff. Choose a conservative UTC close from these rules, before the event can become known.",
  );
  const close =
    suppliedClose ??
    (await ask(
      "Committed trading close (ISO UTC, e.g. 2026-11-20T18:00:00Z): ",
    ));
  const closeTs = timestamp(close);
  if (closeTs <= Math.floor(Date.now() / 1000) || closeTs > observationTs)
    throw new Error("Close must be in the future and no later than expiry.");
  const binding = {
    ticker,
    instrument,
    closeTs,
    observationTs,
    termsHash: termsHash(event, contract, rules),
  };
  writeFileSync(
    join(directory, `${role}.source.json`),
    JSON.stringify(event, null, 2),
  );
  writeFileSync(join(directory, `${role}.rules.pdf`), rules);
  log("source-selected", binding);
  return binding;
}

interface Session {
  rpc: string;
  program: string;
  mint: string;
  bindings: Binding[];
  traders: string[];
}
let session: Session;
let mint: PublicKey;
const config = pda("config", admin.publicKey);
let parent: PublicKey, target: PublicKey, market: PublicKey, vault: PublicKey;
let activeName = "alice";
const eventPda = (b: Binding) =>
  pda("event", config, Uint8Array.from(bindingHash(b.ticker, b.instrument)));
const save = () =>
  writeFileSync(manifestPath, JSON.stringify(session, null, 2));
const traderAccounts = (name: string) => {
  const signer = key(`trader-${name}`),
    owner = signer.publicKey;
  return {
    signer,
    owner,
    trader: pda("trader", market, owner),
    config,
    market,
    parent,
    target,
  };
};
async function funds(name: string) {
  const a = traderAccounts(name);
  const userToken = (
    await getOrCreateAssociatedTokenAccount(connection, admin, mint, a.owner)
  ).address;
  return {
    owner: a.owner,
    trader: a.trader,
    config,
    market,
    parent,
    target,
    mint,
    vault,
    userToken,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}
async function addTrader(name: string) {
  if (!/^[a-z][a-z0-9_-]{0,24}$/.test(name))
    throw new Error("Use a short lowercase trader name.");
  if (!session.traders.includes(name)) {
    const a = traderAccounts(name),
      f = await funds(name);
    await transact(
      `Fund ${name} account rent`,
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: a.owner,
        lamports: 100_000_000,
      }),
    );
    await mintTo(connection, admin, mint, f.userToken, admin, 1000_000_000n);
    await transact(
      `Create ${name}`,
      await program.methods
        .openTrader()
        .accountsStrict({
          owner: a.owner,
          market,
          trader: a.trader,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [a.signer],
    );
    await transact(
      `Deposit 500 mock USDC for ${name}`,
      await program.methods
        .deposit(amount("500"))
        .accountsStrict(f)
        .instruction(),
      [a.signer],
    );
    session.traders.push(name);
    save();
  }
  activeName = name;
}
async function refresh() {
  for (const [i, binding] of session.bindings.entries()) {
    const event = i === 0 ? parent : target;
    const current = await program.account.externalEvent.fetch(event);
    if (Object.keys(current.outcome)[0] !== "unresolved") continue;
    const raw = await fetchEvent(binding.ticker),
      parsed = parseEvent(raw),
      contract = exactContract(parsed, binding);
    const rules = await fetchRules(contract.termsAndConditionsUrl!);
    const payload = settlement(
      raw,
      binding,
      rules,
      Math.floor(Date.now() / 1000),
    );
    log("source-poll", { event: event.toBase58(), raw, payload });
    console.log(
      `  Gemini ${binding.instrument}: ${contract.status}, bid/ask ${JSON.stringify(contract.prices ?? {})}`,
    );
    if (payload && !(payload.outcome === "unresolved" && current.halted)) {
      await relay(
        payload,
        {
          async current() {
            const c = await program.account.externalEvent.fetch(event);
            return {
              outcome: Object.keys(c.outcome)[0] as Outcome,
              sourceTs: c.sourceTs.toNumber(),
            };
          },
          async submit(p) {
            const signature = await send([
              await program.methods
                .report(
                  p.binding,
                  p.termsHash,
                  { [p.outcome]: {} },
                  new BN(p.sourceTs),
                )
                .accountsStrict({ reporter: admin.publicKey, config, event })
                .instruction(),
            ]);
            console.log(`  Oracle report: ${signature}`);
            return signature;
          },
        },
        (data) => log("oracle", data),
      );
    }
  }
  const before = await program.account.market.fetch(market);
  await send([
    await program.methods
      .syncMarket()
      .accountsStrict({ config, market, parent, target })
      .instruction(),
  ]);
  const after = await program.account.market.fetch(market);
  if (JSON.stringify(before.status) !== JSON.stringify(after.status))
    console.log(`  Market transitioned to ${Object.keys(after.status)[0]}`);
}
async function status() {
  const m = await program.account.market.fetch(market);
  const probability = price({
    yes: BigInt(m.yes.toString()),
    no: BigInt(m.no.toString()),
    offsetYes: BigInt(m.offsetYes.toString()),
    offsetNo: BigInt(m.offsetNo.toString()),
    b: BigInt(m.b.toString()),
  });
  console.log(
    `\nB | A=YES: ${session.bindings[1]!.instrument} | ${session.bindings[0]!.instrument}`,
  );
  console.log(
    `Market ${market}\nState: ${Object.keys(m.status)[0]} | LMSR YES: ${(probability * 100).toFixed(4)}% | Vault: ${money((await getAccount(connection, vault)).amount)} mock USDC`,
  );
  const rows = [];
  for (const name of session.traders) {
    const t = await program.account.trader.fetch(traderAccounts(name).trader);
    const terminal = ["void", "settledYes", "settledNo"].includes(
      Object.keys(m.status)[0]!,
    );
    const entitlement = t.claimed
      ? new BN(0)
      : "void" in m.status
        ? t.principal
        : "settledYes" in m.status
          ? t.cash.add(t.yes)
          : "settledNo" in m.status
            ? t.cash.add(t.no)
            : new BN(0);
    rows.push({
      trader: name,
      deposit: money(t.principal),
      conditionalCash: money(t.cash),
      yesShares: money(t.yes),
      noShares: money(t.no),
      withdrawable: terminal ? money(entitlement) : "0 (locked)",
      claimed: t.claimed,
    });
  }
  console.table(rows);
  log("balances", {
    status: m.status,
    probability,
    rows,
    market: market.toBase58(),
  });
}
async function command(line: string) {
  const [verb, side, qty] = line.trim().split(/\s+/);
  if (verb === "watch") {
    const seconds = Number(side ?? "60");
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
      throw new Error("Watch duration must be 1–3600 seconds.");
    const until = Date.now() + seconds * 1000;
    do {
      await refresh();
      await status();
      const m = await program.account.market.fetch(market);
      if (
        ["void", "settledYes", "settledNo"].includes(Object.keys(m.status)[0]!)
      )
        break;
      if (Date.now() >= until) break;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(15000, until - Date.now())),
      );
    } while (Date.now() < until);
    return;
  }
  if (verb === "status") {
    await refresh();
    await status();
    return;
  }
  if (verb === "trader") {
    await addTrader(side!);
    await status();
    return;
  }
  if (verb === "poll") {
    await refresh();
    await status();
    return;
  }
  if (verb === "redeem") {
    await refresh();
    const a = traderAccounts(activeName);
    await transact(
      `Redeem ${activeName}`,
      await program.methods
        .redeem()
        .accountsStrict(await funds(activeName))
        .instruction(),
      [a.signer],
    );
    await status();
    return;
  }
  if (verb === "lp-withdraw") {
    await refresh();
    const m = await program.account.market.fetch(market);
    const userToken = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mint,
        admin.publicKey,
      )
    ).address;
    await transact(
      "LP withdrawal",
      await program.methods
        .withdrawLp(m.lpPool)
        .accountsStrict({
          owner: admin.publicKey,
          lp: pda("lp", market, admin.publicKey),
          config,
          market,
          parent,
          target,
          mint,
          vault,
          userToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    );
    return;
  }
  if (["buy", "sell", "quote"].includes(verb!)) {
    if (side !== "yes" && side !== "no") throw new Error("Choose yes or no.");
    await refresh(); // Abort on unavailable/mismatched evidence instead of trading stale source state.
    const a = traderAccounts(activeName),
      { signer, ...accounts } = a,
      n = amount(qty!),
      buy = verb !== "sell";
    const quoteInstruction = await program.methods
      .quote(side === "yes", buy, n)
      .accountsStrict(accounts)
      .instruction();
    const transaction = new Transaction().add(quoteInstruction);
    transaction.feePayer = admin.publicKey;
    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    transaction.sign(admin, signer);
    const simulation = await connection.simulateTransaction(transaction);
    if (simulation.value.err) throw new Error(JSON.stringify(simulation.value));
    const result = simulation.value.returnData;
    if (!result || result.programId !== PROGRAM_ID.toBase58())
      throw new Error("Missing authoritative quote return data.");
    const cost = new BN(
      Buffer.from(result.data[0], "base64").readBigUInt64LE().toString(),
    );
    console.log(
      `${activeName}: ${verb} ${qty} ${side.toUpperCase()} — ${money(cost)} mock USDC (exact finite-size quote)`,
    );
    if (verb !== "quote") {
      await transact(
        `${activeName} ${verb} ${side}`,
        await program.methods
          .trade(side === "yes", buy, n, cost)
          .accountsStrict(accounts)
          .instruction(),
        [signer],
      );
      await status();
    }
    return;
  }
  console.log(
    "Commands: status | quote yes/no SHARES | buy yes/no SHARES | sell yes/no SHARES | trader NAME | poll | watch SECONDS | redeem | lp-withdraw | help | exit",
  );
}

try {
  const deployed = await connection.getAccountInfo(PROGRAM_ID);
  if (!deployed?.executable)
    throw new Error(
      "Program not loaded. Start npm run validator:live in another terminal.",
    );
  if (args.resume) {
    session = JSON.parse(readFileSync(manifestPath, "utf8")) as Session;
    if (
      session.program !== PROGRAM_ID.toBase58() ||
      session.rpc !== connection.rpcEndpoint
    )
      throw new Error("Session belongs to a different program or RPC.");
    mint = new PublicKey(session.mint);
  } else {
    if (existsSync(manifestPath))
      throw new Error(
        "Session already exists. Use --resume or --session ANOTHER_NAME.",
      );
    const a = await select("parent", args.parent, args["parent-close"]),
      b = await select("target", args.target, args["target-close"]);
    if (a.instrument === b.instrument)
      throw new Error("A and B must be distinct contracts.");
    const signature = await connection.requestAirdrop(
      admin.publicKey,
      10_000_000_000,
    );
    await connection.confirmTransaction(signature, "confirmed");
    mint = await createMint(connection, admin, admin.publicKey, null, 6);
    session = {
      rpc: connection.rpcEndpoint,
      program: PROGRAM_ID.toBase58(),
      mint: mint.toBase58(),
      bindings: [a, b],
      traders: [],
    };
    await transact(
      "Configure",
      await program.methods
        .initializeConfig(
          admin.publicKey,
          admin.publicKey,
          amount("1000"),
          amount("1000000"),
        )
        .accountsStrict({
          admin: admin.publicKey,
          config,
          mint,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
    for (const binding of session.bindings) {
      await transact(
        `Register ${binding.instrument}`,
        await program.methods
          .registerEvent(
            bindingHash(binding.ticker, binding.instrument),
            binding.ticker,
            binding.instrument,
            [...Buffer.from(binding.termsHash, "hex")],
            new BN(binding.closeTs),
            new BN(binding.observationTs),
          )
          .accountsStrict({
            admin: admin.publicKey,
            config,
            event: eventPda(binding),
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      );
    }
  }
  [parent, target] = session.bindings.map(eventPda) as [PublicKey, PublicKey];
  market = pda("market", config, parent, target);
  vault = pda("vault", market);
  if (!args.resume) {
    await transact(
      "Create conditional LMSR",
      await program.methods
        .createMarket(amount("100"), new BN(0))
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
    const lp = pda("lp", market, admin.publicKey),
      userToken = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          admin,
          mint,
          admin.publicKey,
        )
      ).address;
    await mintTo(connection, admin, mint, userToken, admin, 100_000_000n);
    await transact(
      "Create LP",
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
    await transact(
      "Fund 80 mock USDC subsidy",
      await program.methods
        .fundLp(amount("80"))
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
    await transact(
      "Start",
      await program.methods
        .startMarket()
        .accountsStrict({ config, market, parent, target })
        .instruction(),
    );
    save();
    await addTrader("alice");
    await addTrader("bob");
    activeName = "alice";
  }
  await refresh();
  await status();
  console.log(
    `Session saved in ${directory}. Trades execute on Solana; Gemini supplies source data and eventual outcomes. No orders are placed on Gemini.`,
  );
  if (args.commands) {
    for (const line of args.commands.split(";")) await command(line);
  } else {
    await command("help");
    for (;;) {
      const line = await ask(`${activeName}> `);
      if (line === "exit" || line === "quit") break;
      try {
        await command(line);
      } catch (error) {
        console.error(String(error));
      }
    }
  }
} finally {
  rl.close();
}
