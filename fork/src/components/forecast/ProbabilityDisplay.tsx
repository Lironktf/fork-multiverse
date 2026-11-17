"use client";
import { motion } from "motion/react";
import type { Forecast } from "@/lib/domain/types";
import { MODEL_ROLES } from "@/lib/domain/types";
import { fmtPct } from "@/lib/domain/market";
import { finalProbability } from "@/lib/forecast/aggregate";
import { AnimatedPct } from "@/components/graph/nodes";
import { KindTag } from "@/components/ui/tags";

/** Baseline → conditional, legible in one glance. */
export function ProbabilityDisplay({ forecast, baseline }: { forecast: Forecast | null; baseline: { value: number; kind: "MARKET" | "MODEL" | "DEMO"; label: string } | null }) {
  const p = forecast?.ensembleProbability ?? null;
  const base = forecast?.baselineProbability != null ? { value: forecast.baselineProbability, kind: forecast.baselineKind!, label: forecast.baselineLabel ?? "Baseline" } : baseline;
  const delta = p !== null && base ? p - base.value : null;
  return (
    <div className="grid grid-cols-[1fr_auto_1.25fr] items-end gap-3" data-testid="probability-display">
      <div>
        <div className="meta mb-1.5 flex items-center gap-1.5">{base?.label ?? "Baseline"}</div>
        <div className="num text-[22px] leading-none text-ink-2">{base ? fmtPct(base.value) : "—"}</div>
        <div className="mt-1.5">{base ? <KindTag kind={base.kind} small /> : <span className="text-[10px] text-ink-3">no market for this target</span>}</div>
      </div>
      <div className="pb-6 text-ink-3" aria-hidden>
        <svg width="28" height="10" viewBox="0 0 28 10">
          <path d="M0 5h25M21 1l4 4-4 4" stroke="currentColor" fill="none" strokeWidth="1" />
        </svg>
      </div>
      <div>
        <div className="meta mb-1.5">In this world</div>
        <div className="flex items-baseline gap-2">
          <AnimatedPct value={p} className="num text-[34px] font-medium leading-none text-ink" />
          {delta !== null && (
            <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} key={Math.round(delta * 100)} className={`num text-[13px] ${delta > 0.005 ? "text-up" : delta < -0.005 ? "text-down" : "text-ink-3"}`} data-testid="delta">
              {delta >= 0 ? "+" : "−"}
              {Math.abs(delta * 100).toFixed(0)}pp
            </motion.span>
          )}
        </div>
        <div className="mt-1.5">{forecast ? <KindTag kind={forecast.kind} small /> : <span className="text-[10px] text-ink-3">not yet analysed</span>}</div>
      </div>
    </div>
  );
}

/** Min–max band of analyst outputs on a 0–100 track, with baseline tick and ensemble marker. */
export function RangeTrack({ forecast, onPick }: { forecast: Forecast; onPick?: (role: string) => void }) {
  const runs = forecast.modelOutputs.filter((r) => finalProbability(r) !== null);
  const dis = forecast.disagreementSummary;
  const base = forecast.baselineProbability;
  const ens = forecast.ensembleProbability;
  return (
    <div className="mt-1">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-[18px] h-px bg-white/10" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <div key={t} className="absolute top-[15px] h-[7px] w-px bg-white/10" style={{ left: `${t * 100}%` }} />
        ))}
        {dis && (
          <motion.div
            className="absolute top-[15px] h-[7px] rounded-full bg-accent/15 ring-1 ring-accent/25"
            initial={false}
            animate={{ left: `${dis.min * 100}%`, width: `${Math.max(0.6, (dis.max - dis.min) * 100)}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 24 }}
          />
        )}
        {base !== null && (
          <div className="absolute top-[9px] flex flex-col items-center" style={{ left: `${base * 100}%`, transform: "translateX(-50%)" }} title={`Baseline ${fmtPct(base)}`}>
            <div className="h-[19px] w-[1.5px] bg-market/80" />
          </div>
        )}
        {runs.map((r) => {
          const p = finalProbability(r)!;
          const outlier = dis?.outlierRole === r.role;
          return (
            <motion.button
              key={r.role}
              onClick={() => onPick?.(r.role)}
              initial={false}
              animate={{ left: `${p * 100}%` }}
              transition={{ type: "spring", stiffness: 160, damping: 22 }}
              className={`num absolute top-[10px] flex h-[17px] w-[17px] -translate-x-1/2 items-center justify-center rounded-full border text-[8.5px] transition-colors ${
                outlier ? "border-warn/80 bg-[#14110a] text-warn" : "border-white/25 bg-[#0b0b0d] text-ink-2 hover:border-accent hover:text-accent"
              }`}
              aria-label={`${MODEL_ROLES[r.role].label} analyst: ${fmtPct(p)}`}
            >
              {MODEL_ROLES[r.role].short}
            </motion.button>
          );
        })}
        {ens !== null && (
          <motion.div initial={false} animate={{ left: `${ens * 100}%` }} transition={{ type: "spring", stiffness: 160, damping: 24 }} className="absolute top-[30px] -translate-x-1/2" aria-hidden>
            <div className="h-0 w-0 border-x-[4px] border-b-[5px] border-x-transparent border-b-accent" />
          </motion.div>
        )}
      </div>
      <div className="flex justify-between">
        <span className="num text-[9px] text-ink-3">0</span>
        <span className="num text-[9px] text-ink-3">100</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-ink-3">
        {dis ? (
          <>
            <span className="num text-ink-2">
              {fmtPct(dis.min)}–{fmtPct(dis.max)}
            </span>{" "}
            model range — the spread of analyst outputs, not a confidence interval.{" "}
            <span className="text-market/80">│</span> baseline <span className="text-accent">▲</span> ensemble
          </>
        ) : (
          "The range appears once two or more analysts return."
        )}
      </p>
    </div>
  );
}
