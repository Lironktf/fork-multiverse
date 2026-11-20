/**
 * Auto-buy rules ("trigger orders"): when a Gemini observation crosses a threshold,
 * buy YES/NO shares of a FORK conditional market once. Pure logic only (unit-tested);
 * signing and polling live in app/service.ts.
 *
 * Observations (primary sources, Gemini public REST, verified 2026-11-20):
 *   - spot:     GET /v1/pubticker/{symbol} → `last` (e.g. solusd last "72.17000")
 *   - contract: GET /v1/prediction-markets/events/{ticker} → contract.prices
 *               { bestBid, bestAsk, lastTradePrice } as decimal strings in [0, 1]
 * The contract observation is the bid/ask mid when both sides quote, else the last
 * trade, matching how the rest of FORK derives an implied probability. If neither
 * exists the rule does not fire: no observation is ever invented.
 */

export type Comparator = ">=" | "<=";

export type Trigger =
  | { kind: "spot"; symbol: string; op: Comparator; value: number }
  | {
      kind: "contract";
      ticker: string;
      instrument: string;
      op: Comparator;
      value: number;
    };

export interface AutoBuyAction {
  /** which side of the conditional market's B to buy */
  side: "yes" | "no";
  /** whole shares (1 share pays 1 mock USDC if it wins) */
  shares: number;
  /** maximum total cost in mock USDC; enforced on-chain as the trade limit */
  maxCost: number;
}

export type RuleStatus = "armed" | "fired" | "failed" | "cancelled" | "expired";

export interface Observation {
  value: number;
  source: string;
  at: string;
}

export interface AutoBuyRule {
  id: string;
  market: string;
  trigger: Trigger;
  action: AutoBuyAction;
  status: RuleStatus;
  createdAt: string;
  /** auto-trader account that holds the position (not the user's wallet) */
  executor: string;
  /** human labels from the app, e.g. "BTC above $62k? · YES" (display only) */
  labels?: { condition: string; target: string; world?: string };
  last?: Observation;
  firedAt?: string;
  fired?: Observation;
  signature?: string;
  error?: string;
}

const SYMBOL = /^[a-z0-9]{3,16}$/;
const TICKER = /^[A-Za-z0-9._-]{1,64}$/;
const INSTRUMENT = /^[A-Za-z0-9._-]{1,96}$/;
/** ASSUMPTION: caps keep a demo rule from draining the mock LP; overturned by a real risk model. */
export const MAX_SHARES = 1000;
export const MAX_COST = 1000;

export function parseRuleInput(input: unknown): {
  market: string;
  trigger: Trigger;
  action: AutoBuyAction;
  labels?: { condition: string; target: string; world?: string };
} {
  const v = (input ?? {}) as Record<string, unknown>;
  const t = (v.trigger ?? {}) as Record<string, unknown>;
  const a = (v.action ?? {}) as Record<string, unknown>;
  if (typeof v.market !== "string" || !v.market) throw new Error("Choose a market.");
  const op = t.op;
  if (op !== ">=" && op !== "<=") throw new Error("Comparator must be >= or <=.");
  const value = Number(t.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Threshold must be a positive number.");
  let trigger: Trigger;
  if (t.kind === "spot") {
    const symbol = String(t.symbol ?? "").toLowerCase();
    if (!SYMBOL.test(symbol)) throw new Error("Invalid spot symbol.");
    trigger = { kind: "spot", symbol, op, value };
  } else if (t.kind === "contract") {
    if (value >= 1) throw new Error("A contract threshold is a probability between 0 and 1.");
    const ticker = String(t.ticker ?? "");
    const instrument = String(t.instrument ?? "");
    if (!TICKER.test(ticker) || !INSTRUMENT.test(instrument)) throw new Error("Invalid Gemini contract.");
    trigger = { kind: "contract", ticker, instrument, op, value };
  } else throw new Error("Trigger must be spot or contract.");
  const side = a.side;
  if (side !== "yes" && side !== "no") throw new Error("Side must be yes or no.");
  const shares = Number(a.shares);
  const maxCost = Number(a.maxCost);
  if (!Number.isInteger(shares) || shares < 1 || shares > MAX_SHARES)
    throw new Error(`Shares must be a whole number from 1 to ${MAX_SHARES}.`);
  if (!Number.isFinite(maxCost) || maxCost <= 0 || maxCost > MAX_COST)
    throw new Error(`Max cost must be above 0 and at most ${MAX_COST}.`);
  if (maxCost > shares) throw new Error("Max cost above the share count can never be worth paying (each share pays at most 1).");
  const l = v.labels as Record<string, unknown> | undefined;
  const labels =
    l && typeof l.condition === "string" && typeof l.target === "string"
      ? {
          condition: l.condition.slice(0, 160),
          target: l.target.slice(0, 160),
          ...(typeof l.world === "string" ? { world: l.world.slice(0, 80) } : {}),
        }
      : undefined;
  return { market: v.market, trigger, action: { side, shares, maxCost }, ...(labels ? { labels } : {}) };
}

const num = (x: unknown) => {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/** Spot observation from /v1/pubticker. */
export function spotObservation(ticker: unknown, at = new Date()): Observation | null {
  const last = num((ticker as Record<string, unknown> | null)?.last);
  return last == null || last <= 0 ? null : { value: last, source: "gemini pubticker last", at: at.toISOString() };
}

/** Contract observation from an event payload: mid of bid/ask, else last trade, else nothing. */
export function contractObservation(event: unknown, instrument: string, at = new Date()): Observation | null {
  const contracts = ((event as { contracts?: unknown[] } | null)?.contracts ?? []) as {
    instrumentSymbol?: string;
    prices?: Record<string, unknown>;
  }[];
  const c = contracts.find((x) => x.instrumentSymbol === instrument);
  if (!c?.prices) return null;
  const bid = num(c.prices.bestBid);
  const ask = num(c.prices.bestAsk);
  if (bid != null && ask != null && ask >= bid)
    return { value: (bid + ask) / 2, source: `gemini bid/ask mid (${bid}/${ask})`, at: at.toISOString() };
  const last = num(c.prices.lastTradePrice);
  return last == null ? null : { value: last, source: "gemini last trade", at: at.toISOString() };
}

export function crosses(trigger: Trigger, o: Observation | null): boolean {
  if (!o) return false;
  return trigger.op === ">=" ? o.value >= trigger.value : o.value <= trigger.value;
}

export function describeTrigger(t: Trigger): string {
  const op = t.op === ">=" ? "≥" : "≤";
  return t.kind === "spot"
    ? `${t.symbol.toUpperCase()} spot ${op} $${t.value.toLocaleString()}`
    : `${t.instrument} ${op} ${(t.value * 100).toFixed(0)}%`;
}

/**
 * Map an app outcome on a Gemini event to the exact contract and side.
 * Binary events: outcomes YES/NO on the single contract. Categorical: each outcome
 * label is its own contract, held on its YES side. (Same mapping as the app's
 * gemini-normalize.ts.)
 */
export function resolveOutcome(
  raw: unknown,
  outcome: string,
): { instrument: string; yes: boolean } {
  const e = (raw ?? {}) as {
    type?: string;
    contracts?: { instrumentSymbol?: string; label?: string; status?: string }[];
  };
  const live = (e.contracts ?? []).filter(
    (c) => c.status !== "settled" && c.status !== "invalid" && c.instrumentSymbol,
  );
  if (!live.length) throw new Error("This Gemini event has no open contract.");
  // binary events use YES/NO; single-contract categorical events use the contract label
  // (gemini-normalize.ts keeps actual outcome labels for every non-binary event)
  if (e.type === "binary" || (live.length === 1 && (outcome === "YES" || outcome === "NO"))) {
    if (outcome !== "YES" && outcome !== "NO") throw new Error(`Unknown outcome ${outcome}.`);
    return { instrument: live[0]!.instrumentSymbol!, yes: outcome === "YES" };
  }
  const c = live.find((x) => x.label === outcome);
  if (!c) throw new Error(`Outcome “${outcome}” is not an open contract on this event.`);
  return { instrument: c.instrumentSymbol!, yes: true };
}

/** ASSUMPTION: stop trading 1h before the earliest observation, so no trade can see the result. */
export const CLOSE_BUFFER_S = 3600;
