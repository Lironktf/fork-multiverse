/**
 * FORK domain model.
 *
 * Every probability carries a `kind` so the UI can never confuse an observed
 * market price with a model estimate or an illustrative demo value:
 *   MARKET — derived from an observed order book / trade on a real venue
 *   MODEL  — produced by an LLM analyst run in this app
 *   DEMO   — hand-authored, illustrative fixture data
 */
import { z } from "zod";

export const ProviderMode = z.enum(["mixed", "claude", "codex", "grok"]);
export type ProviderMode = z.infer<typeof ProviderMode>;

export const ProbabilityKind = z.enum(["MARKET", "MODEL", "DEMO"]);
export type ProbabilityKind = z.infer<typeof ProbabilityKind>;

export const EventSource = z.enum(["gemini", "demo", "custom", "model"]);
export type EventSource = z.infer<typeof EventSource>;

export const EventCategory = z.enum([
  "crypto",
  "macro",
  "politics",
  "tech",
  "ai",
  "geopolitics",
  "energy",
  "markets",
  "business",
  "culture",
  "other",
]);
export type EventCategory = z.infer<typeof EventCategory>;

export const MarketSnapshot = z.object({
  eventId: z.string(),
  source: z.literal("gemini"),
  timestamp: z.string(), // when we fetched it (ISO)
  outcome: z.string(),
  bid: z.number().nullable(),
  ask: z.number().nullable(),
  lastPrice: z.number().nullable(),
  /** mid of bid/ask when both exist, otherwise last trade, otherwise null */
  impliedProbabilityEstimate: z.number().nullable(),
  liquidityMetadata: z.object({
    volumeUsd: z.number().nullable(),
    liquidityUsd: z.number().nullable(),
    spread: z.number().nullable(),
  }),
  dataQuality: z.enum(["two-sided", "last-trade-only", "one-sided", "no-quote"]),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshot>;

export const ForkEvent = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  category: EventCategory,
  source: EventSource,
  externalMarketId: z.string().nullable().default(null),
  eventType: z.enum(["binary", "categorical"]),
  possibleOutcomes: z.array(z.string()).min(2),
  resolutionCriteria: z.string().default(""),
  resolutionDate: z.string().nullable().default(null),
  /** Free-form source metadata (urls, tickers, illustrative baselines). */
  metadata: z
    .object({
      url: z.string().optional(),
      ticker: z.string().optional(),
      /** For categorical gemini events: outcome -> contract id */
      contractIds: z.record(z.string(), z.string()).optional(),
      /** Illustrative baseline P(target outcome) for demo events */
      demoBaseline: z.number().optional(),
      /** Ids of events whose YES is mutually exclusive with this event's YES */
      exclusiveWith: z.array(z.string()).optional(),
      /** Which model proposed this event (source=model) */
      proposedBy: z.string().optional(),
      volumeUsd: z.number().nullable().optional(),
      tags: z.array(z.string()).optional(),
      /** search only: why this event matched the query (e.g. outcome “Pedro Sánchez”) */
      match: z.string().optional(),
      /** search only: matched through a related topic, not the query itself */
      related: z.boolean().optional(),
    })
    .default({}),
  /** Latest snapshots per outcome (only for live market events) */
  snapshots: z.array(MarketSnapshot).optional(),
  fetchedAt: z.string().optional(),
});
export type ForkEvent = z.infer<typeof ForkEvent>;

/** A target is an (event, outcome) pair whose probability we forecast. */
export const TargetRef = z.object({ eventId: z.string(), outcome: z.string() });
export type TargetRef = z.infer<typeof TargetRef>;
export const targetKey = (t: TargetRef) => `${t.eventId}::${t.outcome}`;

export const Assumption = z.object({
  eventId: z.string(),
  selectedOutcome: z.string(),
  addedAtVerseId: z.string(),
  sourceReference: z.string().nullable().default(null),
});
export type Assumption = z.infer<typeof Assumption>;

export const VerseRelationshipType = z.enum(["fork", "disagreement-split"]);

export const Verse = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  depth: z.number().int(),
  createdAt: z.string(),
  inheritedAssumptions: z.array(Assumption),
  newAssumptions: z.array(Assumption),
  relationshipType: VerseRelationshipType.default("fork"),
  visualMetadata: z.object({
    x: z.number(),
    y: z.number(),
    hue: z.number(), // restrained accent hue, degrees
    signature: z.number(), // seed for node signature geometry
    generation: z.number().int(),
  }),
  named: z.boolean().default(false),
});
export type Verse = z.infer<typeof Verse>;

export const ModelRole = z.enum(["causal", "empirical", "market", "skeptic"]);
export type ModelRole = z.infer<typeof ModelRole>;

export const MODEL_ROLES: Record<ModelRole, { label: string; short: string; brief: string }> = {
  causal: {
    label: "Macro / Causal",
    short: "A",
    brief: "Plausible economic, political and technological mechanisms linking assumptions to the target.",
  },
  empirical: {
    label: "Historical / Empirical",
    short: "B",
    brief: "Historical analogues and base rates — and where those analogies break down.",
  },
  market: {
    label: "Market",
    short: "C",
    brief: "Observed pricing and financial relationships, kept separate from prediction.",
  },
  skeptic: {
    label: "Skeptic",
    short: "D",
    brief: "Hidden assumptions, alternative mechanisms, and reasons the forecast may mislead.",
  },
};

export const SourceRef = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string().optional(),
  note: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** Structured output every analyst must return (validated server-side). */
export const AnalystOutput = z.object({
  targetEventId: z.string(),
  scenario: z.array(z.object({ eventId: z.string(), resolution: z.string() })),
  probability: z.number().min(0.01).max(0.99),
  headline: z.string().max(240),
  keyAssumptions: z.array(z.string()).max(6),
  reasoning: z.string(),
  counterarguments: z.array(z.string()).max(5),
  evidence: z.array(z.object({ claim: z.string(), sourceUrl: z.string().nullable() })).max(6),
  missingInformation: z.array(z.string()).max(5),
  uncertainties: z.array(z.string()).max(5),
  downstreamEvents: z.array(z.string()).max(5),
  nextQuestions: z.array(z.string()).max(4),
  /** The single hidden premise that most drives this estimate, phrased as a yes/no event. */
  pivotalAssumption: z.string().max(200),
});
export type AnalystOutput = z.infer<typeof AnalystOutput>;

export const ModelRun = z.object({
  role: ModelRole,
  model: z.string(), // e.g. "claude-sonnet-5-5 via claude -p" or "demo-fixture"
  provider: z.enum(["claude", "codex", "grok", "demo"]).optional(),
  status: z.enum(["queued", "running", "done", "failed"]),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  attempts: z.number().int(),
  output: AnalystOutput.nullable(),
  revised: z
    .object({ probability: z.number(), note: z.string() })
    .nullable()
    .default(null),
  error: z.string().nullable(),
});
export type ModelRun = z.infer<typeof ModelRun>;

export const DisagreementSummary = z.object({
  spread: z.number(), // max - min of final model probabilities
  min: z.number(),
  max: z.number(),
  outlierRole: ModelRole.nullable(),
  significant: z.boolean(),
  /** The competing explanatory narratives, attributed to models */
  narratives: z.array(
    z.object({ roles: z.array(ModelRole), probability: z.number(), premise: z.string(), mechanism: z.string() }),
  ),
});
export type DisagreementSummary = z.infer<typeof DisagreementSummary>;

export const Forecast = z.object({
  id: z.string(),
  verseId: z.string(),
  targetEventId: z.string(),
  targetOutcome: z.string(),
  engine: z.enum(["claude-cli", "codex-cli", "grok-cli", "multi-cli", "demo"]),
  kind: ProbabilityKind, // MODEL or DEMO
  baselineProbability: z.number().nullable(),
  baselineKind: ProbabilityKind.nullable(),
  baselineLabel: z.string().nullable(),
  ensembleProbability: z.number().nullable(),
  aggregation: z.string(),
  modelOutputs: z.array(ModelRun),
  disagreementSummary: DisagreementSummary.nullable(),
  assumptions: z.array(z.object({ eventId: z.string(), title: z.string(), outcome: z.string() })),
  sources: z.array(SourceRef),
  researchNote: z.string().nullable().default(null),
  generatedAt: z.string(),
  completedAt: z.string().nullable(),
  status: z.enum(["pending", "researching", "analyzing", "revising", "complete", "partial", "failed"]),
  error: z.string().nullable(),
});
export type Forecast = z.infer<typeof Forecast>;

export const NextForkSuggestion = z.object({
  eventId: z.string().nullable(), // existing event, or null when proposing a new custom question
  title: z.string(),
  rationale: z.string(),
  outcomes: z.array(z.string()).min(2),
  /** model-estimated P(target | outcome) per outcome — used for ranking only */
  conditional: z.array(z.object({ outcome: z.string(), probability: z.number() })),
  swing: z.number(),
  /** which model families proposed this question (parallel next-fork search) */
  proposedBy: z.array(z.string()).optional(),
});
export type NextForkSuggestion = z.infer<typeof NextForkSuggestion>;
