import { PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { environmentClient, pda, BN } from "../client/anchor.js";
import { observations } from "../research/data.js";
import { estimate } from "../research/model.js";
import type { Binding } from "../oracle/gemini.js";
import { propose, type MarketGate } from "../research/strategy.js";
import { options, risk } from "../research/scenarios.js";
import type { Pool } from "../research/lmsr.js";
const arg = process.argv[2];
if (!arg)
  throw new Error(
    "Usage: npm run bot -- MARKET_PDA [--execute-testnet]; default is paper proposal only",
  );
const execute = process.argv.includes("--execute-testnet");
if (execute && process.env.ENABLE_TESTNET_TRADING !== "yes")
  throw new Error(
    "Set ENABLE_TESTNET_TRADING=yes explicitly for testnet execution",
  );
const { program, payer, connection, send } = environmentClient(),
  market = new PublicKey(arg),
  m = await program.account.market.fetch(market),
  config = await program.account.config.fetch(m.config);
const [a, b] = await Promise.all([
  program.account.externalEvent.fetch(m.parent),
  program.account.externalEvent.fetch(m.target),
]);
const now =
  (await connection.getBlockTime(await connection.getSlot())) ??
  Math.floor(Date.now() / 1000);
const toBinding = (e: typeof a): Binding => ({
  ticker: e.ticker,
  instrument: e.instrument,
  termsHash: Buffer.from(e.termsHash).toString("hex"),
  closeTs: e.closeTs.toNumber(),
  observationTs: e.observationTs.toNumber(),
});
const [dataA, dataB] = await Promise.all([
  observations(toBinding(a), now),
  observations(toBinding(b), now),
]);
const calibration = process.env.CALIBRATION_PATH
  ? JSON.parse(readFileSync(process.env.CALIBRATION_PATH, "utf8"))
  : undefined;
const model = estimate(dataA.history, dataB.history, {
  ...options,
  now,
  calibration,
});
const owner = payer.publicKey,
  trader = pda("trader", market, owner),
  t = await program.account.trader.fetch(trader);
const pool: Pool = {
  yes: BigInt(m.yes.toString()),
  no: BigInt(m.no.toString()),
  offsetYes: BigInt(m.offsetYes.toString()),
  offsetNo: BigInt(m.offsetNo.toString()),
  b: BigInt(m.b.toString()),
};
const gate: MarketGate = {
  now,
  parentClose: a.closeTs.toNumber(),
  targetClose: b.closeTs.toNumber(),
  parent: Object.keys(a.outcome)[0] as MarketGate["parent"],
  target: Object.keys(b.outcome)[0] as MarketGate["target"],
  halted: a.halted || b.halted || !dataA.tradeable || !dataB.tradeable,
  paused: config.paused,
  started: m.started,
};
const proposal = propose(
  model,
  pool,
  {
    cash: BigInt(t.cash.toString()),
    yes: BigInt(t.yes.toString()),
    no: BigInt(t.no.toString()),
  },
  {
    ...risk,
    maxTrade:
      BigInt(config.maxTrade.toString()) < risk.maxTrade
        ? BigInt(config.maxTrade.toString())
        : risk.maxTrade,
    feeBps: config.feeBps,
  },
  gate,
);
const log = (x: unknown) =>
  console.log(
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
log({
  mode: execute ? "testnet" : "paper",
  market: arg,
  now,
  gate,
  model,
  proposal,
});
if (proposal) {
  const accounts = {
    owner,
    config: m.config,
    market,
    parent: m.parent,
    target: m.target,
    trader,
  };
  const authoritative = (await program.methods
    .quote(proposal.yes, proposal.buy, new BN(proposal.amount.toString()))
    .accountsStrict(accounts)
    .view()) as InstanceType<typeof BN>;
  if (BigInt(authoritative.toString()) !== proposal.quote)
    throw new Error("Quote changed: rerun strategy on fresh state");
  if (execute) {
    const signature = await send([
      await program.methods
        .trade(
          proposal.yes,
          proposal.buy,
          new BN(proposal.amount.toString()),
          new BN(proposal.limit.toString()),
        )
        .accountsStrict(accounts)
        .instruction(),
    ]);
    log({ kind: "testnet-trade", signature, proposal });
  } else
    log({
      kind: "paper-proposal",
      authoritativeQuote: authoritative.toString(),
    });
}
