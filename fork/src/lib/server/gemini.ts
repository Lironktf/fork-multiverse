import "server-only";
/**
 * Gemini Prediction Markets — public REST adapter.
 *
 * Endpoints (unauthenticated, documented at
 * https://developer.gemini.com/prediction-markets-spec):
 *   GET /v1/prediction-markets/events?status=&category=&search=&limit=&offset=
 *   GET /v1/prediction-markets/events/{eventTicker}
 *   GET /v1/prediction-markets/categories
 *
 * Rate limit (https://developer.gemini.com/rate-limit): 120 req/min, "recommend
 * that you do not exceed 1 request per second". We serialise upstream calls
 * through a 1 req/s gate and cache responses for 45s, so UI traffic never maps
 * 1:1 onto upstream traffic. Prices are never synthesised: missing quotes stay
 * null and are labelled by `dataQuality`.
 */
import type { ForkEvent } from "@/lib/domain/types";
import { normalizeEvent, type RawEvent } from "@/lib/domain/gemini-normalize";
import { searchEvents } from "@/lib/domain/event-search";

export { normalizeEvent, snapshotFromPrices } from "@/lib/domain/gemini-normalize";

const BASE = process.env.GEMINI_API_BASE ?? "https://api.gemini.com";
const TTL_MS = 90_000;
const MIN_GAP_MS = 1_000;

type Cached = { at: number; value: unknown };
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<unknown>>();
let gate: Promise<void> = Promise.resolve();
let lastCall = 0;

async function throttle() {
  const prev = gate;
  let release!: () => void;
  gate = new Promise((r) => (release = r));
  await prev;
  const wait = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  release();
}

export class GeminiUnavailable extends Error {}

async function getJson<T>(path: string): Promise<{ value: T; fetchedAt: number; cached: boolean }> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return { value: hit.value as T, fetchedAt: hit.at, cached: true };
  // stale-while-revalidate: serve a recent copy (its true fetch time is reported) and refresh behind it
  if (hit && Date.now() - hit.at < 600_000 && !inflight.has(path)) {
    cache.set(path, { ...hit, at: hit.at }); // keep original timestamp
    void refresh(path, hit).catch(() => {});
    return { value: hit.value as T, fetchedAt: hit.at, cached: true };
  }
  if (inflight.has(path)) {
    await inflight.get(path);
    const h = cache.get(path)!;
    return { value: h.value as T, fetchedAt: h.at, cached: true };
  }
  await refresh(path, hit);
  const h = cache.get(path) ?? hit!;
  return { value: h.value as T, fetchedAt: h.at, cached: false };
}

async function refresh(path: string, hit: Cached | undefined): Promise<void> {
  const p = (async () => {
    await throttle();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(BASE + path, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new GeminiUnavailable(`Gemini responded ${res.status}`);
      const json = await res.json();
      cache.set(path, { at: Date.now(), value: json });
      return json;
    } catch (e) {
      // serve stale data rather than nothing, but never older than 10 min
      if (hit && Date.now() - hit.at < 600_000) return hit.value;
      throw e instanceof GeminiUnavailable ? e : new GeminiUnavailable((e as Error).message);
    } finally {
      clearTimeout(timer);
      inflight.delete(path);
    }
  })();
  inflight.set(path, p);
  await p;
}

// Short-dated intraday contracts (e.g. "BTC price today at 2pm") are noise for
// scenario analysis; we hide events expiring within 36h by default.
const SHORT_HORIZON_MS = 36 * 3600_000;

const BROWSE_CATEGORIES = ["Economics", "Crypto", "Politics", "Tech", "Business", "Commodities", "Culture"];

function shape(raw: RawEvent[], fetchedAt: number) {
  const now = Date.now();
  return raw
    .filter((e) => e.category?.toLowerCase() !== "sports")
    .filter((e) => !e.expiryDate || new Date(e.expiryDate).getTime() - now > SHORT_HORIZON_MS)
    .map((e) => normalizeEvent(e, fetchedAt));
}

/** Collapse repeating series (one "BTC price on <date>" per date) to the highest-volume instance. */
function collapseSeries(events: ForkEvent[], keepOrder = false) {
  const bySeries = new Map<string, ForkEvent>();
  for (const e of events) {
    const key = e.title.replace(/\d+/g, "#");
    const prev = bySeries.get(key);
    if (!prev || (!keepOrder && (e.metadata.volumeUsd ?? 0) > (prev.metadata.volumeUsd ?? 0))) bySeries.set(key, e);
  }
  const out = [...bySeries.values()];
  // search results arrive ranked by relevance; browse is ranked by volume
  return keepOrder ? out : out.sort((a, b) => (b.metadata.volumeUsd ?? 0) - (a.metadata.volumeUsd ?? 0));
}

/** Every active non-sports event, one request per category (each is < 100 events today; limit 500 for headroom). */
async function catalog(cats: string[]) {
  const results = await Promise.allSettled(
    cats.map((c) => getJson<{ data: RawEvent[] }>(`/v1/prediction-markets/events?${new URLSearchParams({ status: "active", limit: "500", category: c })}`)),
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<{ value: { data: RawEvent[] }; fetchedAt: number; cached: boolean }> => r.status === "fulfilled");
  if (!ok.length) throw new GeminiUnavailable((results[0] as PromiseRejectedResult).reason?.message ?? "all category requests failed");
  return {
    batches: ok.map((r) => ({ raw: r.value.value.data, fetchedAt: r.value.fetchedAt })),
    oldest: Math.min(...ok.map((r) => r.value.fetchedAt)),
    cached: ok.every((r) => r.value.cached),
    partial: ok.length < cats.length,
  };
}

/**
 * Search is ranked full-text over the whole catalog (title, outcome labels, tags,
 * resolution rules — see domain/event-search.ts), merged with Gemini's own
 * `search` filter (title-only, but it also reaches categories we don't browse).
 * Browsing (no query) walks the non-sports categories, because an unfiltered
 * list is dominated by sports and intraday contracts.
 */
export async function searchGeminiEvents(opts: { q?: string; category?: string; limit?: number }) {
  const cats = opts.category ? [opts.category] : BROWSE_CATEGORIES;
  if (opts.q) {
    const params = new URLSearchParams({ status: "active", limit: String(opts.limit ?? 100), search: opts.q });
    if (opts.category) params.set("category", opts.category);
    const [cat, upstream] = await Promise.allSettled([catalog(cats), getJson<{ data: RawEvent[] }>(`/v1/prediction-markets/events?${params}`)]);
    if (cat.status === "rejected" && upstream.status === "rejected") throw cat.reason;
    const fetchedAtOf = new Map<string, number>();
    const pool = new Map<string, RawEvent>();
    const add = (e: RawEvent, at: number) => {
      if (pool.has(e.ticker)) return;
      pool.set(e.ticker, e);
      fetchedAtOf.set(e.ticker, at);
    };
    if (cat.status === "fulfilled") for (const b of cat.value.batches) for (const e of b.raw) add(e, b.fetchedAt);
    if (upstream.status === "fulfilled") for (const e of upstream.value.value.data) add(e, upstream.value.fetchedAt);
    const hits = searchEvents([...pool.values()], opts.q);
    const now = Date.now();
    const events = hits
      .filter((h) => h.event.category?.toLowerCase() !== "sports")
      .filter((h) => !h.event.expiryDate || new Date(h.event.expiryDate).getTime() - now > SHORT_HORIZON_MS)
      .map((h) => {
        const ev = normalizeEvent(h.event, fetchedAtOf.get(h.event.ticker) ?? now);
        ev.metadata = { ...ev.metadata, match: h.match, related: h.related };
        return ev;
      });
    const oldest = Math.min(...[...fetchedAtOf.values()]);
    return {
      events: collapseSeries(events, true),
      fetchedAt: new Date(Number.isFinite(oldest) ? oldest : now).toISOString(),
      cached: cat.status === "fulfilled" && cat.value.cached,
      total: events.length,
      searchedEvents: pool.size,
      partial: cat.status === "rejected" || (cat.status === "fulfilled" && cat.value.partial),
    };
  }
  const c = await catalog(cats);
  const events = c.batches.flatMap((b) => shape(b.raw, b.fetchedAt));
  return { events: collapseSeries(events), fetchedAt: new Date(c.oldest).toISOString(), cached: c.cached, total: events.length, partial: c.partial };
}

/** Warm the browse cache once at boot so the first visitor doesn't wait on the 1 req/s gate. */
let warmed = false;
export function prewarm() {
  if (warmed) return;
  warmed = true;
  searchGeminiEvents({}).catch(() => (warmed = false));
}

export async function getGeminiEvent(ticker: string) {
  const { value, fetchedAt } = await getJson<RawEvent>(`/v1/prediction-markets/events/${encodeURIComponent(ticker)}`);
  return normalizeEvent(value, fetchedAt);
}

export async function getGeminiCategories() {
  const { value } = await getJson<{ categories: string[] }>(`/v1/prediction-markets/categories?status=active`);
  return value.categories.filter((c) => !["Sports", "Live"].includes(c));
}
