import { PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { makeClient, pda } from "../client/anchor.js";
import { observations } from "../research/data.js";
import { estimate } from "../research/model.js";
import type { Binding } from "../oracle/gemini.js";
import { propose, type MarketGate } from "../research/strategy.js";
import { options, risk } from "../research/scenarios.js";
import type { Pool } from "../research/lmsr.js";

export async function strategyForWallet(
  {
    program,
    connection,
  }: Pick<ReturnType<typeof makeClient>, "program" | "connection">,
  market: PublicKey,
  owner: PublicKey,
  fetcher: typeof fetch = fetch,
) {
  const m = await program.account.market.fetch(market),
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
    observations(toBinding(a), now, fetcher),
    observations(toBinding(b), now, fetcher),
  ]);
  const calibration = process.env.CALIBRATION_PATH
    ? JSON.parse(readFileSync(process.env.CALIBRATION_PATH, "utf8"))
    : undefined;
  const model = estimate(dataA.history, dataB.history, {
    ...options,
    now,
    calibration,
  });
  const trader = pda("trader", market, owner),
    t = await program.account.trader.fetchNullable(trader);
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
      cash: BigInt(t?.cash.toString() ?? "0"),
      yes: BigInt(t?.yes.toString() ?? "0"),
      no: BigInt(t?.no.toString() ?? "0"),
    },
    {
      ...risk,
      maxTrade:
        BigInt(config.maxTrade.toString()) < risk.maxTrade
          ? BigInt(config.maxTrade.toString())
          : risk.maxTrade,
      feeBps: m.feeBps,
    },
    gate,
  );

  return {
    market: market.toBase58(),
    owner: owner.toBase58(),
    now,
    gate,
    model,
    proposal,
    reason: !t
      ? "Deposit collateral to enable strategy proposals."
      : model.probability === null
        ? model.reason
        : proposal
          ? "Proposal meets configured risk limits; review a fresh on-chain quote before signing."
          : "No trade meets the current market, inventory and conservative edge limits.",
  };
}
