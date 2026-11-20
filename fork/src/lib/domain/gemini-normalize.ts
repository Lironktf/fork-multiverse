/**
 * Pure normalisation of Gemini Prediction Markets payloads into FORK's event
 * schema (no I/O — unit-tested). Field names follow
 * https://developer.gemini.com/prediction-markets-spec
 */
import type { EventCategory, ForkEvent, MarketSnapshot } from "./types";

/* ---------- raw shapes (only fields we read) ---------- */
export interface RawPrices {
  buy?: { yes?: string | null; no?: string | null };
  sell?: { yes?: string | null; no?: string | null };
  bestBid?: string | null;
  bestAsk?: string | null;
  lastTradePrice?: string | null;
}
export interface RawContract {
  id: string;
  label: string;
  ticker?: string;
  instrumentSymbol?: string;
  status?: string;
  prices?: RawPrices;
  expiryDate?: string | null;
  description?: unknown;
  termsAndConditionsUrl?: string;
}
export interface RawEvent {
  id: string;
  title: string;
  slug?: string;
  description?: string | null;
  type: "binary" | "categorical";
  category?: string;
  series?: string | null;
  subcategory?: unknown;
  ticker: string;
  status: string;
  expiryDate?: string | null;
  liquidity?: string | null;
  volume?: string | null;
  tags?: unknown;
  contracts?: RawContract[];
}

const num = (s: string | null | undefined) => {
  if (s === null || s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const CATEGORY_MAP: Record<string, EventCategory> = {
  crypto: "crypto",
  economics: "macro",
  politics: "politics",
  tech: "tech",
  business: "business",
  commodities: "energy",
  culture: "culture",
  weather: "other",
  sports: "other",
  live: "other",
};

/** Contract descriptions are rich-text JSON; flatten to plain text. */
function richText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { value?: string; content?: unknown[] };
  return (n.value ?? "") + (Array.isArray(n.content) ? n.content.map(richText).join("") : "");
}

export function snapshotFromPrices(eventId: string, outcome: string, p: RawPrices | undefined, at: string, volumeUsd: number | null, liquidityUsd: number | null): MarketSnapshot {
  const bid = num(p?.bestBid);
  const ask = num(p?.bestAsk);
  const last = num(p?.lastTradePrice);
  let implied: number | null = null;
  let dataQuality: MarketSnapshot["dataQuality"] = "no-quote";
  if (bid !== null && ask !== null) {
    implied = (bid + ask) / 2;
    dataQuality = "two-sided";
  } else if (last !== null) {
    implied = last;
    dataQuality = "last-trade-only";
  } else if (bid !== null || ask !== null) {
    dataQuality = "one-sided"; // a single side is a bound, not an estimate
  }
  return {
    eventId,
    source: "gemini",
    timestamp: at,
    outcome,
    bid,
    ask,
    lastPrice: last,
    impliedProbabilityEstimate: implied,
    liquidityMetadata: { volumeUsd, liquidityUsd, spread: bid !== null && ask !== null ? ask - bid : null },
    dataQuality,
  };
}

/**
 * Normalise a Gemini event.
 *  - binary  → outcomes YES / NO from the single contract (NO = 1 − YES quotes are NOT derived; we only report YES-side quotes and label NO from the same book)
 *  - categorical → outcomes are contract labels; each contract is its own YES/NO market, so the snapshot per outcome is that contract's YES side.
 */
export function normalizeEvent(raw: RawEvent, fetchedAt: number): ForkEvent {
  const at = new Date(fetchedAt).toISOString();
  const id = `gemini:${raw.ticker}`;
  const volumeUsd = num(raw.volume ?? null);
  const liquidityUsd = num(raw.liquidity ?? null);
  const contracts = (Array.isArray(raw.contracts) ? raw.contracts : [])
    .filter((c) => c && typeof c.label === "string" && c.label.trim() && c.status !== "settled" && c.status !== "invalid");
  const first = contracts[0];
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const resolution = first ? richText(first.description).trim() : "";
  const base = {
    id,
    title: raw.title,
    description: (raw.description ?? "").toString(),
    category: CATEGORY_MAP[(raw.category ?? "").toLowerCase()] ?? "other",
    source: "gemini" as const,
    externalMarketId: raw.ticker,
    resolutionCriteria: resolution,
    resolutionDate: raw.expiryDate ?? null,
    fetchedAt: at,
  };
  if (raw.type === "binary") {
    const yes = snapshotFromPrices(id, "YES", first?.prices, at, volumeUsd, liquidityUsd);
    return {
      ...base,
      eventType: "binary",
      possibleOutcomes: ["YES", "NO"],
      metadata: {
        url: `https://www.gemini.com/predictions/${raw.ticker}`,
        ticker: raw.ticker,
        sourceCategory: raw.category,
        contractIds: first ? { YES: first.id } : undefined,
        volumeUsd,
        series: raw.series ?? undefined,
        tags,
      },
      snapshots: [yes],
    };
  }
  return {
    ...base,
    eventType: "categorical",
    possibleOutcomes: contracts.map((c) => c.label),
    metadata: {
      url: `https://www.gemini.com/predictions/${raw.ticker}`,
      ticker: raw.ticker,
      sourceCategory: raw.category,
      contractIds: Object.fromEntries(contracts.map((c) => [c.label, c.id])),
      volumeUsd,
      series: raw.series ?? undefined,
      tags,
    },
    snapshots: contracts.map((c) => snapshotFromPrices(id, c.label, c.prices, at, volumeUsd, liquidityUsd)),
  };
}

