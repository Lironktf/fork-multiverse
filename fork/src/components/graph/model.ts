import type { Forecast, ForkEvent, ModelRole, TargetRef, Verse } from "@/lib/domain/types";
import { MODEL_ROLES } from "@/lib/domain/types";
import { cumulativeAssumptions, ancestry } from "@/lib/domain/verse";
import { DEMO_EFFECTS } from "@/lib/demo/events";
import { finalProbability } from "@/lib/forecast/aggregate";
import type { BasketItem } from "@/store/universe";
import type { EdgeSpec, NodeSpec } from "./engine";

export type NodeMeta =
  | { kind: "target"; verse: Verse; event: ForkEvent | undefined; outcome: string; forecast: Forecast | null }
  | { kind: "forecast"; role: ModelRole; forecast: Forecast; verseId: string }
  | { kind: "disagreement"; forecast: Forecast }
  | { kind: "assumption"; event: ForkEvent | undefined; eventId: string; outcome: string; layer: "inherited" | "new"; addedAt: string }
  | { kind: "pending"; event: ForkEvent | undefined; eventId: string; outcome: string; uid: string }
  | { kind: "event"; event: ForkEvent; relation: "demo-fixture" | "model-suggested" }
  | { kind: "verse"; verse: Verse; forecast: Forecast | null; onPath: boolean };

export interface GraphModel {
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  meta: Map<string, NodeMeta>;
}

const ROLE_ANGLES: Record<ModelRole, number> = { causal: -155, empirical: -25, market: 25, skeptic: 155 };
const rad = (d: number) => (d * Math.PI) / 180;
const lin = (a: number, b: number, n: number) => (n === 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));

/**
 * Assumption orbit slots. The upper arc is kept for assumptions (the target's
 * title sits below it and analyst nodes flank it); once the arc is full the
 * lower arc is used, skipping the wedge directly beneath the title.
 */
function assumptionSlots(n: number): number[] {
  if (n <= 5) return lin(n === 1 ? -90 : -150, n === 1 ? -90 : -30, n).map(rad);
  const up = Math.ceil(n / 2);
  return [...lin(-164, -16, up), ...lin(42, 138, n - up)].map(rad);
}

export const nid = {
  target: (v: string) => `t@${v}`,
  forecast: (v: string, r: string) => `f@${v}:${r}`,
  dis: (v: string) => `d@${v}`,
  assumption: (v: string, e: string) => `a@${v}:${e}`,
  pending: (v: string, e: string) => `p@${v}:${e}`,
  event: (v: string, e: string) => `e@${v}:${e}`,
  verse: (v: string) => `v:${v}`,
};

export function buildGraph(input: {
  verses: Record<string, Verse>;
  currentVerseId: string;
  events: Record<string, ForkEvent>;
  target: TargetRef;
  basket: BasketItem[];
  forecastFor: (verseId: string) => Forecast | null;
  suggestions: { eventId: string | null }[];
}): GraphModel {
  const { verses, currentVerseId: V, events, target, basket } = input;
  const cur = verses[V];
  const C = { x: cur.visualMetadata.x, y: cur.visualMetadata.y };
  const nodes: NodeSpec[] = [];
  const edges: EdgeSpec[] = [];
  const meta = new Map<string, NodeMeta>();
  const tId = nid.target(V);
  const curForecast = input.forecastFor(V);

  // Target — the event being forecast, at the heart of the current Verse
  nodes.push({ id: tId, type: "target", ax: C.x, ay: C.y, r: 64, pinned: true, draggable: false, hue: cur.visualMetadata.hue });
  meta.set(tId, { kind: "target", verse: cur, event: events[target.eventId], outcome: target.outcome, forecast: curForecast });

  // Forecast nodes — one per analyst, only for the forecast of THIS Verse × target
  if (curForecast) {
    const base = curForecast.baselineProbability;
    for (const run of curForecast.modelOutputs) {
      const id = nid.forecast(V, run.role);
      const a = rad(ROLE_ANGLES[run.role]);
      nodes.push({ id, type: "forecast", ax: C.x + Math.cos(a) * 205, ay: C.y + Math.sin(a) * 150, r: 26 });
      meta.set(id, { kind: "forecast", role: run.role, forecast: curForecast, verseId: V });
      const p = finalProbability(run);
      const kind = p === null || base === null ? "forecast" : p - base > 0.005 ? "forecast-up" : p - base < -0.005 ? "forecast-down" : "forecast";
      edges.push({ id: `${id}->t`, from: id, to: tId, kind, label: `${MODEL_ROLES[run.role].label} analyst estimate` });
    }
    const dis = curForecast.disagreementSummary;
    if (dis?.significant && dis.outlierRole) {
      const id = nid.dis(V);
      const a = rad(ROLE_ANGLES[dis.outlierRole]);
      nodes.push({ id, type: "disagreement", ax: C.x + Math.cos(a) * 395, ay: C.y + Math.sin(a) * 165, r: 22 });
      meta.set(id, { kind: "disagreement", forecast: curForecast });
      edges.push({ id: `${id}--f`, from: nid.forecast(V, dis.outlierRole), to: id, kind: "contradiction", label: "Significant model disagreement" });
    }
  }

  // Assumptions (inherited + new) and pending basket items share the assumption orbit
  const world = cumulativeAssumptions(cur);
  const ring: { id: string; isPending: boolean }[] = [
    ...world.map((a) => ({ id: nid.assumption(V, a.eventId), isPending: false })),
    ...basket.map((b) => ({ id: nid.pending(V, b.eventId), isPending: true })),
  ];
  const n = ring.length;
  const angles = assumptionSlots(n);
  const R = n > 10 ? 380 : 330;
  world.forEach((a, i) => {
    const id = nid.assumption(V, a.eventId);
    const ang = angles[i];
    const layer = a.addedAtVerseId === V ? "new" : "inherited";
    nodes.push({ id, type: "assumption", ax: C.x + Math.cos(ang) * R, ay: C.y + Math.sin(ang) * R * 0.86, r: 34 });
    meta.set(id, { kind: "assumption", event: events[a.eventId], eventId: a.eventId, outcome: a.selectedOutcome, layer, addedAt: a.addedAtVerseId });
    edges.push({ id: `${id}->t`, from: id, to: tId, kind: layer === "new" ? "assumed" : "inherited", label: layer === "new" ? "Assumed in this Verse" : "Inherited assumption" });
  });
  basket.forEach((b, j) => {
    const i = world.length + j;
    const id = nid.pending(V, b.eventId);
    const ang = angles[i];
    nodes.push({ id, type: "pending", ax: C.x + Math.cos(ang) * R, ay: C.y + Math.sin(ang) * R * 0.86, r: 34 });
    meta.set(id, { kind: "pending", event: events[b.eventId], eventId: b.eventId, outcome: b.outcome, uid: b.uid });
    edges.push({ id: `${id}->t`, from: id, to: tId, kind: "pending", label: "Proposed assumption (in basket, not yet forked)" });
  });

  // Exclusive pairs among assumptions/pending → contradiction edges
  const onRing = new Map<string, string>();
  world.forEach((a) => a.selectedOutcome === "YES" && onRing.set(a.eventId, nid.assumption(V, a.eventId)));
  basket.forEach((b) => b.outcome === "YES" && onRing.set(b.eventId, nid.pending(V, b.eventId)));
  for (const [eid, id] of onRing) {
    for (const other of events[eid]?.metadata?.exclusiveWith ?? []) {
      const oid = onRing.get(other);
      if (oid && id < oid) edges.push({ id: `${id}x${oid}`, from: id, to: oid, kind: "contradiction", label: "Mutually exclusive as defined" });
    }
  }

  // Related, unassumed events — what this world might depend on
  const used = new Set([...world.map((a) => a.eventId), ...basket.map((b) => b.eventId), target.eventId]);
  const related: { ev: ForkEvent; relation: "demo-fixture" | "model-suggested" }[] = [];
  for (const s of input.suggestions) {
    if (s.eventId && events[s.eventId] && !used.has(s.eventId)) {
      related.push({ ev: events[s.eventId], relation: "model-suggested" });
      used.add(s.eventId);
    }
  }
  const table = DEMO_EFFECTS[target.eventId] ?? {};
  Object.entries(table)
    .filter(([id]) => !used.has(id) && events[id])
    .sort((a, b) => b[1].d.reduce((s, x) => s + Math.abs(x), 0) - a[1].d.reduce((s, x) => s + Math.abs(x), 0))
    .forEach(([id]) => related.push({ ev: events[id], relation: "demo-fixture" }));
  const outer = related.slice(0, n > 5 ? 4 : 6);
  outer.forEach((r, i, arr) => {
    const id = nid.event(V, r.ev.id);
    // outer ring: sides and lower arc, clear of the assumption arc above
    const ang = rad(arr.length === 1 ? 90 : -8 + (i / (arr.length - 1)) * 196);
    nodes.push({ id, type: "event", ax: C.x + Math.cos(ang) * 520, ay: C.y + Math.sin(ang) * 400, r: 30 });
    meta.set(id, { kind: "event", event: r.ev, relation: r.relation });
    edges.push({
      id: `${id}~t`,
      from: id,
      to: tId,
      kind: "inferred",
      label: r.relation === "model-suggested" ? "Model-inferred dependency (not established causality)" : "Illustrative dependency (demo fixture)",
    });
  });

  // Every other Verse, at its permanent location
  const path = new Set(ancestry(verses, V).map((v) => v.id));
  const vnode = (id: string) => (id === V ? tId : nid.verse(id));
  for (const v of Object.values(verses)) {
    if (v.id !== V) {
      const id = nid.verse(v.id);
      nodes.push({ id, type: "verse", ax: v.visualMetadata.x, ay: v.visualMetadata.y, r: 30, pinned: true, hue: v.visualMetadata.hue });
      meta.set(id, { kind: "verse", verse: v, forecast: input.forecastFor(v.id), onPath: path.has(v.id) });
    }
    if (v.parentId && verses[v.parentId]) {
      const active = path.has(v.id) && path.has(v.parentId);
      edges.push({ id: `L:${v.parentId}->${v.id}`, from: vnode(v.parentId), to: vnode(v.id), kind: active ? "lineage-active" : "lineage", label: v.relationshipType === "disagreement-split" ? "Forked from a model disagreement" : "Parent → child Verse" });
    }
  }

  return { nodes, edges, meta };
}
