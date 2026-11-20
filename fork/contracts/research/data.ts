import {
  fetchEvent,
  parseEvent,
  exactContract,
  timestamp,
  type Binding,
} from "../oracle/gemini.js";
import type { Observation } from "./model.js";
// priceHistory provides timestamp/price only. Historical spread/volume is never fabricated.
export async function observations(
  binding: Binding,
  now: number,
  fetcher: typeof fetch = fetch,
) {
  const e = parseEvent(await fetchEvent(binding.ticker, fetcher)),
    c = exactContract(e, binding);
  const history: Observation[] = [];
  if (Array.isArray(c.priceHistory))
    for (const h of c.priceHistory) {
      try {
        const p = Number(h.price),
          ts = timestamp(h.timestamp);
        if (
          typeof h.price === "string" &&
          Number.isFinite(p) &&
          p >= 0 &&
          p <= 1
        )
          history.push({ ts, probability: p });
      } catch {}
    }
  const bid =
      typeof c.prices?.bestBid === "string" ? Number(c.prices.bestBid) : NaN,
    ask =
      typeof c.prices?.bestAsk === "string" ? Number(c.prices.bestAsk) : NaN;
  if (
    Number.isFinite(bid) &&
    Number.isFinite(ask) &&
    bid >= 0 &&
    ask <= 1 &&
    bid <= ask
  )
    history.push({ ts: now, probability: (bid + ask) / 2, bid, ask });
  // Absence of current two-sided data is a stop condition, even if history is present.
  return {
    history,
    tradeable:
      e.status === "active" &&
      c.status === "active" &&
      c.marketState !== "closed" &&
      Number.isFinite(bid) &&
      Number.isFinite(ask) &&
      bid <= ask &&
      bid >= 0 &&
      ask <= 1,
  };
}
