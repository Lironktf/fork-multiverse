"use client";
import { memo } from "react";
import { AlertTriangle, X } from "lucide-react";
import { MODEL_ROLES } from "@/lib/domain/types";
import { fmtPct, observedProbability } from "@/lib/domain/market";
import { finalProbability } from "@/lib/forecast/aggregate";
import type { NodeMeta } from "./model";
import { KindTag, SourceTag } from "@/components/ui/tags";

const R_TARGET = 64;

/** Probability dial: arc = current estimate, tick = baseline. Pure geometry, drawn in code. */
function Dial({ p, base, hue, analyzing }: { p: number | null; base: number | null; hue: number; analyzing: boolean }) {
  const r = R_TARGET - 3;
  const C = 2 * Math.PI * r;
  const tick = (v: number) => {
    const a = -Math.PI / 2 + v * Math.PI * 2;
    return { x1: R_TARGET + Math.cos(a) * (r - 7), y1: R_TARGET + Math.sin(a) * (r - 7), x2: R_TARGET + Math.cos(a) * (r + 6), y2: R_TARGET + Math.sin(a) * (r + 6) };
  };
  const b = base !== null ? tick(base) : null;
  return (
    <svg width={R_TARGET * 2} height={R_TARGET * 2} className="absolute inset-0 overflow-visible" aria-hidden>
      <defs>
        <radialGradient id={`tg-${hue}`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={`hsla(${hue},70%,70%,0.10)`} />
          <stop offset="100%" stopColor="rgba(8,8,10,1)" />
        </radialGradient>
      </defs>
      <circle cx={R_TARGET} cy={R_TARGET} r={R_TARGET} fill={`url(#tg-${hue})`} />
      <circle cx={R_TARGET} cy={R_TARGET} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
      {analyzing && (
        <circle
          cx={R_TARGET}
          cy={R_TARGET}
          r={r + 9}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.45}
          strokeWidth={1}
          strokeDasharray="2 10"
          className="origin-center animate-[spin_9s_linear_infinite]"
          style={{ transformOrigin: `${R_TARGET}px ${R_TARGET}px` }}
        />
      )}
      {p !== null && (
        <circle
          cx={R_TARGET}
          cy={R_TARGET}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={`${C * p} ${C}`}
          transform={`rotate(-90 ${R_TARGET} ${R_TARGET})`}
          style={{ transition: "stroke-dasharray 1.1s cubic-bezier(0.22,1,0.36,1)", filter: "drop-shadow(0 0 6px rgba(124,214,255,0.45))" }}
        />
      )}
      {b && <line {...b} stroke="var(--market)" strokeOpacity={0.85} strokeWidth={1.5} />}
    </svg>
  );
}

function TargetNode({ meta }: { meta: Extract<NodeMeta, { kind: "target" }> }) {
  const f = meta.forecast;
  const observed = observedProbability(meta.event, meta.outcome);
  const p = f?.ensembleProbability ?? null;
  const observedOk = observed && !(f?.kind === "MODEL" && observed.kind === "DEMO") ? observed : null;
  const base = f?.baselineProbability ?? observedOk?.value ?? null;
  const shown = p ?? base;
  const analyzing = !!f && !["complete", "partial", "failed"].includes(f.status);
  const done = f?.modelOutputs.filter((r) => r.status === "done").length ?? 0;
  const kind = p !== null ? f!.kind : (f?.baselineKind ?? observedOk?.kind ?? (f ? f.kind : null));
  return (
    <div className="flex flex-col items-center" style={{ width: 260 }}>
      <div className="relative" style={{ width: R_TARGET * 2, height: R_TARGET * 2 }}>
        <Dial p={p} base={base} hue={meta.verse.visualMetadata.hue} analyzing={analyzing} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedPct value={shown} className="num text-[27px] font-medium leading-none text-ink" />
          <div className="mt-1.5 h-4">{kind && <KindTag kind={kind} small />}</div>
        </div>
      </div>
      <div className="glabel glabel-strong mt-3 text-center">
        <div className="clamp-2 text-[13px] font-medium leading-snug text-ink" style={{ maxWidth: 240 }}>
          {meta.event?.title ?? "Unknown target"}
        </div>
        <div className="mt-1 flex items-center justify-center gap-1.5">
          <span className="meta">resolves</span>
          <span className="num text-[10.5px] text-accent">{meta.outcome}</span>
          {analyzing && (
            <span className="meta text-accent/80">
              · {f!.status === "researching" ? "researching" : f!.status === "revising" ? "revising" : `analysts ${done}/4`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ForecastNode({ meta }: { meta: Extract<NodeMeta, { kind: "forecast" }> }) {
  const run = meta.forecast.modelOutputs.find((r) => r.role === meta.role)!;
  const p = finalProbability(run);
  const base = meta.forecast.baselineProbability;
  const outlier = meta.forecast.disagreementSummary?.outlierRole === meta.role;
  const pending = run.status === "queued" || run.status === "running";
  const delta = p !== null && base !== null ? p - base : null;
  return (
    <div className="flex flex-col items-center" style={{ width: 120 }}>
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: "#0a0a0c",
          border: `1px ${pending ? "dashed" : "solid"} ${outlier ? "rgba(232,194,122,0.7)" : "rgba(255,255,255,0.14)"}`,
          boxShadow: outlier ? "0 0 18px -4px rgba(232,194,122,0.5)" : undefined,
        }}
      >
        {run.status === "failed" ? (
          <X size={14} className="text-ink-3" aria-label="failed" />
        ) : p === null ? (
          <span className="num text-[11px] text-ink-3">{run.status === "running" ? "···" : "—"}</span>
        ) : (
          <span className="num text-[13px] text-ink">{fmtPct(p)}</span>
        )}
        <span className="num absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#050505] text-[9px] text-ink-2 ring-1 ring-white/10">
          {MODEL_ROLES[meta.role].short}
        </span>
      </div>
      <div className="glabel mt-1.5 text-center">
        <div className="text-[10.5px] text-ink-2">{MODEL_ROLES[meta.role].label}</div>
        {run.provider && run.provider !== "demo" && <div className="num text-[8.5px] uppercase tracking-[0.1em] text-ink-3">{run.provider}</div>}
        {delta !== null && (
          <div className={`num text-[10px] ${delta > 0.005 ? "text-up" : delta < -0.005 ? "text-down" : "text-ink-3"}`}>
            {delta >= 0 ? "+" : "−"}
            {Math.abs(delta * 100).toFixed(0)}pp
          </div>
        )}
      </div>
    </div>
  );
}

function DisagreementNode({ meta }: { meta: Extract<NodeMeta, { kind: "disagreement" }> }) {
  const d = meta.forecast.disagreementSummary!;
  return (
    <div className="flex flex-col items-center" style={{ width: 120 }}>
      <div className="flex h-9 w-9 items-center justify-center">
        <div className="h-6 w-6 rotate-45 border border-warn/70 bg-[#0c0b08]" style={{ boxShadow: "0 0 16px -4px rgba(232,194,122,0.6)" }} />
        <AlertTriangle size={11} className="absolute text-warn" aria-hidden />
      </div>
      <div className="glabel mt-1 text-center">
        <div className="meta text-warn/90">Disagreement</div>
        <div className="num text-[10.5px] text-ink-2">{(d.spread * 100).toFixed(0)}pp spread</div>
      </div>
    </div>
  );
}

function AssumptionNode({ meta }: { meta: Extract<NodeMeta, { kind: "assumption" }> }) {
  const isNew = meta.layer === "new";
  return (
    <div className="flex flex-col items-center" style={{ width: 168 }}>
      <div
        className="rounded-full"
        style={{
          width: 14,
          height: 14,
          background: isNew ? "var(--accent)" : "transparent",
          border: isNew ? "none" : "1.5px solid rgba(255,255,255,0.45)",
          boxShadow: isNew ? "0 0 0 4px rgba(124,214,255,0.12), 0 0 18px rgba(124,214,255,0.5)" : "0 0 0 4px rgba(5,5,5,0.9)",
        }}
      />
      <div className="glabel mt-2 text-center">
        <div className={`clamp-2 text-[11.5px] leading-snug ${isNew ? "text-ink" : "text-ink-2"}`}>{meta.event?.title ?? meta.eventId}</div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5">
          <span className={`num text-[10px] ${isNew ? "text-accent" : "text-ink-2"}`}>= {meta.outcome}</span>
          <span className="meta text-[8.5px]">{isNew ? "assumed here" : "inherited"}</span>
        </div>
      </div>
    </div>
  );
}

function PendingNode({ meta }: { meta: Extract<NodeMeta, { kind: "pending" }> }) {
  return (
    <div className="flex flex-col items-center" style={{ width: 168 }}>
      <div className="relative" style={{ width: 14, height: 14 }}>
        <div className="absolute inset-0 rounded-full border border-dashed border-accent/80" />
        <div className="absolute inset-[4px] rounded-full bg-accent/70 animate-pulse" />
      </div>
      <div className="glabel mt-2 text-center">
        <div className="clamp-2 text-[11.5px] leading-snug text-ink">{meta.event?.title ?? meta.eventId}</div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5">
          <span className="num text-[10px] text-accent">? {meta.outcome}</span>
          <span className="meta text-[8.5px]">in basket</span>
        </div>
      </div>
    </div>
  );
}

function EventNode({ meta }: { meta: Extract<NodeMeta, { kind: "event" }> }) {
  const obs = observedProbability(meta.event, meta.event.possibleOutcomes[0]);
  return (
    <div className="flex flex-col items-center" style={{ width: 150 }}>
      <div className="rounded-full border border-white/25 bg-[#09090b]" style={{ width: 9, height: 9, boxShadow: "0 0 0 4px rgba(5,5,5,0.9)" }} />
      <div className="glabel mt-2 text-center">
        <div className="clamp-2 text-[11px] leading-snug text-ink-3">{meta.event.title}</div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5">
          <SourceTag source={meta.event.source} small />
          {obs && meta.event.source === "gemini" && <span className="num text-[10px] text-market/80">{fmtPct(obs.value)}</span>}
        </div>
      </div>
    </div>
  );
}

function VerseNode({ meta, current }: { meta: Extract<NodeMeta, { kind: "verse" }>; current: boolean }) {
  const v = meta.verse;
  const p = meta.forecast?.ensembleProbability ?? null;
  const hue = v.visualMetadata.hue;
  const sig = v.visualMetadata.signature;
  // node signature: a small fixed constellation of ticks derived from the Verse id
  const ticks = [0, 1, 2].map((i) => ((sig >> (i * 5)) % 360) * (Math.PI / 180));
  return (
    <div className="flex flex-col items-center" style={{ width: 150 }}>
      <div className="relative" style={{ width: 46, height: 46 }}>
        <svg width={46} height={46} className="absolute inset-0 overflow-visible" aria-hidden>
          <circle cx={23} cy={23} r={22} fill="#09090b" stroke={`hsla(${hue},70%,72%,${meta.onPath ? 0.6 : 0.3})`} strokeWidth={1} />
          <circle cx={23} cy={23} r={7} fill={`hsla(${hue},75%,70%,${meta.onPath ? 0.9 : 0.55})`} style={{ filter: `drop-shadow(0 0 8px hsla(${hue},80%,70%,0.6))` }} />
          {ticks.map((a, i) => (
            <line key={i} x1={23 + Math.cos(a) * 13} y1={23 + Math.sin(a) * 13} x2={23 + Math.cos(a) * 18} y2={23 + Math.sin(a) * 18} stroke={`hsla(${hue},70%,75%,0.55)`} strokeWidth={1} />
          ))}
        </svg>
        <span className="num absolute -right-3 -top-1 text-[9px] text-ink-3">G{v.visualMetadata.generation}</span>
      </div>
      <div className="glabel glabel-strong mt-2 text-center">
        <div className={`text-[12px] font-medium ${current ? "text-accent" : "text-ink"}`}>{v.name}</div>
        <div className="num text-[10.5px] text-ink-2">{p !== null ? fmtPct(p) : <span className="text-ink-3">not forecast</span>}</div>
      </div>
    </div>
  );
}

export const GraphNodeBody = memo(function GraphNodeBody({ meta, current = false }: { meta: NodeMeta; current?: boolean }) {
  switch (meta.kind) {
    case "target":
      return <TargetNode meta={meta} />;
    case "forecast":
      return <ForecastNode meta={meta} />;
    case "disagreement":
      return <DisagreementNode meta={meta} />;
    case "assumption":
      return <AssumptionNode meta={meta} />;
    case "pending":
      return <PendingNode meta={meta} />;
    case "event":
      return <EventNode meta={meta} />;
    case "verse":
      return <VerseNode meta={meta} current={current} />;
  }
});

/* animated number — tweens only when a NEW value arrives (never fakes progress) */
import { useEffect, useRef, useState } from "react";
export function AnimatedPct({ value, className, digits = 0 }: { value: number | null; className?: string; digits?: number }) {
  const [shown, setShown] = useState<number | null>(value);
  const from = useRef<number | null>(value);
  useEffect(() => {
    if (value === null || from.current === null) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const b = value;
    if (a === b) return;
    const reduced = document.documentElement.dataset.reduced === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      from.current = b;
      setShown(b);
      return;
    }
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(a + (b - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = b;
    };
  }, [value]);
  return <span className={className}>{shown === null ? "—" : `${(shown * 100).toFixed(digits)}%`}</span>;
}
