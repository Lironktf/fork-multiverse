import test from "node:test";
import assert from "node:assert/strict";
import {
  contractObservation,
  crosses,
  parseRuleInput,
  spotObservation,
} from "../app/autobuy.js";

const base = {
  market: "M",
  trigger: { kind: "spot", symbol: "SOLUSD", op: ">=", value: 75 },
  action: { side: "yes", shares: 10, maxCost: 8 },
};

test("auto-buy input validation normalizes and bounds rules", () => {
  const r = parseRuleInput(base);
  assert.deepEqual(r.trigger, { kind: "spot", symbol: "solusd", op: ">=", value: 75 });
  assert.throws(() => parseRuleInput({ ...base, action: { side: "yes", shares: 10, maxCost: 11 } }), /never be worth/);
  assert.throws(() => parseRuleInput({ ...base, action: { side: "maybe", shares: 1, maxCost: 1 } }), /Side/);
  assert.throws(() => parseRuleInput({ ...base, action: { side: "no", shares: 1.5, maxCost: 1 } }), /whole/);
  assert.throws(
    () => parseRuleInput({ ...base, trigger: { kind: "contract", ticker: "T", instrument: "I", op: ">=", value: 60 } }),
    /probability/,
  );
  assert.throws(() => parseRuleInput({ ...base, trigger: { kind: "spot", symbol: "../x", op: ">=", value: 1 } }), /symbol/);
});

test("observations use real quotes only: mid, then last trade, then nothing", () => {
  const ev = (prices: Record<string, unknown>) => ({ contracts: [{ instrumentSymbol: "I", prices }] });
  assert.equal(contractObservation(ev({ bestBid: "0.94", bestAsk: "0.98", lastTradePrice: "0.81" }), "I")!.value.toFixed(2), "0.96");
  assert.equal(contractObservation(ev({ bestBid: "0.94", lastTradePrice: "0.81" }), "I")!.value, 0.81);
  assert.equal(contractObservation(ev({}), "I"), null);
  assert.equal(contractObservation(ev({ bestBid: "0.5" }), "OTHER"), null);
  assert.equal(spotObservation({ last: "72.17000" })!.value, 72.17);
  assert.equal(spotObservation({}), null);
});

test("crossing respects the comparator and never fires without an observation", () => {
  const up = { kind: "spot", symbol: "solusd", op: ">=", value: 75 } as const;
  const down = { ...up, op: "<=" } as const;
  const o = (value: number) => ({ value, source: "t", at: "" });
  assert.equal(crosses(up, o(75)), true);
  assert.equal(crosses(up, o(74.99)), false);
  assert.equal(crosses(down, o(74.99)), true);
  assert.equal(crosses(up, null), false);
});

test("outcome mapping: binary YES/NO, categorical labels, single-contract categorical by label", async () => {
  const { resolveOutcome } = await import("../app/autobuy.js");
  const c = (sym: string, label: string) => ({ instrumentSymbol: sym, label, status: "active" });
  assert.deepEqual(resolveOutcome({ type: "binary", contracts: [c("B", "Yes")] }, "NO"), { instrument: "B", yes: false });
  assert.deepEqual(resolveOutcome({ type: "categorical", contracts: [c("X", "Alice"), c("Y", "Bob")] }, "Bob"), { instrument: "Y", yes: true });
  assert.deepEqual(resolveOutcome({ type: "categorical", contracts: [c("S", "$70,000 or above")] }, "$70,000 or above"), { instrument: "S", yes: true });
  assert.deepEqual(resolveOutcome({ type: "categorical", contracts: [c("S", "$70,000 or above")] }, "YES"), { instrument: "S", yes: true });
  assert.throws(() => resolveOutcome({ type: "categorical", contracts: [c("X", "Alice"), c("Y", "Bob")] }, "Carol"), /not an open contract/);
});
