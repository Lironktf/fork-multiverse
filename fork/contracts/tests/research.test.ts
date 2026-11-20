import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimate,
  conditional,
  conditionalBounds,
  empiricalAnalogues,
  synchronize,
} from "../research/model.js";
import {
  history,
  options,
  scenarios,
  analogueExperiments,
  risk,
  gate,
} from "../research/scenarios.js";
import { potential, quote, price, type Pool } from "../research/lmsr.js";
import { propose, paperFill, terminalPnl } from "../research/strategy.js";
import { observations } from "../research/data.js";
test("marginals alone cannot identify dependence; default abstains", () => {
  const [a, b] = history(0.9);
  const e = estimate(a, b, options);
  assert.equal(e.probability, null);
  assert.match(e.reason, /uncalibrated/);
  assert.deepEqual(conditionalBounds(0.5, 0.5), [0, 1]);
  assert.equal(conditional(0.5, 0.5, -1), 0);
  assert.equal(conditional(0.5, 0.5, 1), 1);
});
test("all estimates obey Frechet bounds including rare events", () => {
  for (let i = 1; i < 100; i++)
    for (let j = 0; j <= 100; j++)
      for (const rho of [-1, -0.4, 0, 0.4, 1]) {
        const a = i / 100,
          b = j / 100,
          [l, u] = conditionalBounds(a, b),
          p = conditional(a, b, rho);
        assert.ok(p >= l - 1e-12 && p <= u + 1e-12);
      }
  assert.deepEqual(conditionalBounds(0, 0.3), [0, 1]);
  assert.throws(() => conditional(0, 0.3, 0));
});
test("sync, missing and stale data, clipping, spreads and rolling window", () => {
  const [a, b] = history(0.5);
  assert.equal(synchronize(a, b, { ...options, window: 40 }).length, 40);
  const model = (a1 = a, b1 = b, o = options) =>
    estimate(a1, b1, {
      ...o,
      calibration: {
        slope: 0,
        intercept: 0.4,
        rhoError: 0.01,
        rationale: "synthetic",
      },
    });
  assert.ok(model().probability !== null);
  assert.equal(
    model(
      a,
      b.map((x) => ({ ...x, ts: x.ts + 5 })),
      { ...options, maxSkew: 0 },
    ).samples,
    115,
  );
  assert.equal(model(a, b.slice(0, 5)).probability, null);
  assert.equal(model(a, b, { ...options, now: 1200 }).probability, null);
  assert.equal(
    model(a, [...b.slice(0, -1), { ...b.at(-1)!, bid: 0.9, ask: 0.1 }])
      .probability,
    null,
  );
});
test("synthetic terminal analogues recover known conditionals", () => {
  for (const e of analogueExperiments()) {
    assert.equal(e.probability, e.truth);
    assert.ok(e.lower < e.truth && e.upper > e.truth);
  }
  assert.equal(
    empiricalAnalogues([{ a: true, b: true }], true).probability,
    null,
  );
  assert.equal(
    empiricalAnalogues(Array(100).fill({ a: true, b: true }), false)
      .probability,
    null,
  );
});
test("exact integer LMSR round trips and numerical reference", () => {
  for (const b of [1_000_000n, 100_000_000n, 1_000_000_000_000n])
    for (let i = 0n; i < 200n; i++) {
      const pool: Pool = {
        yes: (b * i) / 10n,
        no: 0n,
        offsetYes: 0n,
        offsetNo: 0n,
        b,
      };
      const buy = quote(pool, true, true, 101n),
        sell = quote({ ...pool, yes: pool.yes + 101n }, true, false, 101n);
      assert.ok(buy >= sell);
      const y = Number(pool.yes),
        bf = Number(b),
        expected = y + bf * Math.log1p(Math.exp(-y / bf));
      assert.ok(
        Math.abs(Number(potential(pool.yes, 0n, b)) - expected) <= 1.02,
      );
      assert.ok(Math.abs(price(pool) - 1 / (1 + Math.exp(-y / bf))) < 1e-14);
    }
});
test("finite-size cost, risk limits, slippage, settlement gates and void", () => {
  const [a, b] = history(0.9),
    model = estimate(a, b, {
      ...options,
      calibration: {
        slope: 0,
        intercept: 0.8,
        rhoError: 0.01,
        rationale: "synthetic",
      },
    });
  const pool: Pool = {
      yes: 0n,
      no: 0n,
      offsetYes: 0n,
      offsetNo: 0n,
      b: 100_000_000n,
    },
    inv = { cash: 100_000_000n, yes: 0n, no: 0n };
  const p = propose(model, pool, inv, risk, gate);
  assert.ok(p);
  assert.equal(p.quote, quote(pool, p.yes, p.buy, p.amount));
  paperFill(pool, inv, p);
  assert.ok(inv.yes + inv.no <= risk.maxExposure);
  assert.equal(terminalPnl(100_000_000n, inv, false, true), 0n);
  assert.throws(() => paperFill(pool, inv, { ...p, limit: 0n }));
  for (const g of [
    { ...gate, paused: true },
    { ...gate, halted: true },
    { ...gate, now: gate.parentClose },
    { ...gate, target: "yes" as const },
    { ...gate, parent: "no" as const },
  ])
    assert.equal(propose(model, pool, inv, risk, g), null);
  assert.equal(propose(model, pool, { ...inv, cash: 0n }, risk, gate), null);
});
test("deterministic scenarios expose abstention and misspecification losses", () => {
  const reports = scenarios();
  assert.equal(reports.length, 12);
  for (const name of [
    "independent",
    "near-zero parent",
    "stale observations",
    "missing observations",
    "erratic spread",
    "already near fair",
    "uncalibrated default",
  ]) {
    const r = reports.find((r) => r.scenario === name)!;
    assert.equal(r.trades.length, 0, name);
  }
  const wrong = reports.find((r) => r.scenario === "misspecified dependence")!;
  assert.ok(wrong.trades.length > 0);
  assert.ok(wrong.activatedExpectedPnlMicro < 0);
  for (const r of reports) {
    assert.equal(r.voidPnlMicro, 0n);
    assert.ok(r.exposureMicro <= risk.maxExposure);
  }
});
test("Gemini history parser uses only documented prices and rejects missing current quotes", async () => {
  const b = {
    ticker: "A",
    instrument: "GEMI-A",
    termsHash: "",
    closeTs: 2000,
    observationTs: 2000,
  };
  const raw = {
    ticker: "A",
    status: "active",
    contracts: [
      {
        instrumentSymbol: "GEMI-A",
        status: "active",
        priceHistory: [
          { timestamp: "2026-11-18T00:00:00Z", price: "0.5" },
          { timestamp: "garbage", price: "0.4" },
        ],
        prices: { bestBid: "0.45", bestAsk: "0.55" },
      },
    ],
  };
  const fetcher: typeof fetch = async () => new Response(JSON.stringify(raw));
  const d = await observations(b, 1_800_000_000, fetcher);
  assert.equal(d.history.length, 2);
  assert.equal(d.tradeable, true);
  raw.contracts[0]!.prices.bestAsk = "NaN";
  assert.equal(
    (await observations(b, 1_800_000_000, fetcher)).tradeable,
    false,
  );
});
