import type { ForkEvent, MarketSnapshot, ProbabilityKind } from "./types";

export interface ObservedProbability {
  value: number;
  kind: ProbabilityKind;
  label: string;
  snapshot?: MarketSnapshot;
  timestamp?: string;
}

/**
 * Observed probability for an (event, outcome) pair:
 *   gemini binary YES → YES-contract mid (or last trade)
 *   gemini binary NO  → 1 − YES mid (complement of the same book)
 *   gemini categorical outcome → that contract's YES mid
 *   demo → illustrative baseline (kind DEMO)
 * Returns null instead of inventing a number.
 */
export function observedProbability(event: ForkEvent | undefined, outcome: string): ObservedProbability | null {
  if (!event) return null;
  if (event.source === "gemini") {
    const isNo = event.eventType === "binary" && outcome === "NO";
    const snap = event.snapshots?.find((s) => s.outcome === (isNo ? "YES" : outcome));
    if (!snap || snap.impliedProbabilityEstimate === null) return null;
    return {
      value: isNo ? 1 - snap.impliedProbabilityEstimate : snap.impliedProbabilityEstimate,
      kind: "MARKET",
      label: snap.dataQuality === "two-sided" ? "Gemini mid" : "Gemini last trade",
      snapshot: snap,
      timestamp: snap.timestamp,
    };
  }
  if (event.source === "demo" && typeof event.metadata?.demoBaseline === "number") {
    const b = event.metadata.demoBaseline;
    return { value: outcome === "NO" ? 1 - b : b, kind: "DEMO", label: "Illustrative" };
  }
  return null;
}

export const fmtPct = (p: number | null | undefined, digits = 0) =>
  p === null || p === undefined ? "—" : `${(p * 100).toFixed(digits)}%`;

export const fmtPp = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(0)}pp`;

export const fmtUsd = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
