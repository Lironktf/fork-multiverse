import { type Estimate } from "./model.js";
import { price, quote, tradeFee, type Pool } from "./lmsr.js";
export interface Inventory {
  cash: bigint;
  yes: bigint;
  no: bigint;
}
export interface Risk {
  maxTrade: bigint;
  maxExposure: bigint;
  minCash: bigint;
  minEdge: number;
  minParent: number;
  slippageBps: number;
  feeBps: number;
  networkCostMicro: bigint;
}
export interface MarketGate {
  now: number;
  parentClose: number;
  targetClose: number;
  parent: "unresolved" | "yes" | "no" | "invalid";
  target: "unresolved" | "yes" | "no" | "invalid";
  halted: boolean;
  paused: boolean;
  started: boolean;
}
export interface Proposal {
  yes: boolean;
  buy: boolean;
  amount: bigint;
  quote: bigint;
  feeBps: number;
  limit: bigint;
  expectedProfitMicro: number;
  worstModelProfitMicro: number;
  onchainPrice: number;
}
export function eligible(g: MarketGate): boolean {
  return (
    g.started &&
    !g.paused &&
    !g.halted &&
    g.target === "unresolved" &&
    (g.parent === "yes" ||
      (g.parent === "unresolved" && g.now < g.parentClose)) &&
    g.now < g.targetClose
  );
}
export function propose(
  model: Estimate,
  pool: Pool,
  inventory: Inventory,
  risk: Risk,
  gate: MarketGate,
): Proposal | null {
  if (
    !eligible(gate) ||
    model.probability === null ||
    model.parent < risk.minParent
  )
    return null;
  if (
    risk.maxTrade <= 0n ||
    risk.maxExposure <= 0n ||
    risk.minCash < 0n ||
    risk.minEdge < 0 ||
    risk.slippageBps < 0 ||
    risk.slippageBps > 1000 ||
    risk.feeBps < 0 ||
    risk.feeBps > 1000 ||
    risk.networkCostMicro < 0n
  )
    throw new Error("Invalid strategy risk limits");
  const activation = gate.parent === "yes" ? 1 : model.parent;
  let best: Proposal | null = null;
  // Finite-size exact quotes, including model uncertainty and worst allowed slippage.
  for (const yes of [true, false])
    for (const buy of [true, false])
      for (let step = 1n; step <= 16n; step++) {
        const amount = (risk.maxTrade * step) / 16n;
        if (amount === 0n) continue;
        const held = yes ? inventory.yes : inventory.no;
        if (!buy && amount > held) continue;
        if (buy && inventory.yes + inventory.no + amount > risk.maxExposure)
          continue;
        const gross = quote(pool, yes, buy, amount),
          fee = tradeFee(gross, risk.feeBps),
          cost = buy ? gross + fee : gross - fee,
          slip = (cost * BigInt(risk.slippageBps) + 9999n) / 10000n;
        const limit = buy ? cost + slip : cost > slip ? cost - slip : 0n;
        if (buy && inventory.cash < limit + risk.minCash) continue;
        const fair = yes ? model.probability : 1 - model.probability,
          low = yes ? model.lower : 1 - model.upper,
          high = yes ? model.upper : 1 - model.lower;
        const expected =
          activation *
            (buy
              ? Number(amount) * fair - Number(cost)
              : Number(cost) - Number(amount) * fair) -
          Number(risk.networkCostMicro);
        const conservative =
          activation *
            (buy
              ? Number(amount) * low - Number(limit)
              : Number(limit) - Number(amount) * high) -
          Number(risk.networkCostMicro);
        if (conservative <= Number(amount) * risk.minEdge || conservative <= 0)
          continue;
        const candidate = {
          yes,
          buy,
          amount,
          quote: cost,
          feeBps: risk.feeBps,
          limit,
          expectedProfitMicro: expected,
          worstModelProfitMicro: conservative,
          onchainPrice: price(pool),
        };
        if (!best || conservative > best.worstModelProfitMicro)
          best = candidate;
      }
  return best;
}
export function paperFill(pool: Pool, inventory: Inventory, p: Proposal) {
  const gross = quote(pool, p.yes, p.buy, p.amount);
  const fee = tradeFee(gross, p.feeBps);
  const actual = p.buy ? gross + fee : gross - fee;
  if (p.buy ? actual > p.limit : actual < p.limit)
    throw new Error("Paper slippage rejection");
  const held = p.yes ? inventory.yes : inventory.no;
  if (p.buy ? inventory.cash < actual : held < p.amount)
    throw new Error("Paper collateral rejection");
  inventory.cash += p.buy ? -actual : actual;
  if (p.yes) {
    inventory.yes += p.buy ? p.amount : -p.amount;
    pool.yes += p.buy ? p.amount : -p.amount;
  } else {
    inventory.no += p.buy ? p.amount : -p.amount;
    pool.no += p.buy ? p.amount : -p.amount;
  }
}
export function terminalPnl(
  initialDeposit: bigint,
  inventory: Inventory,
  parent: boolean,
  target: boolean,
  invalid = false,
): bigint {
  return !parent || invalid
    ? 0n
    : inventory.cash + (target ? inventory.yes : inventory.no) - initialDeposit;
}
