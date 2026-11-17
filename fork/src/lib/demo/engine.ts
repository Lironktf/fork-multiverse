/**
 * Deterministic DEMONSTRATION forecast engine.
 *
 * Composes the hand-authored effects in `events.ts` in log-odds space so the
 * product is fully explorable without model access. Output is labelled
 * kind=DEMO everywhere it is shown. It is not a model and not a forecast.
 */
import {
  MODEL_ROLES,
  type DisagreementSummary,
  type Forecast,
  type ForkEvent,
  type ModelRole,
  type ModelRun,
  type NextForkSuggestion,
} from "@/lib/domain/types";
import { ALL_DEMO_EVENTS, DEMO_EFFECTS, type DemoEffect } from "./events";
import { summarizeDisagreement } from "@/lib/forecast/aggregate";

const ROLES: ModelRole[] = ["causal", "empirical", "market", "skeptic"];
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));
/** A NO resolution moves the target less than YES does (asymmetric by design; illustrative). */
const NO_DAMPING = 0.4;

export interface ScenarioItem {
  eventId: string;
  outcome: string;
}

export function demoBaseline(target: ForkEvent): number | null {
  return target.metadata?.demoBaseline ?? null;
}

function effectFor(targetId: string, a: ScenarioItem): { eff: DemoEffect; sign: number } | null {
  const eff = DEMO_EFFECTS[targetId]?.[a.eventId];
  if (!eff) return null;
  if (a.outcome === "YES") return { eff, sign: 1 };
  if (a.outcome === "NO") return { eff, sign: -NO_DAMPING };
  return null;
}

export function demoRoleProbability(targetId: string, base: number, scenario: ScenarioItem[], roleIdx: number) {
  let sum = 0;
  let n = 0;
  for (const a of scenario) {
    const e = effectFor(targetId, a);
    if (!e) continue;
    sum += e.eff.d[roleIdx] * e.sign;
    n++;
  }
  // diminishing returns as assumptions stack (overlapping mechanisms)
  const damp = n > 1 ? 1 / (1 + 0.18 * (n - 1)) : 1;
  return clamp(sigmoid(logit(base) + sum * damp));
}

const eventTitle = (id: string, events: Map<string, ForkEvent>) =>
  events.get(id)?.title ?? ALL_DEMO_EVENTS.find((e) => e.id === id)?.title ?? id;

export function runDemoForecast(opts: {
  forecastId: string;
  verseId: string;
  target: ForkEvent;
  targetOutcome: string;
  scenario: ScenarioItem[];
  events: Map<string, ForkEvent>;
}): Forecast {
  const { target, scenario, events } = opts;
  const now = new Date().toISOString();
  const base = demoBaseline(target) ?? 0.5;
  const authored = scenario.filter((a) => effectFor(target.id, a));
  const unauthored = scenario.filter((a) => !effectFor(target.id, a));

  const runs: ModelRun[] = ROLES.map((role, i) => {
    const pYes = demoRoleProbability(target.id, base, scenario, i);
    const p = opts.targetOutcome === "NO" ? 1 - pYes : pYes;
    const lines = authored.map((a) => {
      const e = effectFor(target.id, a)!;
      const title = eventTitle(a.eventId, events);
      const why = role === "skeptic" && e.eff.skeptic ? e.eff.skeptic : e.eff.why;
      const dir = e.eff.d[i] * e.sign >= 0 ? "raises" : "lowers";
      return { claim: `${title} = ${a.outcome}: ${dir} the estimate. ${why}`, why, title, outcome: a.outcome };
    });
    const top = [...authored].sort((x, y) => {
      const ex = effectFor(target.id, x)!;
      const ey = effectFor(target.id, y)!;
      return Math.abs(ey.eff.d[i] * ey.sign) - Math.abs(ex.eff.d[i] * ex.sign);
    })[0];
    const topEff = top ? effectFor(target.id, top)! : null;
    const headline = topEff
      ? role === "skeptic" && topEff.eff.skeptic
        ? topEff.eff.skeptic
        : topEff.eff.why
      : "No authored demonstration effect applies; estimate stays at the illustrative baseline.";
    return {
      role,
      model: "demo-fixture",
      status: "done",
      startedAt: now,
      finishedAt: now,
      attempts: 1,
      revised: null,
      error: null,
      output: {
        targetEventId: target.id,
        scenario: scenario.map((s) => ({ eventId: s.eventId, resolution: s.outcome })),
        probability: Math.min(0.99, Math.max(0.01, p)),
        headline,
        keyAssumptions: authored.slice(0, 6).map((a) => `${eventTitle(a.eventId, events)} resolves ${a.outcome}`),
        reasoning:
          `[Demonstration narrative — ${MODEL_ROLES[role].label} lens] ` +
          (lines.length ? lines.map((l) => l.claim).join(" ") : "No authored effects for this scenario.") +
          (unauthored.length
            ? ` No demonstration effect is authored for: ${unauthored.map((u) => eventTitle(u.eventId, events)).join(", ")}; they are ignored here. Run the Claude engine for a real analysis.`
            : ""),
        counterarguments:
          role === "skeptic"
            ? ["Assumption effects overlap; summing them overstates the shift.", "Market narratives can invert under stress."]
            : ["Effects are illustrative and not calibrated."],
        evidence: [],
        missingInformation: ["Demonstration mode performs no research."],
        uncertainties: ["Interaction between assumptions is approximated by a fixed damping factor."],
        downstreamEvents: [],
        nextQuestions: [],
        pivotalAssumption:
          role === "skeptic" && topEff?.eff.skeptic
            ? topEff.eff.skeptic.replace(/\.$/, "")
            : topEff
              ? topEff.eff.why.replace(/\.$/, "")
              : "Baseline conditions persist",
      },
    } satisfies ModelRun;
  });

  const probs = runs.map((r) => r.output!.probability);
  const ensemble = probs.reduce((a, b) => a + b, 0) / probs.length;
  const disagreement: DisagreementSummary | null = summarizeDisagreement(runs);

  return {
    id: opts.forecastId,
    verseId: opts.verseId,
    targetEventId: target.id,
    targetOutcome: opts.targetOutcome,
    engine: "demo",
    kind: "DEMO",
    baselineProbability: opts.targetOutcome === "NO" ? 1 - base : base,
    baselineKind: "DEMO",
    baselineLabel: "Illustrative baseline",
    ensembleProbability: ensemble,
    aggregation: "Equal-weight mean of four demonstration lenses (no weights: no documented basis for any).",
    modelOutputs: runs,
    disagreementSummary: disagreement,
    assumptions: scenario.map((s) => ({ eventId: s.eventId, title: eventTitle(s.eventId, events), outcome: s.outcome })),
    sources: [],
    researchNote: "Demonstration mode: no research was performed and no sources are cited.",
    generatedAt: now,
    completedAt: now,
    status: "complete",
    error: null,
  };
}

/** Rank unassumed demo events by authored swing: |P(target|YES) − P(target|NO)|, ensemble mean. */
export function demoNextForks(target: ForkEvent, scenario: ScenarioItem[]): NextForkSuggestion[] {
  const base = demoBaseline(target) ?? 0.5;
  const assumed = new Set(scenario.map((s) => s.eventId));
  const table = DEMO_EFFECTS[target.id] ?? {};
  const out: NextForkSuggestion[] = [];
  for (const eventId of Object.keys(table)) {
    if (assumed.has(eventId)) continue;
    const ev = ALL_DEMO_EVENTS.find((e) => e.id === eventId);
    if (!ev) continue;
    const mean = (outcome: string) =>
      ROLES.reduce((s, _r, i) => s + demoRoleProbability(target.id, base, [...scenario, { eventId, outcome }], i), 0) / 4;
    const pYes = mean("YES");
    const pNo = mean("NO");
    out.push({
      eventId,
      title: ev.title,
      rationale: table[eventId].skeptic
        ? `Analysts read this differently: “${table[eventId].why}” vs “${table[eventId].skeptic}”`
        : table[eventId].why,
      outcomes: ["YES", "NO"],
      conditional: [
        { outcome: "YES", probability: pYes },
        { outcome: "NO", probability: pNo },
      ],
      swing: Math.abs(pYes - pNo),
    });
  }
  return out.sort((a, b) => b.swing - a.swing).slice(0, 4);
}
