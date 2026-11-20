import { createHash } from "node:crypto";
export type Outcome = "unresolved" | "yes" | "no" | "invalid";
export interface Binding {
  ticker: string;
  instrument: string;
  termsHash: string;
  closeTs: number;
  observationTs: number;
}
export interface Payload {
  binding: number[];
  termsHash: number[];
  outcome: Outcome;
  sourceTs: number;
}
export interface Contract {
  instrumentSymbol: string;
  status: string;
  expiryDate?: string;
  resolvedAt?: string;
  resolutionSide?: string;
  description?: unknown;
  termsAndConditionsUrl?: string;
  marketState?: string;
  prices?: Record<string, unknown>;
  priceHistory?: { timestamp: string; price: string }[];
}
export interface GeminiEvent {
  ticker: string;
  status: string;
  description?: unknown;
  contracts: Contract[];
}
const statuses = new Set([
  "approved",
  "active",
  "closed",
  "under_review",
  "settled",
  "invalid",
]);
function record(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("Expected object");
  return x as Record<string, unknown>;
}
export function parseEvent(raw: unknown): GeminiEvent {
  const e = record(raw);
  if (
    typeof e.ticker !== "string" ||
    typeof e.status !== "string" ||
    !statuses.has(e.status) ||
    !Array.isArray(e.contracts)
  )
    throw new Error("Invalid event schema/status");
  const contracts = e.contracts.map((raw) => {
    const c = record(raw);
    if (
      typeof c.instrumentSymbol !== "string" ||
      typeof c.status !== "string" ||
      !statuses.has(c.status)
    )
      throw new Error("Invalid contract schema/status");
    for (const k of [
      "expiryDate",
      "resolvedAt",
      "resolutionSide",
      "termsAndConditionsUrl",
      "marketState",
    ])
      if (c[k] != null && typeof c[k] !== "string")
        throw new Error(`Invalid ${k}`);
    return c as unknown as Contract;
  });
  return { ...e, contracts } as unknown as GeminiEvent;
}
export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function bindingHash(ticker: string, instrument: string): number[] {
  if (
    !ticker ||
    !instrument ||
    ticker.includes("\0") ||
    instrument.includes("\0")
  )
    throw new Error("Invalid binding");
  return [...Buffer.from(sha256(`${ticker}\0${instrument}`), "hex")];
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const x = value as Record<string, unknown>;
  return `{${Object.keys(x)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)
    .join(",")}}`;
}
export function exactContract(
  e: GeminiEvent,
  b: Pick<Binding, "ticker" | "instrument">,
): Contract {
  if (e.ticker !== b.ticker) throw new Error("Event ticker mismatch");
  const matches = e.contracts.filter(
    (c) => c.instrumentSymbol === b.instrument,
  );
  if (matches.length !== 1) throw new Error("Missing or ambiguous instrument");
  return matches[0]!;
}
// Include actual rules document bytes, not just its mutable URL. Callers retain these bytes.
export function termsHash(
  e: GeminiEvent,
  c: Contract,
  rules: Uint8Array,
): string {
  if (rules.length === 0 || !c.termsAndConditionsUrl || !c.expiryDate)
    throw new Error("Missing terms or expiry");
  return sha256(
    canonical({
      ticker: e.ticker,
      instrument: c.instrumentSymbol,
      eventDescription: e.description ?? null,
      contractDescription: c.description ?? null,
      termsUrl: c.termsAndConditionsUrl,
      expiryDate: c.expiryDate,
      rulesSha256: sha256(rules),
    }),
  );
}
export function timestamp(s: unknown): number {
  if (
    typeof s !== "string" ||
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s)
  )
    throw new Error("Missing/invalid timestamp");
  const n = Date.parse(s);
  if (!Number.isFinite(n)) throw new Error("Invalid timestamp");
  return Math.floor(n / 1000);
}
export function settlement(
  raw: unknown,
  b: Binding,
  rules: Uint8Array,
  observedAt: number,
): Payload | null {
  const e = parseEvent(raw),
    c = exactContract(e, b);
  if (
    !Number.isSafeInteger(observedAt) ||
    !Number.isSafeInteger(b.closeTs) ||
    !Number.isSafeInteger(b.observationTs) ||
    b.closeTs > b.observationTs
  )
    throw new Error("Invalid committed times");
  if (
    termsHash(e, c, rules) !== b.termsHash ||
    timestamp(c.expiryDate) !== b.observationTs
  )
    throw new Error("Immutable terms/expiry mismatch");
  let outcome: Outcome;
  // Source event invalidation applies to all its contracts; event under-review blocks final submission.
  if (c.status === "invalid" || e.status === "invalid") outcome = "invalid";
  else if (c.status === "settled" && e.status !== "under_review") {
    if (c.resolutionSide !== "yes" && c.resolutionSide !== "no")
      throw new Error("Settled contract has no binary resolutionSide");
    outcome = c.resolutionSide;
  } else if (
    ["closed", "under_review"].includes(c.status) ||
    ["closed", "under_review"].includes(e.status) ||
    c.marketState === "closed"
  )
    outcome = "unresolved";
  else return null;
  // Invalid without resolvedAt cannot be terminally attested; freeze pending explicit source publication.
  if (outcome === "invalid" && !c.resolvedAt) outcome = "unresolved";
  const sourceTs =
    outcome === "unresolved" ? observedAt : timestamp(c.resolvedAt);
  if (
    sourceTs > observedAt + 30 ||
    (outcome !== "unresolved" &&
      outcome !== "invalid" &&
      sourceTs < b.observationTs)
  )
    throw new Error("Invalid publication time");
  return {
    binding: bindingHash(b.ticker, b.instrument),
    termsHash: [...Buffer.from(b.termsHash, "hex")],
    outcome,
    sourceTs,
  };
}
export async function fetchEvent(
  ticker: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const r = await fetcher(
    `https://api.gemini.com/v1/prediction-markets/events/${encodeURIComponent(ticker)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  return r.json();
}
export async function fetchRules(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "assets.gemini.com")
    throw new Error("Rules must be served by assets.gemini.com");
  const r = await fetcher(u, {
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!r.ok) throw new Error(`Rules HTTP ${r.status}`);
  const data = new Uint8Array(await r.arrayBuffer());
  if (data.length > 10_000_000) throw new Error("Oversized rules");
  return data;
}
export interface RelayTransport {
  current(): Promise<{ outcome: Outcome; sourceTs: number }>;
  submit(p: Payload): Promise<string>;
}
export async function relay(
  payload: Payload,
  transport: RelayTransport,
  log: (x: unknown) => void = console.log,
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await transport.current();
    if (current.outcome !== "unresolved") {
      if (
        current.outcome !== payload.outcome ||
        current.sourceTs !== payload.sourceTs
      )
        throw new Error("Conflicting on-chain final report");
      log({ kind: "already-final", payload });
      return null;
    }
    try {
      const signature = await transport.submit(payload);
      log({ kind: "reported", payload, signature });
      return signature;
    } catch (error) {
      log({ kind: "retry", attempt, error: String(error) });
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable");
}
