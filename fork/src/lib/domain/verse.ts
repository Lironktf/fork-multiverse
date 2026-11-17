import type { Assumption, Verse } from "./types";

export const ORIGIN_ID = "origin";

/** Cumulative assumptions defining a Verse (inherited + new), parent-first order. */
export const cumulativeAssumptions = (v: Verse): Assumption[] => [...v.inheritedAssumptions, ...v.newAssumptions];

export function ancestry(verses: Record<string, Verse>, id: string): Verse[] {
  const out: Verse[] = [];
  let cur: Verse | undefined = verses[id];
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? verses[cur.parentId] : undefined;
  }
  return out;
}

export function childrenOf(verses: Record<string, Verse>, id: string): Verse[] {
  return Object.values(verses)
    .filter((v) => v.parentId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function makeOrigin(): Verse {
  return {
    id: ORIGIN_ID,
    name: "Origin",
    parentId: null,
    depth: 0,
    createdAt: new Date().toISOString(),
    inheritedAssumptions: [],
    newAssumptions: [],
    relationshipType: "fork",
    visualMetadata: { x: 0, y: 0, hue: 190, signature: 0, generation: 0 },
    named: true,
  };
}

/** FNV-1a — stable small hash for deterministic visual signatures. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SPACING = 1150;
const MIN_GAP = 820;

/**
 * Deterministic placement of a new child Verse. Children of Origin fan out by
 * the golden angle; deeper children continue their parent's heading with
 * alternating offsets. Placement is stored on the Verse, so identity and
 * location are stable forever after creation.
 */
export function placeChild(verses: Record<string, Verse>, parent: Verse, index: number) {
  const all = Object.values(verses);
  const grand = parent.parentId ? verses[parent.parentId] : null;
  const heading = grand
    ? Math.atan2(parent.visualMetadata.y - grand.visualMetadata.y, parent.visualMetadata.x - grand.visualMetadata.x)
    : -Math.PI / 9;
  const offsets = [0, 0.62, -0.62, 1.15, -1.15, 1.6, -1.6, 2.1, -2.1];
  const candidates: number[] = [];
  if (!grand) {
    for (let i = 0; i < 12; i++) candidates.push(heading + (index + i) * 2.39996);
  } else {
    for (let i = 0; i < offsets.length; i++) candidates.push(heading + offsets[(index + i) % offsets.length]);
  }
  for (const dist of [SPACING, SPACING * 1.35, SPACING * 1.7]) {
    for (const a of candidates) {
      const x = parent.visualMetadata.x + Math.cos(a) * dist;
      const y = parent.visualMetadata.y + Math.sin(a) * dist;
      if (all.every((v) => Math.hypot(v.visualMetadata.x - x, v.visualMetadata.y - y) > MIN_GAP)) return { x, y };
    }
  }
  const a = candidates[0];
  return { x: parent.visualMetadata.x + Math.cos(a) * SPACING * 2, y: parent.visualMetadata.y + Math.sin(a) * SPACING * 2 };
}

/** Restrained hue band: cool spectrum only (cyan → indigo), so Verses differ subtly. */
export const verseHue = (seed: number) => 165 + (seed % 80);

const NAME_BANK: Record<string, string[]> = {
  "demo-fed-cuts-100:YES": ["Easy Money", "Liquidity Tide", "Dovish Turn"],
  "demo-fed-cuts-100:NO": ["Higher for Longer", "Tight Grip"],
  "demo-crypto-etf:YES": ["ETF Euphoria", "Wall Street Gate"],
  "demo-us-recession:YES": ["Red Winter", "Recession Shock"],
  "demo-us-recession:NO": ["Soft Landing", "Clear Skies"],
  "demo-soft-landing:YES": ["Soft Landing", "Goldilocks"],
  "demo-exchange-collapse:YES": ["Contagion", "Counterparty Winter"],
  "demo-exchange-collapse:NO": ["Steady Rails"],
  "demo-market-structure-law:YES": ["Rulebook Written", "Regulated Dawn"],
  "demo-sbr-purchases:YES": ["Sovereign Bid", "Reserve Era"],
  "demo-inflation-4:YES": ["Fever Return", "Second Wave"],
  "demo-oil-120:YES": ["Oil Shock", "Black Tide"],
  "demo-taiwan-blockade:YES": ["Fragmented World", "Strait Closed"],
  "demo-ai-capex-cut:YES": ["Compute Winter", "AI Hangover"],
  "demo-ai-incident:YES": ["Wake-Up Call", "Regulation Shock"],
  "demo-dollar-weak:YES": ["Weak Dollar", "Greenback Fade"],
  "demo-stablecoin-500b:YES": ["Dollar on Chain", "Stable Flood"],
};
const GENERIC = ["Divergence", "New Meridian", "Quiet Shift", "Parallax", "Undertow", "Long Arc", "Second Light", "Threshold"];

export function suggestNames(newAssumptions: { eventId: string; selectedOutcome: string }[], titles: Map<string, string>, seed: number): string[] {
  const out: string[] = [];
  for (const a of newAssumptions) {
    for (const n of NAME_BANK[`${a.eventId}:${a.selectedOutcome}`] ?? []) if (!out.includes(n)) out.push(n);
  }
  for (const a of newAssumptions) {
    const t = titles.get(a.eventId);
    if (!t) continue;
    const word = t
      .replace(/[^A-Za-z ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !/^(will|with|than|this|that|from|into|over|above|below|during|enters|major)$/i.test(w))[0];
    if (word) {
      const cap = word[0].toUpperCase() + word.slice(1).toLowerCase();
      const n = a.selectedOutcome === "NO" ? `No ${cap}` : `${cap} World`;
      if (!out.includes(n)) out.push(n);
    }
  }
  for (let i = 0; out.length < 4 && i < GENERIC.length; i++) {
    const n = GENERIC[(seed + i) % GENERIC.length];
    if (!out.includes(n)) out.push(n);
  }
  return out.slice(0, 4);
}
