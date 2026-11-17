import { test, expect } from "@playwright/test";
import { runDemoForecast, demoNextForks } from "../../src/lib/demo/engine";
import { ALL_DEMO_EVENTS, DEMO_TARGETS } from "../../src/lib/demo/events";
import { summarizeDisagreement, ensembleMean } from "../../src/lib/forecast/aggregate";
import { observedProbability } from "../../src/lib/domain/market";
import { placeChild, makeOrigin, ancestry, cumulativeAssumptions } from "../../src/lib/domain/verse";
import { AnalystOutput, type ForkEvent, type ModelRun, type Verse } from "../../src/lib/domain/types";
import { snapshotFromPrices, normalizeEvent } from "../../src/lib/domain/gemini-normalize";

const events = new Map(ALL_DEMO_EVENTS.map((e) => [e.id, e]));
const btc = DEMO_TARGETS[0];

test("demo forecast: equal-weight mean of four lenses, labelled DEMO", () => {
  const f = runDemoForecast({ forecastId: "f", verseId: "v", target: btc, targetOutcome: "YES", scenario: [{ eventId: "demo-fed-cuts-100", outcome: "YES" }], events });
  expect(f.kind).toBe("DEMO");
  expect(f.modelOutputs).toHaveLength(4);
  const mean = f.modelOutputs.reduce((s, r) => s + r.output!.probability, 0) / 4;
  expect(f.ensembleProbability).toBeCloseTo(mean, 10);
  expect(f.ensembleProbability!).toBeGreaterThan(0.35);
  for (const r of f.modelOutputs) expect(() => AnalystOutput.parse(r.output)).not.toThrow();
});

test("demo forecast: skeptic disagrees on rate cuts (authored disagreement case)", () => {
  const f = runDemoForecast({ forecastId: "f", verseId: "v", target: btc, targetOutcome: "YES", scenario: [{ eventId: "demo-fed-cuts-100", outcome: "YES" }, { eventId: "demo-crypto-etf", outcome: "YES" }], events });
  expect(f.disagreementSummary?.significant).toBe(true);
  expect(f.disagreementSummary?.outlierRole).toBe("skeptic");
});

test("demo forecast: NO outcome of target is the complement", () => {
  const sc = [{ eventId: "demo-us-recession", outcome: "YES" }];
  const yes = runDemoForecast({ forecastId: "a", verseId: "v", target: btc, targetOutcome: "YES", scenario: sc, events });
  const no = runDemoForecast({ forecastId: "b", verseId: "v", target: btc, targetOutcome: "NO", scenario: sc, events });
  expect(yes.ensembleProbability! + no.ensembleProbability!).toBeCloseTo(1, 6);
});

test("unauthored assumptions are ignored, not invented", () => {
  const live: ForkEvent = { ...ALL_DEMO_EVENTS[5], id: "gemini:X", source: "gemini" };
  const f = runDemoForecast({ forecastId: "f", verseId: "v", target: btc, targetOutcome: "YES", scenario: [{ eventId: live.id, outcome: "YES" }], events: new Map([[live.id, live]]) });
  expect(f.ensembleProbability).toBeCloseTo(0.35, 6);
  expect(f.modelOutputs[0].output!.reasoning).toContain("No demonstration effect is authored");
});

test("next fork ranking is sorted by swing and excludes assumed events", () => {
  const s = demoNextForks(btc, [{ eventId: "demo-sbr-purchases", outcome: "YES" }]);
  expect(s.length).toBeGreaterThan(0);
  expect(s.map((x) => x.eventId)).not.toContain("demo-sbr-purchases");
  for (let i = 1; i < s.length; i++) expect(s[i - 1].swing).toBeGreaterThanOrEqual(s[i].swing);
});

test("disagreement: needs two completed analysts; failed runs never count", () => {
  const run = (role: ModelRun["role"], p: number | null, status: ModelRun["status"] = "done"): ModelRun => ({
    role, model: "m", status, startedAt: null, finishedAt: null, attempts: 1, revised: null, error: null,
    output: p === null ? null : { targetEventId: "t", scenario: [], probability: p, headline: role, keyAssumptions: [], reasoning: "", counterarguments: [], evidence: [], missingInformation: [], uncertainties: [], downstreamEvents: [], nextQuestions: [], pivotalAssumption: role },
  });
  expect(summarizeDisagreement([run("causal", 0.6), run("skeptic", null, "failed")])).toBeNull();
  const d = summarizeDisagreement([run("causal", 0.6), run("empirical", 0.62), run("market", 0.58), run("skeptic", 0.3)]);
  expect(d?.outlierRole).toBe("skeptic");
  expect(d?.spread).toBeCloseTo(0.32, 6);
  expect(ensembleMean([run("causal", 0.6), run("skeptic", null, "failed")])).toBeCloseTo(0.6, 6);
});

test("market probability: mid of two-sided book; NO is complement; one-sided gives no estimate", () => {
  const two = snapshotFromPrices("e", "YES", { bestBid: "0.40", bestAsk: "0.44" }, "t", null, null);
  expect(two.impliedProbabilityEstimate).toBeCloseTo(0.42, 9);
  expect(two.dataQuality).toBe("two-sided");
  const one = snapshotFromPrices("e", "YES", { bestBid: null, bestAsk: "0.04" }, "t", null, null);
  expect(one.impliedProbabilityEstimate).toBeNull();
  const ev = normalizeEvent({ id: "1", title: "Recession?", type: "binary", ticker: "R", status: "active", contracts: [{ id: "c", label: "Yes", prices: { bestBid: "0.2", bestAsk: "0.3" } }] }, Date.now());
  expect(observedProbability(ev, "YES")?.value).toBeCloseTo(0.25, 9);
  expect(observedProbability(ev, "NO")?.value).toBeCloseTo(0.75, 9);
  expect(observedProbability(ev, "YES")?.kind).toBe("MARKET");
});

test("verse placement is deterministic and keeps distance; ancestry and inheritance", () => {
  const o = makeOrigin();
  const verses: Record<string, Verse> = { origin: o };
  const a = placeChild(verses, o, 0);
  expect(placeChild(verses, o, 0)).toEqual(a);
  const v1: Verse = { ...o, id: "v1", parentId: "origin", depth: 1, newAssumptions: [{ eventId: "x", selectedOutcome: "YES", addedAtVerseId: "v1", sourceReference: null }], visualMetadata: { ...o.visualMetadata, ...a } };
  verses.v1 = v1;
  const b = placeChild(verses, o, 1);
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(800);
  const v2: Verse = { ...v1, id: "v2", parentId: "v1", depth: 2, inheritedAssumptions: cumulativeAssumptions(v1), newAssumptions: [{ eventId: "y", selectedOutcome: "NO", addedAtVerseId: "v2", sourceReference: null }] };
  verses.v2 = v2;
  expect(ancestry(verses, "v2").map((v) => v.id)).toEqual(["origin", "v1", "v2"]);
  expect(cumulativeAssumptions(v2).map((x) => x.eventId)).toEqual(["x", "y"]);
});
