/** Nine-decimal SOL integers throughout; never parse financial amounts via floats. */
export function parseUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,9})?$/.test(value))
    throw new Error("Enter a positive amount with at most nine decimals.");
  const [whole, fraction = ""] = value.split(".");
  const units =
    BigInt(whole) * BigInt(1_000_000_000) + BigInt(fraction.padEnd(9, "0"));
  if (units <= BigInt(0) || units > BigInt("1000000000000000"))
    throw new Error("Amount must be between 0 and 1,000,000.");
  return units;
}
export function formatUnits(
  value: { toString(): string } | null | undefined,
): string {
  const n = BigInt(value?.toString() ?? "0");
  return `${n / BigInt(1_000_000_000)}.${(n % BigInt(1_000_000_000)).toString().padStart(9, "0")}`;
}
export function executionLimit(
  cost: bigint,
  buy: boolean,
  bps: number,
): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 500)
    throw new Error("Slippage must be between 0 and 5%.");
  const denominator = BigInt(10000);
  return buy
    ? (cost * BigInt(10000 + bps) + denominator - BigInt(1)) / denominator
    : (cost * BigInt(10000 - bps)) / denominator;
}
export function claimable(
  status: string,
  trader: {
    claimed: boolean;
    principal: { toString(): string };
    cash: { toString(): string };
    yes: { toString(): string };
    no: { toString(): string };
  } | null,
): bigint {
  if (!trader || trader.claimed) return BigInt(0);
  if (status === "void") return BigInt(trader.principal.toString());
  if (status === "settledYes")
    return BigInt(trader.cash.toString()) + BigInt(trader.yes.toString());
  if (status === "settledNo")
    return BigInt(trader.cash.toString()) + BigInt(trader.no.toString());
  return BigInt(0);
}
