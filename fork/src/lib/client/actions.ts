"use client";
import type { Forecast, ForkEvent, TargetRef, Verse } from "@/lib/domain/types";
import { targetKey } from "@/lib/domain/types";
import { observedProbability } from "@/lib/domain/market";
import { ORIGIN_ID, cumulativeAssumptions } from "@/lib/domain/verse";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI, prefersReducedMotion } from "@/store/ui";
import { engine } from "./runtime";
import { nid } from "@/components/graph/model";

const TERMINAL = new Set(["complete", "partial", "failed"]);
export const isTerminal = (f: Forecast | null | undefined) => !!f && TERMINAL.has(f.status);

/** Baseline shown next to a conditional forecast: market price if observed, else the Origin's model estimate. */
export function baselineFor(target: TargetRef, engineMode: "auto" | "demo"): { value: number; kind: "MARKET" | "MODEL" | "DEMO"; label: string } | null {
  const s = useUniverse.getState();
  const obs = observedProbability(s.events[target.eventId], target.outcome);
  if (obs?.kind === "MARKET") return { value: obs.value, kind: "MARKET", label: obs.label };
  const origin = forecastFor(s, ORIGIN_ID, target);
  if (origin?.ensembleProbability != null && origin.kind === "MODEL") return { value: origin.ensembleProbability, kind: "MODEL", label: "Origin model estimate" };
  if (obs?.kind === "DEMO" && engineMode === "demo") return { value: obs.value, kind: "DEMO", label: "Illustrative baseline" };
  return null;
}

export async function requestForecast(verseId: string, target: TargetRef, opts: { force?: boolean; engine?: "auto" | "demo" } = {}): Promise<Forecast | null> {
  const s = useUniverse.getState();
  const existing = forecastFor(s, verseId, target);
  if (existing && !opts.force && existing.status !== "failed") return existing;
  const verse = s.verses[verseId];
  const ev = s.events[target.eventId];
  if (!verse || !ev) return null;
  const scenario = cumulativeAssumptions(verse).map((a) => ({
    event: s.events[a.eventId],
    outcome: a.selectedOutcome,
    layer: a.addedAtVerseId === verseId ? "new" : "inherited",
  }));
  const forecastId = `${verseId}__${targetKey(target).replace(/[^A-Za-z0-9:_-]/g, "_")}__${Date.now().toString(36)}`;
  try {
    const res = await fetch("/api/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        forecastId,
        verseId,
        target: ev,
        targetOutcome: target.outcome,
        scenario,
        engine: opts.engine ?? s.engine,
        baseline: baselineFor(target, opts.engine ?? s.engine),
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "forecast request failed");
    const f = json.forecast as Forecast;
    s.upsertForecast(f);
    s.linkForecast(verseId, target, f.id);
    return f;
  } catch (e) {
    useUI.getState().toast(`Forecast request failed: ${(e as Error).message}. The Verse is saved; retry from the forecast panel.`, "error");
    return null;
  }
}

/** Polls every non-terminal forecast. Called on an interval by the app shell. */
let polling = false;
export async function pollForecasts() {
  if (polling) return;
  polling = true;
  try {
    const s = useUniverse.getState();
    const open = Object.values(s.forecasts).filter((f) => !isTerminal(f));
    await Promise.all(
      open.map(async (f) => {
        try {
          const res = await fetch(`/api/forecast/${encodeURIComponent(f.id)}`, { cache: "no-store" });
          if (res.status === 404) {
            // server lost the job (e.g. restarted mid-analysis) — mark honestly, never invent
            useUniverse.getState().upsertForecast({ ...f, status: f.modelOutputs.some((r) => r.status === "done") ? "partial" : "failed", error: "The analysis job was lost (server restarted). Re-run to analyse again." });
            return;
          }
          const json = await res.json();
          if (json.ok) {
            const prev = useUniverse.getState().forecasts[f.id];
            useUniverse.getState().upsertForecast(json.forecast);
            if (!isTerminal(prev) && isTerminal(json.forecast)) onForecastSettled(json.forecast);
          }
        } catch {
          /* transient; next tick retries */
        }
      }),
    );
  } finally {
    polling = false;
  }
}

function onForecastSettled(f: Forecast) {
  const ui = useUI.getState();
  const s = useUniverse.getState();
  if (f.status === "failed") ui.toast(`Analysis failed for ${s.verses[f.verseId]?.name ?? "a Verse"}: ${f.error ?? "unknown error"}`, "error");
  else if (f.status === "partial") ui.toast(`Partial ensemble: ${f.modelOutputs.filter((r) => r.status === "done").length} of 4 analysts returned valid output.`, "warn");
  else ui.set({ announce: `Forecast ready for ${s.verses[f.verseId]?.name}: ${(f.ensembleProbability! * 100).toFixed(0)} percent.` });
  if (f.verseId === s.currentVerseId) engine.pulseEdgesOf(nid.target(f.verseId), 1);
}

/* ---------------- navigation ---------------- */

export function navigateTo(verseId: string) {
  const ui = useUI.getState();
  if (ui.forkPhase !== "idle") return;
  const s = useUniverse.getState();
  const v = s.verses[verseId];
  if (!v) return;
  s.setCurrentVerse(verseId);
  ui.set({ selectedNode: null, inspectRole: null, disagreementOpen: false, announce: `Entered ${v.name}, generation ${v.visualMetadata.generation}.` });
  engine.travelTo({ x: v.visualMetadata.x, y: v.visualMetadata.y });
}

export function focusCurrent(k?: number) {
  const s = useUniverse.getState();
  const v = s.verses[s.currentVerseId];
  engine.flyTo(v.visualMetadata.x, v.visualMetadata.y, k ?? fitConstellationK(), 800);
}

export function fitConstellationK() {
  if (typeof window === "undefined") return 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  // constellation spans ~1000×860 world units; leave room for HUD
  return Math.max(0.35, Math.min(1.05, Math.min((w - 120) / 1150, (h - 150) / 960)));
}

/* ---------------- forking ---------------- */

export async function forkReality(opts: { assumptions?: { eventId: string; outcome: string }[]; relationshipType?: Verse["relationshipType"]; parentId?: string } = {}) {
  const ui = useUI.getState();
  if (ui.forkPhase !== "idle") return null; // state machine: one transition at a time
  const s = useUniverse.getState();
  const assumptions = opts.assumptions ?? s.basket.map((b) => ({ eventId: b.eventId, outcome: b.outcome }));
  if (!assumptions.length) {
    ui.toast("Add at least one assumption to the basket before forking.", "warn");
    return null;
  }
  const parentId = opts.parentId ?? s.currentVerseId;
  const parent = s.verses[parentId];
  const target = s.target;
  ui.set({ forkPhase: "commit", forkFromVerse: parentId, selectedNode: null, inspectRole: null, disagreementOpen: false, namingVerseId: null });

  const child = s.createVerse({ parentId, assumptions, relationshipType: opts.relationshipType });

  // Need a baseline for non-market targets: analyse the Origin too (once).
  const ev = s.events[target.eventId];
  const obs = observedProbability(ev, target.outcome);
  if (s.engine !== "demo" && obs?.kind !== "MARKET" && !forecastFor(s, ORIGIN_ID, target)) requestForecast(ORIGIN_ID, target);
  // Analysis starts immediately; the choreography never waits for it.
  requestForecast(child.id, target);

  const converge = [
    ...s.basket.map((b) => nid.pending(parentId, b.eventId)),
    ...cumulativeAssumptions(parent).map((a) => nid.assumption(parentId, a.eventId)),
  ];
  engine.reduced = prefersReducedMotion();
  await engine.playFork({
    from: { x: parent.visualMetadata.x, y: parent.visualMetadata.y },
    to: { x: child.visualMetadata.x, y: child.visualMetadata.y },
    converge,
    reduced: engine.reduced,
    onPhase: (p) => {
      ui.set({ forkPhase: p, forkToVerse: child.id });
      if (p === "travel") {
        const st = useUniverse.getState();
        st.setCurrentVerse(child.id);
        if (!opts.assumptions) useUniverse.setState({ basket: [], basketPast: [], basketFuture: [] });
      }
      if (p === "reveal") ui.set({ namingVerseId: child.id, announce: `New Verse created at generation ${child.visualMetadata.generation}. Name this world.` });
    },
  });
  ui.set({ forkPhase: "idle", forkFromVerse: null, forkToVerse: null });
  return child;
}

/** Split a model disagreement into two sibling Verses, each assuming one analyst's pivotal premise. */
export async function forkDisagreement(f: Forecast) {
  const d = f.disagreementSummary;
  if (!d || d.narratives.length < 2) return;
  const s = useUniverse.getState();
  const mk = (premise: string, roles: string[]): ForkEvent => ({
    id: `model:${f.id}:${roles.join("-")}`,
    title: premise.length > 110 ? premise.slice(0, 107) + "…" : premise,
    description: `Premise surfaced by the ${roles.join(", ")} analyst${roles.length > 1 ? "s" : ""} while forecasting “${s.events[f.targetEventId]?.title}”. Proposed by a model — not an observed event.`,
    category: "other",
    source: "model",
    externalMarketId: null,
    eventType: "binary",
    possibleOutcomes: ["YES", "NO"],
    resolutionCriteria: "Model-proposed premise; no formal resolution source.",
    resolutionDate: null,
    metadata: { proposedBy: roles.join(",") },
  });
  const [consensus, outlier] = d.narratives;
  const a = mk(consensus.premise, consensus.roles);
  const b = mk(outlier.premise, outlier.roles);
  a.metadata.exclusiveWith = [b.id];
  b.metadata.exclusiveWith = [a.id];
  s.registerEvents([a, b]);
  const parentId = f.verseId;
  // sibling B is created silently; the camera travels into sibling A
  const sib = s.createVerse({ parentId, assumptions: [{ eventId: b.id, outcome: "YES" }], relationshipType: "disagreement-split" });
  requestForecast(sib.id, s.target);
  await forkReality({ parentId, assumptions: [{ eventId: a.id, outcome: "YES" }], relationshipType: "disagreement-split" });
}

/* ---------------- next fork ---------------- */

export async function requestNextForks(verseId: string, target: TargetRef) {
  const key = `${verseId}::${targetKey(target)}`;
  const ui = useUI.getState();
  if (ui.nextForks[key]?.status === "loading") return;
  const s = useUniverse.getState();
  const verse = s.verses[verseId];
  const world = cumulativeAssumptions(verse);
  const used = new Set([...world.map((a) => a.eventId), target.eventId]);
  const candidates = Object.values(s.events)
    .filter((e) => !used.has(e.id) && e.source !== "model")
    .sort((a, b) => (a.source === "demo" ? 0 : 1) - (b.source === "demo" ? 0 : 1))
    .slice(0, 40);
  ui.set({ nextForks: { ...ui.nextForks, [key]: { status: "loading", suggestions: [] } } });
  try {
    const res = await fetch("/api/next-fork", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: s.events[target.eventId],
        targetOutcome: target.outcome,
        scenario: world.map((a) => ({ event: s.events[a.eventId], outcome: a.selectedOutcome, layer: "inherited" })),
        candidates,
        engine: s.engine,
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    useUI.setState((u) => ({ nextForks: { ...u.nextForks, [key]: { status: "done", engine: json.engine, suggestions: json.suggestions } } }));
  } catch (e) {
    useUI.setState((u) => ({ nextForks: { ...u.nextForks, [key]: { status: "error", suggestions: [], error: (e as Error).message } } }));
  }
}

/** Adds an event (registering it first) and gives graph + screen-reader feedback. */
export function addEventToBasket(ev: ForkEvent, outcome?: string, spawnAt?: { x: number; y: number }) {
  const s = useUniverse.getState();
  const ui = useUI.getState();
  if (ui.forkPhase !== "idle") return false;
  if (!s.events[ev.id] || s.events[ev.id].fetchedAt !== ev.fetchedAt) s.registerEvents([ev]);
  if (ev.id === s.target.eventId) {
    ui.toast("That event is the current target. Pick a different event to assume.", "warn");
    return false;
  }
  const r = s.addToBasket(ev.id, outcome);
  if (r === "added") {
    if (spawnAt) engine.spawnAt(nid.pending(s.currentVerseId, ev.id), spawnAt.x, spawnAt.y);
    ui.set({ basketPulse: ui.basketPulse + 1, announce: `Added ${ev.title} to the basket, assumed ${outcome ?? ev.possibleOutcomes[0]}.` });
    setTimeout(() => engine.pulseEdgesOf(nid.pending(s.currentVerseId, ev.id), 1), 450);
    return true;
  }
  if (r === "exists") ui.toast("Already in the basket.", "info");
  if (r === "full") ui.toast("The basket holds up to 8 assumptions. Fork, then keep building from the new Verse.", "warn");
  if (r === "inherited") ui.toast("This world already assumes that event. To assume a different outcome, fork from an ancestor Verse.", "warn");
  return false;
}

/** Seeds a small, clearly-labelled demonstration universe (forecasts use the DEMO engine). */
export function seedDemoUniverse() {
  const s = useUniverse.getState();
  s.resetUniverse();
  const target = { eventId: "demo-btc-150k-2027", outcome: "YES" };
  s.setTarget(target);
  const mk = (parentId: string, name: string, a: [string, string][]) => {
    const v = useUniverse.getState().createVerse({ parentId, assumptions: a.map(([eventId, outcome]) => ({ eventId, outcome })) });
    useUniverse.getState().renameVerse(v.id, name);
    requestForecast(v.id, target, { engine: "demo" });
    return v;
  };
  requestForecast(ORIGIN_ID, target, { engine: "demo" });
  const soft = mk(ORIGIN_ID, "Soft Landing", [["demo-fed-cuts-100", "YES"], ["demo-us-recession", "NO"]]);
  mk(soft.id, "ETF Euphoria", [["demo-crypto-etf", "YES"], ["demo-market-structure-law", "YES"]]);
  mk(ORIGIN_ID, "Red Winter", [["demo-us-recession", "YES"], ["demo-exchange-collapse", "YES"]]);
  useUniverse.getState().setCurrentVerse(soft.id);
}
