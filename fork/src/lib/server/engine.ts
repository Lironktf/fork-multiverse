import "server-only";
/**
 * Multi-model forecasting orchestrator.
 *
 *   1 Normalize   strict structured scenario (validated request)
 *   2 Research    one WebSearch-enabled call; citations kept verbatim, cached 6h
 *   3 Analyze     four role-prompted analysts in parallel, blind to each other
 *   4 Disagree    range + outlier detection (aggregate.ts)
 *   5 Revise      only when disagreement is significant: each analyst sees the
 *                 others' ARGUMENTS (not their numbers) and may revise or hold
 *   6 Aggregate   equal-weight mean (no documented basis for weights)
 *   7 Validate    zod schema, bounds, scenario echo; invalid → one retry → failed
 *   8 Store       SQLite (immutable once complete)
 *
 * The four roles share one underlying model family, so they are NOT
 * independent forecasters; the UI states this.
 */
import { z } from "zod";
import {
  AnalystOutput,
  MODEL_ROLES,
  type Forecast,
  type ForkEvent,
  type ModelRole,
  type NextForkSuggestion,
  type SourceRef,
} from "@/lib/domain/types";
import { observedProbability } from "@/lib/domain/market";
import { ensembleMean, summarizeDisagreement } from "@/lib/forecast/aggregate";
import { runDemoForecast, demoNextForks } from "@/lib/demo/engine";
import { providerStatus, providersFor, runProvider, PROVIDER_LABEL, type Provider, type ProviderMode } from "./providers";
import { getResearch, loadForecast, putResearch, saveForecast } from "./db";

export const ScenarioItemIn = z.object({
  event: z.any(), // ForkEvent, validated loosely (client registry)
  outcome: z.string(),
  layer: z.enum(["inherited", "new"]),
});
export const ForecastRequest = z.object({
  forecastId: z.string().min(4).max(80),
  verseId: z.string().min(1).max(80),
  target: z.any(),
  targetOutcome: z.string(),
  scenario: z.array(ScenarioItemIn).max(24),
  engine: z.enum(["auto", "demo"]).default("auto"),
  providers: z.enum(["mixed", "claude", "codex"]).default("mixed"),
  baseline: z
    .object({ value: z.number(), kind: z.enum(["MARKET", "MODEL", "DEMO"]), label: z.string() })
    .nullable()
    .optional(),
});
export type ForecastRequest = z.infer<typeof ForecastRequest>;

const jobs = new Map<string, Forecast>();
const ROLES: ModelRole[] = ["causal", "empirical", "market", "skeptic"];

export function engineStatus() {
  const p = providerStatus();
  return {
    engine: p.claude || p.codex ? ("cli" as const) : ("demo" as const),
    claude: p.claude,
    claudeVersion: p.claudeVersion,
    codex: p.codex,
    codexVersion: p.codexVersion,
    model: process.env.FORK_CLAUDE_MODEL ?? "sonnet",
    codexModel: process.env.FORK_CODEX_MODEL ?? "codex default",
    research: process.env.FORK_RESEARCH !== "0",
    revision: process.env.FORK_REVISION ?? "auto",
  };
}

export function getForecast(id: string): Forecast | null {
  return jobs.get(id) ?? loadForecast(id);
}

function persist(f: Forecast) {
  jobs.set(f.id, f);
  try {
    saveForecast(f);
  } catch (e) {
    console.error("[fork] forecast persistence failed", e);
  }
}

function describeEvent(e: ForkEvent) {
  const obs = (o: string) => observedProbability(e, o);
  const quotes =
    e.source === "gemini"
      ? e.possibleOutcomes
          .slice(0, 12)
          .map((o) => {
            const p = obs(o);
            return `${o}: ${p ? `${(p.value * 100).toFixed(1)}% (${p.label}, observed ${p.timestamp})` : "no quote"}`;
          })
          .join("; ")
      : "not a listed market";
  return [
    `id=${e.id}`,
    `title="${e.title}"`,
    `source=${e.source}${e.source === "demo" ? " (hypothetical demonstration event)" : ""}${e.source === "custom" ? " (user-defined hypothetical)" : ""}`,
    `resolution="${(e.resolutionCriteria || e.description || "").slice(0, 400)}"`,
    e.resolutionDate ? `resolves_by=${e.resolutionDate}` : "",
    `market_quotes=[${quotes}]`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function scenarioBlock(req: ForecastRequest) {
  if (!req.scenario.length) return "No hypothetical assumptions (this is the Origin world: reality as currently understood).";
  return req.scenario
    .map((s, i) => `${i + 1}. ASSUME "${(s.event as ForkEvent).title}" resolves ${s.outcome}. [${describeEvent(s.event as ForkEvent)}]`)
    .join("\n");
}

const ANALYST_SCHEMA = z.toJSONSchema(AnalystOutput);

const ROLE_SYSTEM: Record<ModelRole, string> = {
  causal:
    "You are Analyst A, a macro / causal analyst in a conditional-forecasting system. Identify the concrete economic, political or technological mechanisms by which the assumed scenario would change the target's probability. Be explicit about mechanism direction and magnitude.",
  empirical:
    "You are Analyst B, a historical / empirical analyst in a conditional-forecasting system. Anchor on base rates and historical analogues, quantify where possible, and state where analogies break down.",
  market:
    "You are Analyst C, a market analyst in a conditional-forecasting system. Use observed market prices and financial relationships. Strictly separate what is OBSERVED (quoted prices, with timestamps given to you) from what you PREDICT.",
  skeptic:
    "You are Analyst D, a skeptical / contrarian analyst in a conditional-forecasting system. Independently challenge the obvious narrative: surface hidden assumptions, alternative mechanisms, reflexivity, and reasons a naive conditional forecast would mislead. Do not be contrarian for its own sake — if the obvious reading is right, say so.",
};

const COMMON_RULES = `Rules:
- You are estimating P(target outcome | ALL listed assumptions are true). Treat assumptions as given facts of this hypothetical world, even if unlikely in reality.
- Return ONLY the structured object. probability is a decimal in [0.01, 0.99].
- Do not invent sources. In evidence[], set sourceUrl ONLY to a URL that appears in the research digest provided; otherwise null.
- Distinguish correlation from causation; say "model-inferred" for mechanisms you hypothesise.
- pivotalAssumption: the single hidden premise that most drives your number, phrased as a yes/no event someone could assume (e.g. "Rate cuts are driven by a growth scare rather than falling inflation").
- headline: one sentence stating the mechanism as seen through YOUR analytical lens specifically (not a neutral summary another analyst could also have written).
- Keep reasoning under 180 words. Today is ${new Date().toISOString().slice(0, 10)}.`;

interface ResearchDigest {
  summary: string;
  findings: { claim: string; url: string; title: string; publisher: string }[];
}
const ResearchSchema = z.object({
  summary: z.string(),
  findings: z
    .array(z.object({ claim: z.string(), url: z.string(), title: z.string(), publisher: z.string() }))
    .max(8),
});

async function research(req: ForecastRequest, provider: Provider): Promise<ResearchDigest | null> {
  const target = req.target as ForkEvent;
  const key = JSON.stringify([target.id, req.targetOutcome, req.scenario.map((s) => [(s.event as ForkEvent).id, s.outcome])]);
  const cached = getResearch(key) as ResearchDigest | null;
  if (cached) return cached;
  const r = await runProvider<ResearchDigest>(provider, {
    system:
      "You are a research assistant for a forecasting team. Use web search to gather CURRENT, citable facts. Never fabricate URLs: every url must be a page you actually found via search.",
    prompt: `Target question: "${target.title}" (outcome ${req.targetOutcome}). ${describeEvent(target)}

Hypothetical scenario being analysed:
${scenarioBlock(req)}

Run at most 3 web searches. Return: summary (≤120 words of the current real-world state relevant to the target and each assumption) and up to 6 findings, each a concrete claim with the exact url/title/publisher where you found it.`,
    webSearch: true,
    schema: z.toJSONSchema(ResearchSchema),
    model: process.env.FORK_CLAUDE_RESEARCH_MODEL ?? process.env.FORK_CLAUDE_MODEL ?? "sonnet",
    timeoutMs: 150_000,
  });
  const parsed = ResearchSchema.safeParse(r.structured);
  if (!parsed.success) return null;
  const digest = { ...parsed.data, findings: parsed.data.findings.filter((f) => /^https?:\/\//.test(f.url)) };
  putResearch(key, digest);
  return digest;
}

function analystPrompt(req: ForecastRequest, digest: ResearchDigest | null, opts: { echoIds?: boolean } = {}) {
  const target = req.target as ForkEvent;
  return `TARGET: P("${target.title}" resolves ${req.targetOutcome})
${describeEvent(target)}
${req.baseline ? `Reference point (do not anchor blindly): ${req.baseline.label} = ${(req.baseline.value * 100).toFixed(1)}% [${req.baseline.kind}]` : "No market price exists for this target."}

HYPOTHETICAL WORLD — assume all of the following are true:
${scenarioBlock(req)}

RESEARCH DIGEST (${digest ? "web research, cite only these URLs" : "unavailable — rely on your knowledge and say so"}):
${digest ? digest.summary + "\n" + digest.findings.map((f) => `- ${f.claim} [${f.title}, ${f.publisher}] ${f.url}`).join("\n") : "(none)"}
${opts.echoIds === false ? "" : `\nEcho targetEventId="${target.id}" and the scenario eventIds/resolutions exactly as given.`}`;
}

function validateOutput(o: unknown, req: ForecastRequest, allowedUrls: Set<string>): z.infer<typeof AnalystOutput> {
  const parsed = AnalystOutput.parse(o);
  const target = req.target as ForkEvent;
  if (parsed.targetEventId !== target.id) throw new Error("analyst answered about a different target");
  // never surface a citation that did not come from research
  parsed.evidence = parsed.evidence.map((e) => ({ ...e, sourceUrl: e.sourceUrl && allowedUrls.has(e.sourceUrl) ? e.sourceUrl : null }));
  // canonical scenario echo (models occasionally paraphrase ids)
  parsed.scenario = req.scenario.map((s) => ({ eventId: (s.event as ForkEvent).id, resolution: s.outcome }));
  return parsed;
}

/**
 * Role → provider. In mixed mode the two families alternate (A,C Claude · B,D
 * Codex) so the skeptic never shares a model family with the causal analyst.
 * ASSUMPTION: cross-family assignment yields more informative disagreement than
 * same-family prompting; overturned if mixed and single-family spreads match.
 */
const MIXED_ASSIGNMENT: Record<ModelRole, Provider> = { causal: "claude", empirical: "codex", market: "claude", skeptic: "codex" };
function providerFor(role: ModelRole, pool: Provider[]): Provider {
  return pool.length > 1 ? MIXED_ASSIGNMENT[role] : pool[0];
}

async function runAnalyst(f: Forecast, role: ModelRole, req: ForecastRequest, digest: ResearchDigest | null, pool: Provider[]) {
  const run = f.modelOutputs.find((r) => r.role === role)!;
  const allowed = new Set((digest?.findings ?? []).map((x) => x.url));
  run.status = "running";
  run.startedAt = new Date().toISOString();
  persist(f);
  const primary = providerFor(role, pool);
  for (let attempt = 1; attempt <= 2; attempt++) {
    run.attempts = attempt;
    // a failed first attempt retries on the other family when one is available — the
    // result is labelled with the model that actually answered
    const provider = attempt === 2 && pool.length > 1 ? pool.find((p) => p !== primary)! : primary;
    run.provider = provider;
    try {
      const r = await runProvider(provider, {
        system: `${ROLE_SYSTEM[role]}\n\n${COMMON_RULES}`,
        prompt: analystPrompt(req, digest),
        schema: ANALYST_SCHEMA,
        timeoutMs: 170_000,
      });
      run.output = validateOutput(r.structured, req, allowed);
      run.model = `${r.model} via ${PROVIDER_LABEL[provider]}`;
      run.status = "done";
      run.error = null;
      break;
    } catch (e) {
      run.error = (e as Error).message.slice(0, 300);
      run.status = attempt === 2 ? "failed" : "running";
    }
  }
  run.finishedAt = new Date().toISOString();
  persist(f);
}

const RevisionSchema = z.object({ probability: z.number().min(0.01).max(0.99), note: z.string().max(400) });

async function revise(f: Forecast, req: ForecastRequest, digest: ResearchDigest | null) {
  const done = f.modelOutputs.filter((r) => r.status === "done" && r.output);
  await Promise.all(
    done.map(async (run) => {
      const others = done
        .filter((o) => o !== run)
        .map((o) => `${MODEL_ROLES[o.role].label}: ${o.output!.headline} Counterpoints: ${o.output!.counterarguments.join("; ")}`)
        .join("\n");
      try {
        const r = await runProvider<z.infer<typeof RevisionSchema>>((run.provider as Provider) ?? "claude", {
          system: `${ROLE_SYSTEM[run.role]}\nYou are in a revision round. You may revise or hold your estimate. Do not move toward others merely to agree.`,
          prompt: `${analystPrompt(req, digest, { echoIds: false })}\n\nYour previous estimate: ${(run.output!.probability * 100).toFixed(0)}%. Your headline: ${run.output!.headline}\n\nOther analysts' ARGUMENTS (their numbers are withheld):\n${others}\n\nReturn your final probability and a one-sentence note (plain prose, no ids) on whether/why you changed it.`,
          schema: z.toJSONSchema(RevisionSchema),
          timeoutMs: 120_000,
        });
        const parsed = RevisionSchema.parse(r.structured);
        run.revised = parsed;
      } catch {
        /* keep the original estimate — a failed revision is not a failed analysis */
      }
    }),
  );
}

async function runCliForecast(f: Forecast, req: ForecastRequest, pool: Provider[]) {
  let digest: ResearchDigest | null = null;
  if (process.env.FORK_RESEARCH !== "0") {
    f.status = "researching";
    persist(f);
    try {
      // Claude's WebSearch when Claude is in the pool, else Codex's live web search
      digest = await research(req, pool.includes("claude") ? "claude" : "codex");
    } catch (e) {
      f.researchNote = `Research step failed (${(e as Error).message.slice(0, 120)}); analysts worked without fresh sources.`;
    }
  }
  if (digest) {
    f.sources = digest.findings.map<SourceRef>((x) => ({ title: x.title, url: x.url, publisher: x.publisher, note: x.claim }));
    f.researchNote = digest.summary;
  } else if (!f.researchNote) {
    f.researchNote = process.env.FORK_RESEARCH === "0" ? "Research disabled (FORK_RESEARCH=0)." : "Research returned no usable citations.";
  }
  f.status = "analyzing";
  persist(f);
  await Promise.all(ROLES.map((role) => runAnalyst(f, role, req, digest, pool)));

  let dis = summarizeDisagreement(f.modelOutputs);
  const revMode = process.env.FORK_REVISION ?? "auto";
  if (dis && (revMode === "1" || (revMode === "auto" && dis.significant))) {
    f.status = "revising";
    f.disagreementSummary = dis; // show pre-revision disagreement while revising
    persist(f);
    await revise(f, req, digest);
    dis = summarizeDisagreement(f.modelOutputs);
  }
  const done = f.modelOutputs.filter((r) => r.status === "done");
  f.disagreementSummary = dis;
  f.ensembleProbability = ensembleMean(f.modelOutputs);
  f.aggregation = `Equal-weight mean of ${done.length} of 4 analysts${done.some((r) => r.revised) ? " (post-revision values)" : ""}. No weights: no documented basis for weighting roles.`;
  f.status = done.length === 4 ? "complete" : done.length > 0 ? "partial" : "failed";
  if (f.status === "failed") f.error = "All analysts failed; no estimate was produced.";
  f.completedAt = new Date().toISOString();
  persist(f);
}

export function startForecast(raw: unknown): Forecast {
  const req = ForecastRequest.parse(raw);
  const existing = getForecast(req.forecastId);
  if (existing) return existing; // idempotent: same id never re-runs
  const target = req.target as ForkEvent;
  const events = new Map<string, ForkEvent>(req.scenario.map((s) => [(s.event as ForkEvent).id, s.event as ForkEvent]));
  const pool = req.engine === "demo" ? [] : providersFor(req.providers as ProviderMode);

  if (!pool.length) {
    const f = runDemoForecast({
      forecastId: req.forecastId,
      verseId: req.verseId,
      target,
      targetOutcome: req.targetOutcome,
      scenario: req.scenario.map((s) => ({ eventId: (s.event as ForkEvent).id, outcome: s.outcome })),
      events,
    });
    persist(f);
    return f;
  }

  const now = new Date().toISOString();
  const f: Forecast = {
    id: req.forecastId,
    verseId: req.verseId,
    targetEventId: target.id,
    targetOutcome: req.targetOutcome,
    engine: pool.length > 1 ? "multi-cli" : pool[0] === "codex" ? "codex-cli" : "claude-cli",
    kind: "MODEL",
    baselineProbability: req.baseline?.value ?? null,
    baselineKind: req.baseline?.kind ?? null,
    baselineLabel: req.baseline?.label ?? null,
    ensembleProbability: null,
    aggregation: "",
    modelOutputs: ROLES.map((role) => ({
      role,
      model: PROVIDER_LABEL[providerFor(role, pool)],
      provider: providerFor(role, pool),
      status: "queued",
      startedAt: null,
      finishedAt: null,
      attempts: 0,
      output: null,
      revised: null,
      error: null,
    })),
    disagreementSummary: null,
    assumptions: req.scenario.map((s) => ({ eventId: (s.event as ForkEvent).id, title: (s.event as ForkEvent).title, outcome: s.outcome })),
    sources: [],
    researchNote: null,
    generatedAt: now,
    completedAt: null,
    status: "pending",
    error: null,
  };
  persist(f);
  runCliForecast(f, req, pool).catch((e) => {
    f.status = f.modelOutputs.some((r) => r.status === "done") ? "partial" : "failed";
    f.error = (e as Error).message;
    f.ensembleProbability = ensembleMean(f.modelOutputs);
    f.completedAt = new Date().toISOString();
    persist(f);
  });
  return f;
}

/* ---------------- Find the next fork ---------------- */

const NextForkSchema = z.object({
  suggestions: z
    .array(
      z.object({
        eventId: z.string().nullable(),
        title: z.string(),
        rationale: z.string(),
        outcomes: z.array(z.string()).min(2).max(6),
        conditional: z.array(z.object({ outcome: z.string(), probability: z.number().min(0).max(1) })),
      }),
    )
    .max(5),
});

export async function nextForks(raw: unknown): Promise<{ engine: "claude-cli" | "codex-cli" | "demo"; suggestions: NextForkSuggestion[] }> {
  const req = z
    .object({
      target: z.any(),
      targetOutcome: z.string(),
      scenario: z.array(ScenarioItemIn),
      candidates: z.array(z.any()).max(40),
      engine: z.enum(["auto", "demo"]).default("auto"),
      providers: z.enum(["mixed", "claude", "codex"]).default("mixed"),
    })
    .parse(raw);
  const pool = req.engine === "demo" ? [] : providersFor(req.providers);
  const target = req.target as ForkEvent;
  if (!pool.length) {
    return {
      engine: "demo",
      suggestions: demoNextForks(target, req.scenario.map((s) => ({ eventId: (s.event as ForkEvent).id, outcome: s.outcome }))),
    };
  }
  const candidates = req.candidates as ForkEvent[];
  const provider: Provider = pool.includes("claude") ? "claude" : "codex";
  const r = await runProvider<z.infer<typeof NextForkSchema>>(provider, {
    model: process.env.FORK_CLAUDE_FAST_MODEL ?? process.env.FORK_CLAUDE_MODEL ?? "sonnet",
    system:
      "You help a user explore conditional futures. Identify which unresolved questions would most change the target probability inside the user's hypothetical world.",
    prompt: `TARGET: "${target.title}" resolves ${req.targetOutcome}.
HYPOTHETICAL WORLD (assumed true):
${scenarioBlock({ ...req, forecastId: "x", verseId: "x", baseline: null } as ForecastRequest)}

CANDIDATE EVENTS (prefer these; use their exact id):
${candidates.map((c) => `- id=${c.id} | ${c.title} | outcomes: ${c.possibleOutcomes.slice(0, 6).join(", ")}`).join("\n")}

Propose up to 4 questions whose resolution would most move P(target). At most 2 may be NEW questions (eventId null) — e.g. the hidden "why" behind an existing assumption (soft landing vs recession-driven cuts). For each, estimate P(target | outcome) for every outcome listed. These are rough model estimates used only to rank questions.`,
    schema: z.toJSONSchema(NextForkSchema),
    timeoutMs: 120_000,
  });
  const parsed = NextForkSchema.parse(r.structured);
  const ids = new Set(candidates.map((c) => c.id));
  const suggestions = parsed.suggestions
    .map((s) => {
      const known = s.eventId && ids.has(s.eventId) ? s.eventId : null;
      const ps = s.conditional.map((c) => c.probability);
      return { ...s, eventId: known, swing: ps.length ? Math.max(...ps) - Math.min(...ps) : 0 };
    })
    .sort((a, b) => b.swing - a.swing);
  return { engine: provider === "claude" ? "claude-cli" : "codex-cli", suggestions };
}
