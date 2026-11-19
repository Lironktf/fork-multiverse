import { potential, quote } from "../research/lmsr.js";
const vectors = [];
for (const b of [1_000_000n, 100_000_000n, 1_000_000_000_000n])
  for (const d of [0n, 1n, 10n, 100n, 420n, 500n]) {
    const pool = {
      yes: (b * d) / 10n,
      no: 10_000_000n,
      offsetYes: 0n,
      offsetNo: 0n,
      b,
    };
    for (const yes of [true, false])
      for (const buy of [true, false]) {
        if (!buy && (yes ? pool.yes : pool.no) < 101n) continue;
        vectors.push({
          y: pool.yes,
          n: pool.no,
          b,
          yes,
          buy,
          amount: 101n,
          cost: quote(pool, yes, buy, 101n),
          potential: potential(pool.yes, pool.no, b),
        });
      }
  }
console.log(
  JSON.stringify(vectors, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
);
