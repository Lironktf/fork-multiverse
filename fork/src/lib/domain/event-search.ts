/**
 * Full-text, ranked search over Gemini prediction-market events (pure — unit-tested).
 *
 * Why not just Gemini's `search` parameter: measured 2026-11-19, it matches event
 * titles only — `search=iran` returns 0 while the catalog holds markets whose
 * outcomes and rules concern Iran's region (Strait of Hormuz traffic, Israeli PM,
 * world leaders leaving office). We therefore search every field a user might mean:
 * title, outcome labels, tags/subcategory, event rules and per-contract rules.
 *
 * Related-topic expansion (RELATED) is an ASSUMPTION — a small hand-written map of
 * geopolitical/macro neighbours, used only when a term has few direct hits and
 * always labelled "related" in the UI. Overturned if users find the expansions
 * misleading (they can see why each row matched).
 */
import type { RawEvent } from "./gemini-normalize";

export const RELATED: Record<string, string[]> = {
  iran: ["hormuz", "israel", "netanyahu", "oil", "crude", "middle east", "tehran", "khamenei", "opec"],
  israel: ["netanyahu", "gaza", "iran", "middle east"],
  russia: ["ukraine", "putin", "kremlin"],
  ukraine: ["russia", "zelensky", "ceasefire"],
  china: ["taiwan", "xi jinping", "tariff", "beijing"],
  taiwan: ["china", "tsmc"],
  oil: ["crude", "wti", "brent", "opec", "hormuz", "gasoline"],
  war: ["ceasefire", "military", "strike", "invasion"],
  fed: ["fomc", "powell", "interest rate", "rate cut"],
  rates: ["fed", "fomc", "interest rate"],
  inflation: ["cpi", "pce"],
  recession: ["gdp", "unemployment"],
  election: ["president", "prime minister", "vote", "win"],
  trump: ["president", "administration", "cabinet"],
  ai: ["openai", "anthropic", "gemini", "gpt", "model", "llm"],
  bitcoin: ["btc"],
  btc: ["bitcoin"],
  ethereum: ["eth"],
  eth: ["ethereum"],
  solana: ["sol"],
};

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(text).join(" ");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(text).join(" ");
  return "";
};

interface Fields {
  title: string;
  outcomes: { label: string; folded: string }[];
  tags: string;
  rules: string;
}

function fieldsOf(e: RawEvent): Fields {
  const contracts = e.contracts ?? [];
  return {
    title: fold(e.title),
    outcomes: contracts.map((c) => ({ label: c.label, folded: fold(c.label) })),
    tags: fold(`${text(e.tags)} ${text(e.subcategory)} ${e.category ?? ""} ${e.ticker}`),
    rules: fold(`${e.description ?? ""} ${contracts.map((c) => text(c.description)).join(" ")}`),
  };
}

/** Whole-word-ish containment: "eth" should not match "method", "ai" not "said". */
function has(hay: string, term: string) {
  if (term.length > 4) return hay.includes(term);
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(hay);
}

export interface SearchHit {
  event: RawEvent;
  score: number;
  /** human-readable reason, shown under the row */
  match: string;
  related: boolean;
}

function scoreTerm(f: Fields, term: string): { score: number; why: string } | null {
  if (has(f.title, term)) return { score: 10, why: "title" };
  const o = f.outcomes.find((x) => has(x.folded, term));
  if (o) return { score: 7, why: `outcome “${o.label}”` };
  if (has(f.tags, term)) return { score: 4, why: "topic" };
  if (has(f.rules, term)) return { score: 2, why: "resolution rules" };
  return null;
}

export function searchEvents(events: RawEvent[], q: string, opts: { minDirect?: number } = {}): SearchHit[] {
  const terms = fold(q)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (!terms.length) return [];
  const indexed = events.map((e) => ({ e, f: fieldsOf(e) }));

  // direct: every term must match some field
  const direct: SearchHit[] = [];
  for (const { e, f } of indexed) {
    let score = 0;
    const whys: string[] = [];
    let all = true;
    for (const t of terms) {
      const s = scoreTerm(f, t);
      if (!s) {
        all = false;
        break;
      }
      score += s.score;
      whys.push(s.why);
    }
    // the whole phrase in the title beats scattered words
    if (all && terms.length > 1 && f.title.includes(terms.join(" "))) score += 5;
    if (all) direct.push({ event: e, score, match: whys.includes("title") ? "title" : `matched ${[...new Set(whys)].join(", ")}`, related: false });
  }

  const minDirect = opts.minDirect ?? 4;
  const related: SearchHit[] = [];
  if (direct.length < minDirect) {
    const seen = new Set(direct.map((h) => h.event.ticker));
    for (const t of terms) {
      for (const r of RELATED[t] ?? []) {
        for (const { e, f } of indexed) {
          if (seen.has(e.ticker)) continue;
          const s = scoreTerm(f, r);
          // related matches must be visible to the user (title, outcome or topic), not buried in rules text
          if (!s || s.why === "resolution rules") continue;
          seen.add(e.ticker);
          related.push({ event: e, score: s.score / 4, match: `related · “${r}” in ${s.why}`, related: true });
        }
      }
    }
  }
  const vol = (e: RawEvent) => Number(e.volume ?? 0) || 0;
  return [...direct, ...related].sort((a, b) => b.score - a.score || vol(b.event) - vol(a.event));
}
