import { test } from "node:test";
import assert from "node:assert/strict";
import {
  depthForBudget,
  potential,
  requiredSubsidy,
  tradeFee,
  quote,
} from "../research/lmsr.js";
import { propose, paperFill } from "../research/strategy.js";
import { risk, gate } from "../research/scenarios.js";

test("budget depth covers off-center liabilities with minimal surplus", () => {
  for (const odds of [-16_000_000n, -2_197_225n, 0n, 2_197_225n, 16_000_000n]) {
    for (const budget of [20_000_000n, 80_000_000n, 1_000_000_000_000n]) {
      const b = depthForBudget(budget, odds);
      const offset = (b * (odds < 0n ? -odds : odds)) / 1_000_000n;
      const required = requiredSubsidy({ b, offsetYes: offset, offsetNo: 0n });
      assert(required <= budget);
      if (b < 1_000_000_000_000n) assert(budget - required <= 20n);
      assert.equal(required, potential(offset, 0n, b) + 4n);
    }
  }
  assert(depthForBudget(80_000_000n, 0n) > 115_000_000n);
  assert.throws(() => depthForBudget(4n, 0n));
});
test("fees round up, cannot be reduced by splitting gross flow, and reject invalid inputs", () => {
  for (let amount = 0n; amount < 20_000n; amount += 37n) {
    const fee = tradeFee(amount, 137);
    assert(fee <= amount);
    assert(
      tradeFee(amount / 2n, 137) + tradeFee(amount - amount / 2n, 137) >= fee,
    );
  }
  assert.equal(tradeFee(1n, 1), 1n);
  assert.equal(tradeFee(0n, 1000), 0n);
  for (const bps of [-1, 1.5, 1001, NaN])
    assert.throws(() => tradeFee(1n, bps));
});
test("strategy proposal and paper fill include the immutable market fee exactly once", () => {
  const pool = {
    b: 100_000_000n,
    yes: 0n,
    no: 0n,
    offsetYes: 0n,
    offsetNo: 0n,
  };
  const inventory = { cash: 1_000_000_000n, yes: 0n, no: 0n };
  const model = {
    probability: 0.9,
    lower: 0.85,
    upper: 0.95,
    parent: 0.9,
    reason: "synthetic",
    samples: 100,
    changeCorrelation: 0,
    uncertainty: 0.05,
    sensitivities: [],
  };
  const proposal = propose(
    model,
    pool,
    inventory,
    { ...risk, feeBps: 100 },
    gate,
  );
  assert(proposal);
  const gross = quote(pool, proposal.yes, proposal.buy, proposal.amount);
  assert.equal(proposal.quote, gross + tradeFee(gross, 100));
  paperFill(pool, inventory, proposal);
  assert.equal(inventory.cash, 1_000_000_000n - proposal.quote);
});
