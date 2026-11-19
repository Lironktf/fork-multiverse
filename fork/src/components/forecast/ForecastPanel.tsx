"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Compass, ExternalLink, GitFork, Loader2, Plus, RotateCw, Split, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Forecast, ForkEvent, ModelRole, NextForkSuggestion } from "@/lib/domain/types";
import { MODEL_ROLES, targetKey } from "@/lib/domain/types";
import { fmtPct } from "@/lib/domain/market";
import { finalProbability } from "@/lib/forecast/aggregate";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import { baselineFor, forkDisagreement, isTerminal, requestForecast, requestNextForks, addEventToBasket } from "@/lib/client/actions";
import { ORIGIN_ID } from "@/lib/domain/verse";
import { ProbabilityDisplay, RangeTrack } from "./ProbabilityDisplay";
import { Onchain } from "@/components/solana/Onchain";
import { MarketContext } from "./MarketContext";

const ROLE_ORDER: ModelRole[] = ["causal", "empirical", "market", "skeptic"];

/** Which model family produced an analysis — kept visible so numbers stay attributed. */
const PROVIDER_TITLE = { claude: "Anthropic Claude via claude -p", codex: "OpenAI Codex via codex exec", grok: "xAI Grok via grok -p" } as const;
export function ProviderTag({ p }: { p: "claude" | "codex" | "grok" }) {
  return (
    <span className="tag tag-custom" style={{ height: 13, fontSize: 8 }} title={PROVIDER_TITLE[p]}>
      {p}
    </span>
  );
}

function useElapsed(since: string | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!since) return null;
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
}

/** Real pipeline state only — no invented percentages. */
function AnalysisProgress({ f }: { f: Forecast }) {
  const running = !isTerminal(f);
  const elapsed = useElapsed(f.generatedAt, running);
  const steps = [
    { k: "research", label: "Research", state: f.status === "pending" ? "queued" : f.status === "researching" ? "running" : "done" },
    ...f.modelOutputs.map((r) => ({ k: r.role, label: `${MODEL_ROLES[r.role].short} · ${MODEL_ROLES[r.role].label}${r.provider && r.provider !== "demo" ? ` · ${r.provider}` : ""}`, state: r.status === "done" ? "done" : r.status })),
    ...(f.status === "revising" ? [{ k: "rev", label: "Revision round (arguments only, numbers withheld)", state: "running" }] : []),
  ];
  return (
    <div className="mt-3 rounded-md border border-line bg-black/25 p-2.5" aria-live="polite">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="meta text-accent/80">Analysis in progress</span>
        {elapsed !== null && <span className="num text-[10px] text-ink-3">{elapsed}s</span>}
      </div>
      <ul className="flex flex-col gap-1">
        {steps.map((s) => (
          <li key={s.k} className="flex items-center gap-2 text-[11px]">
            <span className="flex h-3.5 w-3.5 items-center justify-center">
              {s.state === "done" ? <Check size={11} className="text-up" /> : s.state === "running" ? <Loader2 size={11} className="animate-spin text-accent" /> : s.state === "failed" ? <X size={11} className="text-down" /> : <span className="h-1 w-1 rounded-full bg-ink-3" />}
            </span>
            <span className={s.state === "done" ? "text-ink-2" : s.state === "running" ? "text-ink" : "text-ink-3"}>{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
        {f.engine === "multi-cli"
          ? `Research and all four role-prompted analyses run in parallel across ${[...new Set(f.modelOutputs.map((r) => r.provider).filter(Boolean))].join(", ")}. Different model families, but still not independent forecasters.`
          : `Four role-prompted analyses run in parallel through the local ${f.engine === "codex-cli" ? "Codex" : f.engine === "grok-cli" ? "Grok" : "Claude"} CLI. They share a model family, so they are not independent forecasters.`}
      </p>
    </div>
  );
}

function AnalystRows({ f }: { f: Forecast }) {
  const set = useUI((s) => s.set);
  const base = f.baselineProbability;
  return (
    <ul className="mt-3 flex flex-col">
      {ROLE_ORDER.map((role) => {
        const r = f.modelOutputs.find((x) => x.role === role);
        if (!r) return null;
        const p = finalProbability(r);
        const outlier = f.disagreementSummary?.outlierRole === role;
        const d = p !== null && base !== null ? p - base : null;
        return (
          <li key={role}>
            <button onClick={() => set({ inspectRole: role })} className="group -mx-1.5 flex w-[calc(100%+12px)] items-start gap-2.5 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-white/[0.035]" data-testid={`analyst-${role}`}>
              <span className={`num mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[9px] ${outlier ? "border-warn/70 text-warn" : "border-white/15 text-ink-2"}`}>{MODEL_ROLES[role].short}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink">
                  {MODEL_ROLES[role].label}
                  {r.provider && r.provider !== "demo" && <ProviderTag p={r.provider} />}
                  {r.revised && <span className="tag tag-model" style={{ height: 13, fontSize: 8 }}>revised</span>}
                  {outlier && <span className="text-[10px] text-warn">outlier</span>}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-ink-3 group-hover:text-ink-2">
                  {r.output?.headline ?? (r.status === "failed" ? `Failed — ${r.error ?? "no valid output"}. Not substituted.` : r.status === "running" ? "Analysing…" : "Queued")}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="num text-[13px] text-ink">{p !== null ? fmtPct(p) : "—"}</span>
                {d !== null && <span className={`num text-[10px] ${d > 0.005 ? "text-up" : d < -0.005 ? "text-down" : "text-ink-3"}`}>{d >= 0 ? "+" : "−"}{Math.abs(d * 100).toFixed(0)}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DisagreementCallout({ f }: { f: Forecast }) {
  const d = f.disagreementSummary;
  const set = useUI((s) => s.set);
  if (!d?.significant || !d.outlierRole) return null;
  const others = d.narratives[0];
  const out = d.narratives[1];
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-md border border-warn/25 bg-warn/[0.035] p-3" data-testid="disagreement-callout">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rotate-45 border border-warn" aria-hidden />
        <span className="text-[11.5px] font-medium text-warn/95">The {MODEL_ROLES[d.outlierRole].label} analyst disagrees</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-2">
        {fmtPct(out?.probability)} vs {fmtPct(others?.probability)} for the others — a {(Math.abs((out?.probability ?? 0) - (others?.probability ?? 0)) * 100).toFixed(0)}pp gap driven by a different premise.
      </p>
      <div className="mt-2.5 flex gap-1.5">
        <button className="btn !h-7 !text-[11px]" onClick={() => set({ disagreementOpen: true, inspectRole: null })} data-testid="inspect-disagreement">
          Inspect premises
        </button>
        <button className="btn !h-7 !text-[11px]" onClick={() => forkDisagreement(f)}>
          <Split size={12} aria-hidden /> Fork both
        </button>
      </div>
    </motion.div>
  );
}

function NextFork({ verseId }: { verseId: string }) {
  const target = useUniverse((s) => s.target);
  const key = `${verseId}::${targetKey(target)}`;
  const nf = useUI((s) => s.nextForks[key]);
  const add = (s: NextForkSuggestion, outcome: string) => {
    const st = useUniverse.getState();
    let ev: ForkEvent | undefined = s.eventId ? st.events[s.eventId] : undefined;
    if (!ev) {
      ev = {
        id: `model:nf:${Date.now().toString(36)}`,
        title: s.title,
        description: s.rationale,
        category: "other",
        source: "model",
        externalMarketId: null,
        eventType: s.outcomes.length === 2 && s.outcomes.includes("YES") ? "binary" : "categorical",
        possibleOutcomes: s.outcomes,
        resolutionCriteria: "Model-proposed question; no formal resolution source.",
        resolutionDate: null,
        metadata: { proposedBy: "next-fork" },
      };
      st.registerEvents([ev]);
    }
    addEventToBasket(ev, outcome);
  };
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="next-fork">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
          <Compass size={12} className="text-accent" aria-hidden /> The next fork
        </span>
        <button className="ibtn !h-6 !text-[10.5px]" onClick={() => requestNextForks(verseId, target)} disabled={nf?.status === "loading"} data-testid="find-next-fork">
          {nf?.status === "loading" ? <Loader2 size={11} className="animate-spin" /> : nf ? <RotateCw size={11} /> : null}
          {nf ? "Re-run" : "Find"}
        </button>
      </div>
      {!nf && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">Which unresolved question would move this forecast most? Ranked by model-estimated swing — not a formal information-gain calculation.</p>}
      {nf?.status === "loading" && <p className="mt-2 text-[11px] text-ink-3">Asking the model which open questions matter most in this world…</p>}
      {nf?.status === "error" && <p className="mt-2 text-[11px] text-down">Could not rank questions: {nf.error}</p>}
      {nf?.status === "done" && nf.suggestions.length === 0 && <p className="mt-2 text-[11px] text-ink-3">No candidate questions were found for this target.</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {nf?.suggestions.map((s, i) => (
          <motion.li key={s.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-md border border-line bg-black/20 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11.5px] leading-snug text-ink">
                {s.title}
                {s.proposedBy?.length ? (
                  <span className="ml-1.5 inline-flex gap-1 align-middle" title={`Independently proposed by ${s.proposedBy.join(", ")}`}>
                    {s.proposedBy.map((p) => (p === "claude" || p === "codex" || p === "grok" ? <ProviderTag key={p} p={p} /> : null))}
                  </span>
                ) : null}
              </span>
              <span className="num shrink-0 text-[10.5px] text-accent" title="Model-estimated swing between outcomes">{(s.swing * 100).toFixed(0)}pp swing</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-ink-3">{s.rationale}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {s.conditional.slice(0, 4).map((c) => (
                <button key={c.outcome} onClick={() => add(s, c.outcome)} className="flex h-6 items-center gap-1.5 rounded-[5px] border border-line px-2 text-[10.5px] text-ink-2 transition-colors hover:border-accent/50 hover:text-ink">
                  <Plus size={10} aria-hidden />
                  <span className="max-w-[110px] truncate">{c.outcome}</span>
                  <span className="num text-ink-3">→ {fmtPct(c.probability)}</span>
                </button>
              ))}
            </div>
          </motion.li>
        ))}
      </ul>
      {nf?.status === "done" && <p className="mt-2 text-[9.5px] text-ink-3">{nf.engine === "demo" ? "Demonstration ranking from illustrative fixtures." : nf.engine === "multi-cli" ? "Every model family searched in parallel; questions raised by several families rank first. Rough estimates, used only to rank." : "Rough model estimates used only to rank questions."}</p>}
    </div>
  );
}

function Sources({ f }: { f: Forecast }) {
  if (!f.sources.length && !f.researchNote) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="meta mb-1.5">Research</div>
      {f.researchNote && <p className="text-[11px] leading-relaxed text-ink-2">{f.researchNote}</p>}
      <ul className="mt-2 flex flex-col gap-1">
        {f.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer" className="group flex items-start gap-1.5 text-[11px] text-ink-3 hover:text-ink-2">
              <ExternalLink size={10} className="mt-[3px] shrink-0" aria-hidden />
              <span className="line-clamp-2">
                <span className="text-ink-2 group-hover:text-accent">{s.title}</span>
                {s.publisher && <span> · {s.publisher}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ModelInspector({ f, role }: { f: Forecast; role: ModelRole }) {
  const set = useUI((s) => s.set);
  const run = f.modelOutputs.find((r) => r.role === role)!;
  const o = run.output;
  const List = ({ title, items }: { title: string; items: string[] }) =>
    items.length ? (
      <div className="mt-3">
        <div className="meta mb-1">{title}</div>
        <ul className="flex flex-col gap-1">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-ink-2">
              <span className="mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full bg-ink-3" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  const addPremise = () => {
    if (!o) return;
    const ev: ForkEvent = {
      id: `model:${f.id}:${role}:premise`,
      title: o.pivotalAssumption,
      description: `Pivotal premise named by the ${MODEL_ROLES[role].label} analyst.`,
      category: "other",
      source: "model",
      externalMarketId: null,
      eventType: "binary",
      possibleOutcomes: ["YES", "NO"],
      resolutionCriteria: "Model-proposed premise; no formal resolution source.",
      resolutionDate: null,
      metadata: { proposedBy: role },
    };
    useUniverse.getState().registerEvents([ev]);
    addEventToBasket(ev, "YES");
  };
  return (
    <motion.div key={role} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} data-testid="model-inspector">
      <button className="ibtn -ml-1.5 !h-6 !text-[11px]" onClick={() => set({ inspectRole: null })}>
        <ArrowLeft size={12} /> Forecast
      </button>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <div className="meta">Analyst {MODEL_ROLES[role].short}</div>
          <h3 className="mt-0.5 text-[15px] font-medium text-ink">{MODEL_ROLES[role].label}</h3>
          <p className="mt-0.5 text-[10.5px] text-ink-3">{MODEL_ROLES[role].brief}</p>
        </div>
        <div className="text-right">
          <div className="num text-[26px] leading-none text-ink">{fmtPct(finalProbability(run))}</div>
          {run.revised && (
            <div className="num mt-1 text-[10px] text-ink-3">
              first {fmtPct(o?.probability)} → revised
            </div>
          )}
        </div>
      </div>
      <div className="num mt-2 text-[10px] text-ink-3">
        {run.model} · {run.attempts} attempt{run.attempts !== 1 ? "s" : ""}
      </div>
      {!o ? (
        <p className="mt-4 text-[12px] text-ink-2">{run.status === "failed" ? `This analyst failed (${run.error}). Its output is not substituted or estimated.` : "Still analysing."}</p>
      ) : (
        <>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink">{o.headline}</p>
          {run.revised && <p className="mt-2 rounded border border-accent/20 bg-accent/[0.04] p-2 text-[11px] text-ink-2">Revision note: {run.revised.note}</p>}
          <div className="mt-3 rounded-md border border-line bg-black/25 p-2.5">
            <div className="meta mb-1">Pivotal premise</div>
            <p className="text-[11.5px] text-ink">{o.pivotalAssumption}</p>
            <button className="btn mt-2 !h-6 !text-[10.5px]" onClick={addPremise}>
              <Plus size={11} /> Assume this premise
            </button>
          </div>
          <div className="mt-3">
            <div className="meta mb-1">Reasoning</div>
            <p className="whitespace-pre-line text-[11.5px] leading-relaxed text-ink-2">{o.reasoning}</p>
          </div>
          <List title="Key assumptions" items={o.keyAssumptions} />
          <List title="Counterarguments" items={o.counterarguments} />
          {o.evidence.length > 0 && (
            <div className="mt-3">
              <div className="meta mb-1">Evidence</div>
              <ul className="flex flex-col gap-1">
                {o.evidence.map((e, i) => (
                  <li key={i} className="text-[11.5px] leading-snug text-ink-2">
                    {e.claim}{" "}
                    {e.sourceUrl ? (
                      <a className="text-accent hover:underline" href={e.sourceUrl} target="_blank" rel="noreferrer">
                        source ↗
                      </a>
                    ) : (
                      <span className="text-[10px] text-ink-3">(no cited source)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <List title="Missing information" items={o.missingInformation} />
          <List title="Major uncertainties" items={o.uncertainties} />
          <List title="Possible downstream events" items={o.downstreamEvents} />
          <List title="Suggested next questions" items={o.nextQuestions} />
        </>
      )}
    </motion.div>
  );
}

function DisagreementView({ f }: { f: Forecast }) {
  const set = useUI((s) => s.set);
  const d = f.disagreementSummary!;
  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} data-testid="disagreement-view">
      <button className="ibtn -ml-1.5 !h-6 !text-[11px]" onClick={() => set({ disagreementOpen: false })}>
        <ArrowLeft size={12} /> Forecast
      </button>
      <h3 className="mt-2 text-[15px] font-medium text-ink">Where the analysts split</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-3">Each side reads the same world through a different premise. The probabilities stay attributed to the analysts who produced them; the gap is not a measured causal effect.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {d.narratives.map((n, i) => (
          <div key={i} className={`flex flex-col rounded-md border p-2.5 ${i === 1 ? "border-warn/35 bg-warn/[0.03]" : "border-line bg-black/20"}`}>
            <div className="flex items-center justify-between">
              <span className="num text-[10px] text-ink-3">{n.roles.map((r) => MODEL_ROLES[r].short).join(" · ")}</span>
              <span className={`num text-[18px] ${i === 1 ? "text-warn" : "text-ink"}`}>{fmtPct(n.probability)}</span>
            </div>
            <div className="meta mt-2">premise</div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink">{n.premise}</p>
            {n.mechanism && n.mechanism !== n.premise && n.mechanism.replace(/\.$/, "") !== n.premise && (
              <>
                <div className="meta mt-2">mechanism</div>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-2">{n.mechanism}</p>
              </>
            )}
          </div>
        ))}
      </div>
      <button className="btn mt-3 w-full justify-center" onClick={() => forkDisagreement(f)} data-testid="fork-disagreement">
        <Split size={13} className="text-accent" /> Fork both premises into sibling Verses
      </button>
      <p className="mt-2 text-[10px] text-ink-3">Creates two children of this Verse — one assuming each premise — and analyses both.</p>
    </motion.div>
  );
}

export function ForecastPanel() {
  const { target, currentVerseId, forecasts, forecastIndex, verses, engineMode, events, mode } = useUniverse(
    useShallow((s) => ({ target: s.target, currentVerseId: s.currentVerseId, forecasts: s.forecasts, forecastIndex: s.forecastIndex, verses: s.verses, engineMode: s.engine, events: s.events, mode: s.mode })),
  );
  const { inspectRole, disagreementOpen, phase } = useUI(useShallow((s) => ({ inspectRole: s.inspectRole, disagreementOpen: s.disagreementOpen, phase: s.forkPhase })));
  const f = forecastFor({ forecasts, forecastIndex }, currentVerseId, target);
  const verse = verses[currentVerseId];
  const parentF = verse.parentId ? forecastFor({ forecasts, forecastIndex }, verse.parentId, target) : null;
   
  const baseline = baselineFor(target, engineMode);
  const isOrigin = currentVerseId === ORIGIN_ID;
  const analyzing = f && !isTerminal(f);

  return (
    <section aria-label="Forecast" className="surface pointer-events-auto flex min-h-0 flex-col overflow-hidden" data-testid="forecast-panel">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3.5">
        <AnimatePresence mode="wait" initial={false}>
          {inspectRole && f ? (
            <ModelInspector key="inspect" f={f} role={inspectRole as ModelRole} />
          ) : disagreementOpen && f?.disagreementSummary ? (
            <DisagreementView key="dis" f={f} />
          ) : (
            <motion.div key="main" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-[12px] font-medium tracking-wide text-ink">Forecast</h2>
                <span className="truncate text-[10.5px] text-ink-3">
                  {verse.name} · {target.outcome}
                </span>
              </div>
              <ProbabilityDisplay forecast={f} baseline={baseline} />
              {parentF?.ensembleProbability != null && f?.ensembleProbability != null && (
                <p className="num mt-2 text-[10.5px] text-ink-3">
                  vs parent “{verses[verse.parentId!]?.name}”: {fmtPct(parentF.ensembleProbability)} →{" "}
                  <span className={f.ensembleProbability - parentF.ensembleProbability >= 0 ? "text-up" : "text-down"}>
                    {f.ensembleProbability - parentF.ensembleProbability >= 0 ? "+" : "−"}
                    {Math.abs((f.ensembleProbability - parentF.ensembleProbability) * 100).toFixed(0)}pp
                  </span>
                </p>
              )}
              {f && (f.modelOutputs.some((r) => finalProbability(r) !== null) ? <div className="mt-3"><RangeTrack forecast={f} onPick={(r) => useUI.getState().set({ inspectRole: r })} /></div> : null)}
              {analyzing && <AnalysisProgress f={f!} />}
              {f?.status === "failed" && (
                <div className="mt-3 rounded-md border border-down/30 bg-down/[0.04] p-2.5 text-[11px] text-down" role="alert">
                  {f.error ?? "The analysis failed."} No estimate is shown rather than an invented one.
                  <button className="btn mt-2 !h-7 !text-[11px]" onClick={() => requestForecast(currentVerseId, target, { force: true })}>
                    <RotateCw size={11} /> Retry analysis
                  </button>
                </div>
              )}
              {!f && phase === "idle" && (
                <div className="mt-3 rounded-md border border-line bg-black/20 p-3">
                  <p className="text-[11.5px] leading-relaxed text-ink-2">
                    {isOrigin
                      ? `Origin is reality as it stands — no assumptions. ${baseline?.kind === "MARKET" ? "The market price is the reference." : "Run the analysts once to get an unconditional reference estimate."}`
                      : `This world hasn't been analysed for “${events[target.eventId]?.title ?? "this target"}” yet. A forecast for one target never transfers to another.`}
                  </p>
                  <button className="btn mt-2.5 !h-7 !text-[11px]" onClick={() => requestForecast(currentVerseId, target)} data-testid="analyze-world">
                    <GitFork size={12} className="text-accent" /> Analyse {isOrigin ? "Origin" : "this world"}
                  </button>
                </div>
              )}
              {f && isTerminal(f) && f.modelOutputs.length > 0 && <AnalystRows f={f} />}
              {f && !isTerminal(f) && f.modelOutputs.some((r) => r.status === "done") && <AnalystRows f={f} />}
              {f && <DisagreementCallout f={f} />}
              {f && isTerminal(f) && (
                <p className="num mt-2 text-[9.5px] leading-relaxed text-ink-3">
                  {f.aggregation} · {f.engine === "demo" ? "demonstration fixtures" : `generated ${new Date(f.generatedAt).toLocaleString()}`}
                </p>
              )}
              {mode === "markets" && <MarketContext />}
              <NextFork verseId={currentVerseId} />
              {f && <Sources f={f} />}
              <Onchain />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
