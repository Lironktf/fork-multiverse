// Exact BigInt mirror of the on-chain integer potential, including rounding reserves.
const S = 1_000_000_000_000_000_000n,
  LN2 = 693_147_180_559_945_309n,
  MAX_Q = 1_000_000_000_000_000n;
export interface Pool {
  yes: bigint;
  no: bigint;
  offsetYes: bigint;
  offsetNo: bigint;
  b: bigint;
}
function expNeg(x: bigint): bigint {
  if (x >= 42n * S) return 0n;
  const k = x / LN2,
    r = x % LN2;
  let t = S,
    sum = S;
  for (let i = 1n; i <= 24n; i++) {
    t = (t * r) / S / i;
    sum += t;
  }
  return ((S * S) / sum) >> k;
}
export function potential(y: bigint, n: bigint, b: bigint): bigint {
  if (
    b < 1_000_000n ||
    b > 1_000_000_000_000n ||
    y < 0n ||
    n < 0n ||
    y > MAX_Q ||
    n > MAX_Q
  )
    throw new Error("Numeric range");
  const e = expNeg(((y > n ? y - n : n - y) * S) / b),
    z = (e * S) / (2n * S + e),
    z2 = (z * z) / S;
  let p = z,
    sum = 0n;
  for (let i = 0n; i < 40n; i++) {
    sum += p / (2n * i + 1n);
    p = (p * z2) / S;
  }
  return (y > n ? y : n) + (b * (2n * sum)) / S;
}
export function quote(
  pool: Pool,
  yes: boolean,
  buy: boolean,
  amount: bigint,
): bigint {
  if (amount <= 0n) throw new Error("Invalid amount");
  const y = pool.yes + pool.offsetYes,
    n = pool.no + pool.offsetNo,
    dy = yes ? (buy ? amount : -amount) : 0n,
    dn = !yes ? (buy ? amount : -amount) : 0n;
  if (!buy && amount > (yes ? pool.yes : pool.no))
    throw new Error("Insufficient total holdings");
  const delta = potential(y + dy, n + dn, pool.b) - potential(y, n, pool.b);
  return buy ? delta + 4n : -delta > 4n ? -delta - 4n : 0n;
}
export function price(pool: Pool): number {
  potential(pool.yes + pool.offsetYes, pool.no + pool.offsetNo, pool.b);
  const y = pool.yes + pool.offsetYes,
    n = pool.no + pool.offsetNo,
    e = expNeg(((y > n ? y - n : n - y) * S) / pool.b),
    hi = (S * S) / (S + e);
  return Number(y >= n ? hi : S - hi) / Number(S);
}

/** Fee is part of conditional cash; it earns nothing on VOID. */
export function tradeFee(gross: bigint, feeBps: number): bigint {
  if (
    gross < 0n ||
    gross > 18_446_744_073_709_551_615n ||
    !Number.isInteger(feeBps) ||
    feeBps < 0 ||
    feeBps > 1000
  )
    throw new Error("Invalid fee inputs");
  return (gross * BigInt(feeBps) + 9999n) / 10000n;
}
export function requiredSubsidy(
  pool: Pick<Pool, "offsetYes" | "offsetNo" | "b">,
): bigint {
  return potential(pool.offsetYes, pool.offsetNo, pool.b) + 4n;
}
export function depthForBudget(budget: bigint, logOddsE6: bigint): bigint {
  const maxB = 1_000_000_000_000n;
  const odds = logOddsE6 < 0n ? -logOddsE6 : logOddsE6;
  if (odds > 16_000_000n || budget < 4n || budget > MAX_Q)
    throw new Error("Numeric range");
  const slope = potential((maxB * odds) / 1_000_000n, 0n, maxB) + 2n;
  const candidate = ((budget - 4n) * maxB) / slope;
  const b = candidate > maxB ? maxB : candidate;
  if (potential((b * odds) / 1_000_000n, 0n, b) + 4n > budget)
    throw new Error("Insufficient subsidy");
  return b;
}
