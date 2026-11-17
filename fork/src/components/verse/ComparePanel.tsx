"use client";
import { useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { GitBranch, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import { ancestry, cumulativeAssumptions } from "@/lib/domain/verse";
import { fmtPct } from "@/lib/domain/market";
import { MODEL_ROLES } from "@/lib/domain/types";
import type { Forecast, Verse } from "@/lib/domain/types";
import { finalProbability } from "@/lib/forecast/aggregate";
import { KindTag } from "@/components/ui/tags";
import { requestForecast } from "@/lib/client/actions";

function VersePick({ value, onChange, exclude }: { value: string | undefined; onChange: (v: string) => void; exclude?: string }) {
  const verses = useUniverse((s) => s.verses);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-7 max-w-[200px] rounded-md border border-line bg-[#0d0d0f] px-2 text-[12px] text-ink" aria-label="Choose Verse">
      <option value="" disabled>
        Choose a Verse
      </option>
      {Object.values(verses)
        .filter((v) => v.id !== exclude)
        .map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} (G{v.visualMetadata.generation})
          </option>
        ))}
    </select>
  );
}

function Side({ v, f, align, onAnalyse }: { v: Verse; f: Forecast | null; align: "left" | "right"; onAnalyse: () => void }) {
  const p = f?.ensembleProbability ?? null;
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start"}`}>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${v.visualMetadata.hue} 75% 70%)` }} />
        <span className="text-[15px] font-medium text-ink">{v.name}</span>
        <span className="num text-[10px] text-ink-3">G{v.visualMetadata.generation}</span>
      </span>
      <span className="num mt-2 text-[56px] font-medium leading-none tracking-tight text-ink">{p !== null ? fmtPct(p) : "—"}</span>
      <span className="mt-2 flex items-center gap-2">
        {f ? <KindTag kind={f.kind} small /> : null}
        {f?.disagreementSummary && <span className="num text-[10.5px] text-ink-3">models {fmtPct(f.disagreementSummary.min)}–{fmtPct(f.disagreementSummary.max)}</span>}
      </span>
      {!f && (
        <button className="btn mt-2 !h-7 !text-[11px]" onClick={onAnalyse}>
          Analyse for this target
        </button>
      )}
      {f && f.status !== "complete" && f.status !== "partial" && f.status !== "failed" && <span className="mt-2 text-[11px] text-accent/80">analysis in progress</span>}
    </div>
  );
}

export function ComparePanel() {
  const { compare, verses, target, forecasts, forecastIndex, events, current } = useUniverse(
    useShallow((s) => ({ compare: s.compare, verses: s.verses, target: s.target, forecasts: s.forecasts, forecastIndex: s.forecastIndex, events: s.events, current: s.currentVerseId })),
  );
  const close = () => useUI.getState().set({ panel: null });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // sensible defaults: current Verse and its parent/sibling
  const [aId, bId] = useMemo(() => {
    const a = compare[0] ?? current;
    const b = compare[1] ?? Object.values(verses).find((v) => v.id !== a && v.id !== "origin")?.id ?? Object.values(verses).find((v) => v.id !== a)?.id;
    return [a, b];
  }, [compare, current, verses]);
  const A = verses[aId];
  const B = bId ? verses[bId] : undefined;
  const fa = A ? forecastFor({ forecasts, forecastIndex }, A.id, target) : null;
  const fb = B ? forecastFor({ forecasts, forecastIndex }, B.id, target) : null;

  const diff = useMemo(() => {
    if (!A || !B) return null;
    const ma = new Map(cumulativeAssumptions(A).map((x) => [x.eventId, x.selectedOutcome]));
    const mb = new Map(cumulativeAssumptions(B).map((x) => [x.eventId, x.selectedOutcome]));
    const shared: string[] = [];
    const contested: string[] = [];
    const onlyA: string[] = [];
    const onlyB: string[] = [];
    for (const [k, o] of ma) {
      if (!mb.has(k)) onlyA.push(k);
      else if (mb.get(k) === o) shared.push(k);
      else contested.push(k);
    }
    for (const k of mb.keys()) if (!ma.has(k)) onlyB.push(k);
    const pa = ancestry(verses, A.id).map((v) => v.id);
    const pb = new Set(ancestry(verses, B.id).map((v) => v.id));
    const common = [...pa].reverse().find((id) => pb.has(id));
    return { ma, mb, shared, contested, onlyA, onlyB, common: common ? verses[common] : null };
  }, [A, B, verses]);

  const pa = fa?.ensembleProbability ?? null;
  const pb = fb?.ensembleProbability ?? null;
  const gap = pa !== null && pb !== null ? pb - pa : null;

  const title = (id: string) => events[id]?.title ?? id;

  return (
    <motion.div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#050505]/80 p-4 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
      <motion.div
        role="dialog"
        aria-label="Compare Verses"
        className="surface relative flex max-h-[92vh] w-[min(1080px,100%)] flex-col overflow-hidden"
        initial={{ scale: 0.97, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="compare-panel"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="text-[13px] font-medium text-ink">Compare worlds</h2>
          <span className="truncate text-[11px] text-ink-3">
            Target: {events[target.eventId]?.title} · {target.outcome}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <VersePick value={aId} exclude={bId} onChange={(v) => useUniverse.getState().setCompare([v, bId!].filter(Boolean))} />
            <span className="text-[11px] text-ink-3">vs</span>
            <VersePick value={bId} exclude={aId} onChange={(v) => useUniverse.getState().setCompare([aId, v])} />
            <button className="ibtn" onClick={close} aria-label="Close comparison">
              <X size={14} />
            </button>
          </div>
        </header>
        {!A || !B ? (
          <div className="p-10 text-center text-[12px] text-ink-3">Create at least two Verses to compare them.</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* the divergence */}
            <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-8 pb-6 pt-8">
              <Side v={A} f={fa} align="left" onAnalyse={() => requestForecast(A.id, target)} />
              <div className="flex flex-col items-center">
                <div className="relative h-[150px] w-[64px]">
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
                  {[0, 0.5, 1].map((t) => (
                    <span key={t} className="num absolute left-[calc(50%+8px)] -translate-y-1/2 text-[8.5px] text-ink-3" style={{ top: `${(1 - t) * 100}%` }}>
                      {t * 100}
                    </span>
                  ))}
                  {pa !== null && pb !== null && (
                    <motion.div
                      className="absolute left-1/2 w-[3px] -translate-x-1/2 rounded-full"
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        top: `${(1 - Math.max(pa, pb)) * 100}%`,
                        height: `${Math.abs(pa - pb) * 100}%`,
                        background: "linear-gradient(180deg, var(--accent), rgba(124,214,255,0.25))",
                        boxShadow: "0 0 16px rgba(124,214,255,0.5)",
                      }}
                    />
                  )}
                  {pa !== null && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="num absolute right-[calc(50%+8px)] -translate-y-1/2 text-[10px] text-ink-2" style={{ top: `${(1 - pa) * 100}%` }}>A ●</motion.span>}
                  {pb !== null && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="num absolute right-[calc(50%+8px)] -translate-y-1/2 text-[10px] text-ink-2" style={{ top: `${(1 - pb) * 100}%` }}>B ●</motion.span>}
                </div>
                <div className="mt-3 text-center">
                  <div className={`num text-[22px] ${gap === null ? "text-ink-3" : "text-accent"}`}>{gap === null ? "—" : `${Math.abs(gap * 100).toFixed(0)}pp`}</div>
                  <div className="meta mt-0.5">apart</div>
                </div>
              </div>
              <Side v={B} f={fb} align="right" onAnalyse={() => requestForecast(B.id, target)} />
            </div>

            {diff && (
              <div className="border-t border-line px-6 py-5">
                <div className="mb-3 flex items-center gap-2 text-[11.5px] text-ink-2">
                  <GitBranch size={13} className="text-accent" aria-hidden />
                  {diff.common ? (
                    <span>
                      The worlds share ancestry up to <span className="text-ink">{diff.common.name}</span>; everything below is where they diverge.
                    </span>
                  ) : (
                    <span>No common ancestor.</span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Column title={`Only in ${A.name}`} accent items={diff.onlyA.map((id) => ({ id, t: title(id), o: diff.ma.get(id)! }))} />
                  <div className="rounded-md border border-line bg-black/20 p-3">
                    <div className="meta mb-2">Shared · {diff.shared.length}</div>
                    {diff.contested.map((id) => (
                      <div key={id} className="mb-2 rounded border border-warn/30 bg-warn/[0.04] p-2 text-[11.5px]">
                        <div className="text-ink">{title(id)}</div>
                        <div className="num mt-1 flex justify-between text-[10.5px] text-warn">
                          <span>A: {diff.ma.get(id)}</span>
                          <span>B: {diff.mb.get(id)}</span>
                        </div>
                      </div>
                    ))}
                    {diff.shared.length === 0 && diff.contested.length === 0 && <p className="text-[11px] text-ink-3">No assumptions in common.</p>}
                    <ul className="flex flex-col gap-1">
                      {diff.shared.map((id) => (
                        <li key={id} className="flex justify-between gap-2 text-[11.5px] text-ink-2">
                          <span className="truncate">{title(id)}</span>
                          <span className="num text-[10.5px] text-ink-3">{diff.ma.get(id)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Column title={`Only in ${B.name}`} accent items={diff.onlyB.map((id) => ({ id, t: title(id), o: diff.mb.get(id)! }))} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 border-t border-line px-6 py-5 md:grid-cols-2">
              {[
                { v: A, f: fa },
                { v: B, f: fb },
              ].map(({ v, f }) => (
                <div key={v.id}>
                  <div className="meta mb-2">Why {v.name} reads {f?.ensembleProbability != null ? fmtPct(f.ensembleProbability) : "—"}</div>
                  {f ? (
                    <ul className="flex flex-col gap-2">
                      {f.modelOutputs.map((r) => (
                        <li key={r.role} className="flex gap-2.5 text-[11.5px]">
                          <span className={`num mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[8.5px] ${f.disagreementSummary?.outlierRole === r.role ? "border-warn/70 text-warn" : "border-white/15 text-ink-3"}`}>{MODEL_ROLES[r.role].short}</span>
                          <span className="flex-1 leading-snug text-ink-2">{r.output?.headline ?? (r.status === "failed" ? "No output (failed)." : "Pending.")}</span>
                          <span className="num text-ink">{fmtPct(finalProbability(r))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-ink-3">Not analysed for this target.</p>
                  )}
                </div>
              ))}
            </div>
            <p className="border-t border-line px-6 py-3 text-[10.5px] leading-relaxed text-ink-3">
              The gap is the difference between two model outputs under different assumptions. It is not a causally identified effect of those assumptions, and the analysts are not independent.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Column({ title, items, accent }: { title: string; items: { id: string; t: string; o: string }[]; accent?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${accent ? "border-accent/25 bg-accent/[0.03]" : "border-line"}`}>
      <div className="meta mb-2 text-accent/80">{title} · {items.length}</div>
      {items.length === 0 && <p className="text-[11px] text-ink-3">Nothing unique.</p>}
      <ul className="flex flex-col gap-1.5">
        {items.map((i, idx) => (
          <motion.li key={i.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + idx * 0.05 }} className="flex justify-between gap-2 text-[11.5px] text-ink">
            <span>{i.t}</span>
            <span className="num shrink-0 text-[10.5px] text-accent">{i.o}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
