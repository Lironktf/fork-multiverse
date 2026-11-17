import type { DisagreementSummary, ModelRole, ModelRun } from "@/lib/domain/types";

/** Final probability of a run: the revised value if the model revised, else its first estimate. */
export const finalProbability = (r: ModelRun): number | null =>
  r.revised?.probability ?? r.output?.probability ?? null;

/**
 * Equal-weight mean. No weighting is applied because there is no documented
 * track record for any analyst role in this app (ASSUMPTION: equal weights;
 * overturned once per-role calibration data exists).
 */
export function ensembleMean(runs: ModelRun[]): number | null {
  const ps = runs.map(finalProbability).filter((p): p is number => p !== null);
  if (!ps.length) return null;
  return ps.reduce((a, b) => a + b, 0) / ps.length;
}

/**
 * Disagreement = min..max range across completed analysts. This is a spread
 * of model outputs, NOT a calibrated confidence interval.
 * "Significant" when the range is ≥ 15pp and one model sits ≥ 12pp from the
 * median of the others (ASSUMPTION: display thresholds chosen for legibility,
 * not statistical meaning).
 */
export function summarizeDisagreement(runs: ModelRun[]): DisagreementSummary | null {
  const done = runs.filter((r) => finalProbability(r) !== null);
  if (done.length < 2) return null;
  const ps = done.map((r) => finalProbability(r)!);
  const min = Math.min(...ps);
  const max = Math.max(...ps);
  const spread = max - min;

  let outlierRole: ModelRole | null = null;
  let outlierGap = 0;
  for (const r of done) {
    const others = done.filter((o) => o !== r).map((o) => finalProbability(o)!).sort((a, b) => a - b);
    const med = others[Math.floor(others.length / 2)];
    const gap = Math.abs(finalProbability(r)! - med);
    if (gap > outlierGap) {
      outlierGap = gap;
      outlierRole = r.role;
    }
  }
  const significant = spread >= 0.15 && outlierGap >= 0.12;

  const narratives: DisagreementSummary["narratives"] = [];
  if (outlierRole) {
    const outlier = done.find((r) => r.role === outlierRole)!;
    const rest = done.filter((r) => r.role !== outlierRole);
    const restMean = rest.reduce((s, r) => s + finalProbability(r)!, 0) / rest.length;
    // the "consensus" premise is taken from the consensus model closest to its group mean
    const rep = [...rest].sort(
      (a, b) => Math.abs(finalProbability(a)! - restMean) - Math.abs(finalProbability(b)! - restMean),
    )[0];
    narratives.push({
      roles: rest.map((r) => r.role),
      probability: restMean,
      premise: rep.output?.pivotalAssumption ?? "",
      mechanism: rep.output?.headline ?? "",
    });
    narratives.push({
      roles: [outlier.role],
      probability: finalProbability(outlier)!,
      premise: outlier.output?.pivotalAssumption ?? "",
      mechanism: outlier.output?.headline ?? "",
    });
  }
  return { spread, min, max, outlierRole: significant ? outlierRole : null, significant, narratives };
}
