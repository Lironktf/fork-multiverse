import {
  estimate,
  empiricalAnalogues,
  type Observation,
  type ModelOptions,
} from "./model.js";
import { price, type Pool } from "./lmsr.js";
import {
  propose,
  paperFill,
  terminalPnl,
  type Risk,
  type MarketGate,
} from "./strategy.js";
export const options: ModelOptions = {
  now: 1000,
  maxAge: 30,
  maxSkew: 2,
  window: 120,
  minSamples: 30,
  maxSpread: 0.1,
  minParent: 0.05,
  maxUncertainty: 0.2,
};
export function history(
  rho: number,
  pA = 0.5,
  pB = 0.5,
): [Observation[], Observation[]] {
  const a: Observation[] = [],
    b: Observation[] = [];
  for (let i = 0; i < 120; i++) {
    // Orthogonal sinusoidal paths, returning exactly to pA,pB at the latest sample.
    const x = Math.sin((2 * Math.PI * i) / 119),
      z = Math.cos((4 * Math.PI * i) / 119) - 1;
    a.push({
      ts: 881 + i,
      probability: pA + Math.min(0.005, pA / 4) * x,
      bid: Math.max(0, pA - 0.01),
      ask: Math.min(1, pA + 0.01),
    });
    b.push({
      ts: 881 + i,
      probability: pB + 0.005 * (rho * x + Math.sqrt(1 - rho * rho) * z),
      bid: pB - 0.01,
      ask: pB + 0.01,
    });
  }
  return [a, b];
}
export const risk: Risk = {
  maxTrade: 20_000_000n,
  maxExposure: 40_000_000n,
  minCash: 20_000_000n,
  minEdge: 0.005,
  minParent: 0.05,
  slippageBps: 50,
  feeBps: 0,
  networkCostMicro: 100n,
};
export const gate: MarketGate = {
  now: 1000,
  parentClose: 1100,
  targetClose: 1200,
  parent: "unresolved",
  target: "unresolved",
  halted: false,
  paused: false,
  started: true,
};
export function scenarios() {
  const definitions = [
    { name: "independent", rho: 0, truth: 0.5 },
    { name: "positive association", rho: 0.6, truth: 0.8 },
    { name: "negative association", rho: -0.6, truth: 0.2 },
    { name: "strong dependence", rho: 0.98, truth: 0.99 },
    { name: "near-zero parent", rho: 0.6, truth: 0.8, parent: 0.0001 },
    { name: "changing correlation", rho: 0.8, truth: 0.2, changing: true },
    { name: "stale observations", rho: 0.6, truth: 0.8, stale: true },
    { name: "missing observations", rho: 0.6, truth: 0.8, missing: true },
    { name: "erratic spread", rho: 0.6, truth: 0.8, spread: true },
    { name: "already near fair", rho: 0, truth: 0.5 },
    { name: "misspecified dependence", rho: 0.98, truth: 0.01 },
    { name: "uncalibrated default", rho: 0.6, truth: 0.8, uncalibrated: true },
  ];
  return definitions.map((d) => {
    let [a, b] = history(d.rho, d.parent ?? 0.5);
    if (d.stale) {
      a = a.map((x) => ({ ...x, ts: x.ts - 100 }));
      b = b.map((x) => ({ ...x, ts: x.ts - 100 }));
    }
    if (d.missing) b = b.slice(0, 4);
    if (d.spread) b[b.length - 1] = { ...b.at(-1)!, bid: 0.05, ask: 0.95 };
    if (d.changing) {
      const [, inverse] = history(-0.8);
      b = b.map((v, i) => (i < 60 ? v : inverse[i]!));
    }
    const model = estimate(a, b, {
      ...options,
      calibration: d.uncalibrated
        ? undefined
        : {
            slope: 1,
            intercept: 0,
            rhoError: d.changing ? 0.6 : 0.04,
            rationale:
              "Synthetic experiment only; not evidence for real events",
          },
    });
    const pool: Pool = {
        yes: 0n,
        no: 0n,
        offsetYes: 0n,
        offsetNo: 0n,
        b: 100_000_000n,
      },
      initial = 100_000_000n,
      inv = { cash: initial, yes: 0n, no: 0n };
    const before = price(pool),
      trades = [];
    for (let iteration = 0; iteration < 4; iteration++) {
      const p = propose(model, pool, inv, risk, gate);
      if (!p) break;
      paperFill(pool, inv, p);
      trades.push(p);
    }
    const trueExpectedPnl =
      Number(inv.cash - initial) +
      Number(inv.yes) * d.truth +
      Number(inv.no) * (1 - d.truth);
    const yesPnl = terminalPnl(initial, inv, true, true),
      noPnl = terminalPnl(initial, inv, true, false);
    return {
      scenario: d.name,
      truthConditional: d.truth,
      estimate: model.probability,
      bounds: [model.lower, model.upper],
      reason: model.reason,
      changeCorrelation: model.changeCorrelation,
      priceBefore: before,
      priceAfter: price(pool),
      trades,
      feesMicro: 0,
      roundingReserveMicro: 4n * BigInt(trades.length),
      networkCostMicro: BigInt(trades.length) * risk.networkCostMicro,
      exposureMicro: inv.yes + inv.no,
      activatedExpectedPnlMicro: trueExpectedPnl,
      yesPnlMicro: yesPnl,
      noPnlMicro: noPnl,
      voidPnlMicro: terminalPnl(initial, inv, false, false),
    };
  });
}
export function analogueExperiments() {
  return [-0.8, 0, 0.8].map((rho) => {
    const n = 1000,
      joint = Math.round((0.25 + rho * 0.25) * n),
      samples = [];
    for (let i = 0; i < joint; i++) samples.push({ a: true, b: true });
    for (let i = 0; i < 500 - joint; i++) {
      samples.push({ a: true, b: false });
      samples.push({ a: false, b: true });
    }
    for (let i = 0; i < joint; i++) samples.push({ a: false, b: false });
    return { rho, truth: joint / 500, ...empiricalAnalogues(samples, true) };
  });
}
