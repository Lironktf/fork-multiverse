import { test, expect } from "@playwright/test";
import {
  parseUnits,
  formatUnits,
  executionLimit,
  claimable,
} from "../../src/lib/contracts/amounts";

test("collateral parsing and slippage preserve micro units", () => {
  expect(formatUnits(parseUnits("12.000001"))).toBe("12.000001");
  for (const value of ["0", "-1", "1e6", "1.0000001", "NaN", "1000001"])
    expect(() => parseUnits(value)).toThrow();
  expect(executionLimit(BigInt(101), true, 50)).toBe(BigInt(102));
  expect(executionLimit(BigInt(101), false, 50)).toBe(BigInt(100));
  expect(() => executionLimit(BigInt(1), true, 501)).toThrow();
});
test("profitable early exit remains locked and VOID returns principal only", () => {
  const trader = {
    claimed: false,
    principal: BigInt(50_000_000),
    cash: BigInt(70_000_000),
    yes: BigInt(0),
    no: BigInt(0),
  };
  for (const status of ["funding", "pending", "active", "frozen", "halted"])
    expect(claimable(status, trader)).toBe(BigInt(0));
  expect(claimable("void", trader)).toBe(BigInt(50_000_000));
  expect(claimable("settledYes", trader)).toBe(BigInt(70_000_000));
  expect(claimable("settledNo", { ...trader, no: BigInt(9_000_000) })).toBe(
    BigInt(79_000_000),
  );
  expect(claimable("void", { ...trader, claimed: true })).toBe(BigInt(0));
});
