"use client";
/**
 * Universe store — the durable application state (persisted to localStorage
 * and mirrored to the server). Ephemeral interaction state (hover, drag,
 * transition, panels) lives in ./ui.ts so graph physics never couples to it.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Assumption, Forecast, ForkEvent, TargetRef, Verse } from "@/lib/domain/types";
import { targetKey } from "@/lib/domain/types";
import { ALL_DEMO_EVENTS, DEMO_TARGETS } from "@/lib/demo/events";
import { ORIGIN_ID, cumulativeAssumptions, hash, makeOrigin, placeChild, verseHue, childrenOf } from "@/lib/domain/verse";

export interface BasketItem {
  uid: string;
  eventId: string;
  outcome: string;
}

export type Mode = "explore" | "markets";

export interface Conflict {
  kind: "same-event" | "inherited-contradiction" | "exclusive";
  message: string;
  eventIds: string[];
  blocking: boolean;
}

interface UniverseState {
  started: boolean;
  mode: Mode;
  engine: "auto" | "demo";
  events: Record<string, ForkEvent>;
  verses: Record<string, Verse>;
  forecasts: Record<string, Forecast>;
  /** verseId -> targetKey -> forecastId */
  forecastIndex: Record<string, Record<string, string>>;
  currentVerseId: string;
  target: TargetRef;
  basket: BasketItem[];
  basketPast: BasketItem[][];
  basketFuture: BasketItem[][];
  savedDraft: BasketItem[] | null;
  acknowledgedConflicts: string[];
  compare: string[];
  universeId: string;
  /** Genuine Solana devnet memo transactions anchoring a Verse fingerprint. */
  attestations: Record<string, { signature: string; hash: string; at: string; cluster: string; wallet: string }[]>;
  addAttestation: (verseId: string, a: { signature: string; hash: string; at: string; cluster: string; wallet: string }) => void;

  start: (target?: TargetRef) => void;
  setMode: (m: Mode) => void;
  setEngine: (e: "auto" | "demo") => void;
  registerEvents: (evs: ForkEvent[]) => void;
  setTarget: (t: TargetRef) => void;

  addToBasket: (eventId: string, outcome?: string) => "added" | "exists" | "full" | "inherited";
  removeFromBasket: (uid: string) => void;
  setOutcome: (uid: string, outcome: string) => void;
  reorderBasket: (items: BasketItem[]) => void;
  clearBasket: () => void;
  undoBasket: () => void;
  redoBasket: () => void;
  saveDraft: () => void;
  restoreDraft: () => void;
  acknowledgeConflicts: (keys: string[]) => void;

  createVerse: (opts: { parentId: string; assumptions: { eventId: string; outcome: string }[]; relationshipType?: Verse["relationshipType"] }) => Verse;
  renameVerse: (id: string, name: string) => void;
  setCurrentVerse: (id: string) => void;
  deleteVerse: (id: string) => void;

  upsertForecast: (f: Forecast) => void;
  linkForecast: (verseId: string, target: TargetRef, forecastId: string) => void;

  toggleCompare: (id: string) => void;
  setCompare: (ids: string[]) => void;
  resetUniverse: () => void;
}

export const BASKET_LIMIT = 8;
const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_TARGET: TargetRef = { eventId: DEMO_TARGETS[0].id, outcome: "YES" };

const initialEvents = () => Object.fromEntries(ALL_DEMO_EVENTS.map((e) => [e.id, e]));

const withHistory = (s: UniverseState, next: BasketItem[]) => ({
  basket: next,
  basketPast: [...s.basketPast.slice(-30), s.basket],
  basketFuture: [],
});

export const useUniverse = create<UniverseState>()(
  persist(
    (set, get) => ({
      started: false,
      mode: "explore",
      engine: "auto",
      events: initialEvents(),
      verses: { [ORIGIN_ID]: makeOrigin() },
      forecasts: {},
      forecastIndex: {},
      currentVerseId: ORIGIN_ID,
      target: DEFAULT_TARGET,
      basket: [],
      basketPast: [],
      basketFuture: [],
      savedDraft: null,
      acknowledgedConflicts: [],
      compare: [],
      universeId: uid() + uid(),
      attestations: {},
      addAttestation: (verseId, a) => set((s) => ({ attestations: { ...s.attestations, [verseId]: [...(s.attestations[verseId] ?? []), a] } })),

      start: (target) => set((s) => ({ started: true, target: target ?? s.target })),
      setMode: (mode) => set({ mode }),
      setEngine: (engine) => set({ engine }),
      registerEvents: (evs) =>
        set((s) => {
          const events = { ...s.events };
          for (const e of evs) events[e.id] = e;
          return { events };
        }),
      setTarget: (target) => set({ target }),

      addToBasket: (eventId, outcome) => {
        const s = get();
        const ev = s.events[eventId];
        if (!ev) return "exists";
        if (s.basket.some((b) => b.eventId === eventId)) return "exists";
        const inherited = cumulativeAssumptions(s.verses[s.currentVerseId]).some((a) => a.eventId === eventId);
        if (inherited) return "inherited";
        if (s.basket.length >= BASKET_LIMIT) return "full";
        set(withHistory(s, [...s.basket, { uid: uid(), eventId, outcome: outcome ?? ev.possibleOutcomes[0] }]));
        return "added";
      },
      removeFromBasket: (id) => set((s) => withHistory(s, s.basket.filter((b) => b.uid !== id))),
      setOutcome: (id, outcome) => set((s) => withHistory(s, s.basket.map((b) => (b.uid === id ? { ...b, outcome } : b)))),
      reorderBasket: (items) => set((s) => withHistory(s, items)),
      clearBasket: () => set((s) => (s.basket.length ? withHistory(s, []) : {})),
      undoBasket: () =>
        set((s) => {
          if (!s.basketPast.length) return {};
          const prev = s.basketPast[s.basketPast.length - 1];
          return { basket: prev, basketPast: s.basketPast.slice(0, -1), basketFuture: [s.basket, ...s.basketFuture] };
        }),
      redoBasket: () =>
        set((s) => {
          if (!s.basketFuture.length) return {};
          const [next, ...rest] = s.basketFuture;
          return { basket: next, basketPast: [...s.basketPast, s.basket], basketFuture: rest };
        }),
      saveDraft: () => set((s) => ({ savedDraft: s.basket })),
      restoreDraft: () => set((s) => (s.savedDraft ? withHistory(s, s.savedDraft) : {})),
      acknowledgeConflicts: (keys) => set((s) => ({ acknowledgedConflicts: [...new Set([...s.acknowledgedConflicts, ...keys])] })),

      createVerse: ({ parentId, assumptions, relationshipType = "fork" }) => {
        const s = get();
        const parent = s.verses[parentId];
        const id = `v-${Date.now().toString(36)}-${uid().slice(0, 4)}`;
        const siblings = childrenOf(s.verses, parentId);
        const pos = placeChild(s.verses, parent, siblings.length);
        const sig = hash(id);
        const newAssumptions: Assumption[] = assumptions.map((a) => ({
          eventId: a.eventId,
          selectedOutcome: a.outcome,
          addedAtVerseId: id,
          sourceReference: s.events[a.eventId]?.externalMarketId ?? s.events[a.eventId]?.source ?? null,
        }));
        const v: Verse = {
          id,
          name: `Verse ${Object.keys(s.verses).length}`,
          parentId,
          depth: parent.depth + 1,
          createdAt: new Date().toISOString(),
          inheritedAssumptions: cumulativeAssumptions(parent),
          newAssumptions,
          relationshipType,
          visualMetadata: { x: pos.x, y: pos.y, hue: verseHue(sig), signature: sig, generation: parent.depth + 1 },
          named: false,
        };
        set({ verses: { ...s.verses, [id]: v } });
        return v;
      },
      renameVerse: (id, name) =>
        set((s) => ({ verses: { ...s.verses, [id]: { ...s.verses[id], name: name.trim().slice(0, 40) || s.verses[id].name, named: true } } })),
      setCurrentVerse: (id) => set((s) => (s.verses[id] ? { currentVerseId: id } : {})),
      deleteVerse: (id) =>
        set((s) => {
          if (id === ORIGIN_ID) return {};
          // remove the verse and its entire subtree
          const doomed = new Set<string>([id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const v of Object.values(s.verses)) {
              if (v.parentId && doomed.has(v.parentId) && !doomed.has(v.id)) {
                doomed.add(v.id);
                grew = true;
              }
            }
          }
          const verses = Object.fromEntries(Object.entries(s.verses).filter(([k]) => !doomed.has(k)));
          const forecastIndex = Object.fromEntries(Object.entries(s.forecastIndex).filter(([k]) => !doomed.has(k)));
          const cur = doomed.has(s.currentVerseId) ? (s.verses[id].parentId ?? ORIGIN_ID) : s.currentVerseId;
          return { verses, forecastIndex, currentVerseId: cur, compare: s.compare.filter((c) => !doomed.has(c)) };
        }),

      upsertForecast: (f) => set((s) => ({ forecasts: { ...s.forecasts, [f.id]: f } })),
      linkForecast: (verseId, target, forecastId) =>
        set((s) => ({
          forecastIndex: { ...s.forecastIndex, [verseId]: { ...(s.forecastIndex[verseId] ?? {}), [targetKey(target)]: forecastId } },
        })),

      toggleCompare: (id) =>
        set((s) => ({
          compare: s.compare.includes(id) ? s.compare.filter((c) => c !== id) : [...s.compare, id].slice(-2),
        })),
      setCompare: (compare) => set({ compare }),
      resetUniverse: () =>
        set({
          verses: { [ORIGIN_ID]: makeOrigin() },
          forecasts: {},
          forecastIndex: {},
          currentVerseId: ORIGIN_ID,
          basket: [],
          basketPast: [],
          basketFuture: [],
          compare: [],
          acknowledgedConflicts: [],
          events: initialEvents(),
        }),
    }),
    {
      name: "fork-universe-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        started: s.started,
        mode: s.mode,
        engine: s.engine,
        events: s.events,
        verses: s.verses,
        forecasts: s.forecasts,
        forecastIndex: s.forecastIndex,
        currentVerseId: s.currentVerseId,
        target: s.target,
        basket: s.basket,
        savedDraft: s.savedDraft,
        compare: s.compare,
        universeId: s.universeId,
        attestations: s.attestations,
        acknowledgedConflicts: s.acknowledgedConflicts,
      }),
      // demo fixtures are code, not data: always refresh them from source
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UniverseState>;
        return { ...current, ...p, events: { ...(p.events ?? {}), ...initialEvents() } };
      },
    },
  ),
);

/* ---------------- selectors ---------------- */

export const forecastFor = (s: Pick<UniverseState, "forecastIndex" | "forecasts">, verseId: string, t: TargetRef): Forecast | null => {
  const id = s.forecastIndex[verseId]?.[targetKey(t)];
  return id ? (s.forecasts[id] ?? null) : null;
};

/** Contradictions between the basket and the current Verse's cumulative assumptions. */
export function detectConflicts(s: Pick<UniverseState, "basket" | "verses" | "currentVerseId" | "events">): Conflict[] {
  const out: Conflict[] = [];
  const world = cumulativeAssumptions(s.verses[s.currentVerseId]);
  const all = [
    ...world.map((a) => ({ eventId: a.eventId, outcome: a.selectedOutcome, inherited: true })),
    ...s.basket.map((b) => ({ eventId: b.eventId, outcome: b.outcome, inherited: false })),
  ];
  const yesSet = new Set(all.filter((a) => a.outcome === "YES").map((a) => a.eventId));
  const seen = new Set<string>();
  for (const a of all) {
    if (a.outcome !== "YES") continue;
    const ex = s.events[a.eventId]?.metadata?.exclusiveWith ?? [];
    for (const other of ex) {
      if (!yesSet.has(other)) continue;
      const key = [a.eventId, other].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: "exclusive",
        message: `“${s.events[a.eventId]?.title}” and “${s.events[other]?.title}” are defined as mutually exclusive.`,
        eventIds: [a.eventId, other],
        blocking: false,
      });
    }
  }
  return out;
}

export const conflictKey = (c: Conflict) => `${c.kind}:${[...c.eventIds].sort().join("|")}`;
