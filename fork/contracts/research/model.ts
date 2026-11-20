/** Research only: price-change correlation is not terminal Bernoulli dependence. */
export interface Observation {
  ts: number;
  probability: number;
  bid?: number;
  ask?: number;
  volume?: number;
}
export interface Calibration {
  slope: number;
  intercept: number;
  rhoError: number;
  rationale: string;
}
export interface ModelOptions {
  now: number;
  maxAge: number;
  maxSkew: number;
  window: number;
  minSamples: number;
  maxSpread: number;
  minParent: number;
  maxUncertainty: number;
  calibration?: Calibration;
}
export interface Estimate {
  probability: number | null;
  lower: number;
  upper: number;
  parent: number;
  changeCorrelation: number | null;
  uncertainty: number;
  samples: number;
  reason: string;
  sensitivities: number[];
}
export const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
function probability(p: number) {
  if (!Number.isFinite(p) || p < 0 || p > 1)
    throw new Error("Invalid probability");
  return p;
}
export function frechet(pA: number, pB: number): [number, number] {
  probability(pA);
  probability(pB);
  return [Math.max(0, pA + pB - 1), Math.min(pA, pB)];
}
export function conditionalBounds(pA: number, pB: number): [number, number] {
  const [l, u] = frechet(pA, pB);
  return pA > 0 ? [l / pA, u / pA] : [0, 1];
}
export function conditional(pA: number, pB: number, rho: number): number {
  if (pA <= 0 || !Number.isFinite(rho))
    throw new Error("Undefined conditional estimate");
  const [l, u] = frechet(pA, pB);
  const joint =
    pA * pB + clamp(rho, -1, 1) * Math.sqrt(pA * (1 - pA) * pB * (1 - pB));
  return clamp(joint, l, u) / pA;
}
function clean(xs: Observation[], o: ModelOptions): Observation[] {
  const map = new Map<number, Observation>();
  for (const x of xs) {
    if (
      !Number.isFinite(x.ts) ||
      x.ts > o.now ||
      !Number.isFinite(x.probability) ||
      x.probability < 0 ||
      x.probability > 1
    )
      continue;
    if ((x.bid === undefined) !== (x.ask === undefined)) continue;
    if (
      x.bid !== undefined &&
      x.ask !== undefined &&
      (!Number.isFinite(x.bid) ||
        !Number.isFinite(x.ask) ||
        x.bid < 0 ||
        x.ask > 1 ||
        x.bid > x.ask ||
        x.ask - x.bid > o.maxSpread)
    )
      continue;
    map.set(x.ts, { ...x, probability: clamp(x.probability, 1e-8, 1 - 1e-8) });
  }
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}
export function synchronize(
  a: Observation[],
  b: Observation[],
  o: ModelOptions,
): [Observation, Observation][] {
  const x = clean(a, o),
    y = clean(b, o),
    out: [Observation, Observation][] = [];
  let i = 0,
    j = 0;
  while (i < x.length && j < y.length) {
    const ax = x[i]!,
      by = y[j]!;
    if (Math.abs(ax.ts - by.ts) <= o.maxSkew) {
      out.push([ax, by]);
      i++;
      j++;
    } else if (ax.ts < by.ts) i++;
    else j++;
  }
  return out.slice(-o.window);
}
function correlation(x: number[], y: number[]): number | null {
  const mx = x.reduce((a, b) => a + b, 0) / x.length,
    my = y.reduce((a, b) => a + b, 0) / y.length;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i]! - mx,
      b = y[i]! - my;
    xx += a * a;
    yy += b * b;
    xy += a * b;
  }
  return xx > 1e-15 && yy > 1e-15
    ? clamp(xy / Math.sqrt(xx * yy), -1, 1)
    : null;
}
export function estimate(
  a: Observation[],
  b: Observation[],
  o: ModelOptions,
): Estimate {
  if (
    o.window < o.minSamples ||
    o.minSamples < 5 ||
    o.maxSkew < 0 ||
    o.maxAge < 0 ||
    o.minParent <= 0 ||
    o.minParent > 1 ||
    o.maxSpread < 0 ||
    o.maxSpread > 1 ||
    o.maxUncertainty < 0
  )
    throw new Error("Invalid model configuration");
  const pairs = synchronize(a, b, o),
    last = pairs.at(-1);
  const pA = last?.[0].probability ?? 0,
    pB = last?.[1].probability ?? 0.5,
    [lo, hi] = conditionalBounds(pA, pB);
  const base: Estimate = {
    probability: null,
    lower: lo,
    upper: hi,
    parent: pA,
    changeCorrelation: null,
    uncertainty: (hi - lo) / 2,
    samples: pairs.length,
    reason: "",
    sensitivities: [],
  };
  const stop = (reason: string) => ({ ...base, reason });
  if (!last || pairs.length < o.minSamples)
    return stop("missing or insufficient synchronized data");
  if (o.now - Math.min(last[0].ts, last[1].ts) > o.maxAge)
    return stop("stale observations");
  // Do not silently skip the latest crossed/wide spread or missing bid side and trade on older data.
  for (const xs of [a, b]) {
    const latest = [...xs]
      .filter((x) => x.ts <= o.now)
      .sort((x, y) => y.ts - x.ts)[0];
    if (!latest || clean([latest], o).length === 0)
      return stop("invalid latest observation or spread");
  }
  if (pA < o.minParent) return stop("parent probability too small");
  const dx = pairs
      .slice(1)
      .map((v, i) => v[0].probability - pairs[i]![0].probability),
    dy = pairs
      .slice(1)
      .map((v, i) => v[1].probability - pairs[i]![1].probability);
  const r = correlation(dx, dy);
  base.changeCorrelation = r;
  if (r === null) return stop("no measurable price variation");
  const c = o.calibration;
  if (!c || !c.rationale.trim())
    return stop("uncalibrated co-movement cannot identify terminal dependence");
  if (
    ![c.slope, c.intercept, c.rhoError].every(Number.isFinite) ||
    c.rhoError < 0 ||
    c.rhoError > 2
  )
    throw new Error("Invalid dependence calibration");
  const rho = clamp(c.intercept + c.slope * r, -1, 1);
  // Conservative sensitivity envelope, not a valid confidence interval under serial correlation.
  const width = Math.min(
    2,
    c.rhoError +
      (Math.abs(c.slope) * 1.96) / Math.sqrt(Math.max(1, dx.length - 3)),
  );
  const p = conditional(pA, pB, rho),
    lower = conditional(pA, pB, rho - width),
    upper = conditional(pA, pB, rho + width);
  const uncertainty = Math.max(p - lower, upper - p);
  return {
    ...base,
    probability: uncertainty <= o.maxUncertainty ? p : null,
    lower,
    upper,
    uncertainty,
    reason:
      uncertainty <= o.maxUncertainty
        ? "calibrated heuristic; requires out-of-sample validation"
        : "dependence uncertainty too wide",
    sensitivities: [rho - width, rho, rho + width].map((r) =>
      conditional(pA, pB, r),
    ),
  };
}
export interface Analogue {
  a: boolean;
  b: boolean;
}
export function empiricalAnalogues(
  samples: Analogue[],
  exchangeabilityJustified: boolean,
  minParentCount = 30,
) {
  const active = samples.filter((x) => x.a),
    n = active.length,
    k = active.filter((x) => x.b).length;
  if (!exchangeabilityJustified || n < minParentCount)
    return {
      probability: null,
      lower: 0,
      upper: 1,
      n,
      reason: "insufficient comparable terminal outcomes",
    };
  const p = k / n,
    z = 1.96,
    denom = 1 + (z * z) / n,
    center = (p + (z * z) / (2 * n)) / denom,
    half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    probability: p,
    lower: clamp(center - half, 0, 1),
    upper: clamp(center + half, 0, 1),
    n,
    reason: "empirical conditional; exchangeability assumed",
  };
}
