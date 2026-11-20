"use client";
import { useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Forecast, ForkEvent } from "@/lib/domain/types";
import { fmtPct } from "@/lib/domain/market";
import { KindTag } from "@/components/ui/tags";

type Range = "1D" | "1W" | "1M" | "ALL";
const RANGES: Range[] = ["1D", "1W", "1M", "ALL"];

interface History {
  ok: boolean;
  error?: string;
  symbol?: string;
  timeframe?: string;
  inverted?: boolean;
  points?: { t: number; p: number; v: number }[];
  fetchedAt?: string;
}

const W = 300;
const H = 96;
const PAD = { l: 2, r: 34, t: 8, b: 14 };

function fmtTime(t: number, range: Range) {
  const d = new Date(t);
  return range === "1D" ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric", ...(range === "ALL" ? { year: "2-digit" } : {}) });
}

/**
 * Odds over time for a live Gemini target — observed contract closes (MARKET),
 * with this Verse's model estimate overlaid as a dashed line so the gap between
 * the crowd and the analysts is visible at a glance. Nothing is interpolated:
 * the line connects the candles Gemini returned, and gaps in trading stay flat
 * only because Gemini reports flat candles.
 */
export function OddsHistory({ event, outcome, forecast, isOrigin }: { event: ForkEvent; outcome: string; forecast: Forecast | null; isOrigin: boolean }) {
  const [range, setRange] = useState<Range>("1M");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gid = useId();
  const ticker = event.externalMarketId;
  const q = useQuery<History>({
    queryKey: ["history", ticker, outcome, range],
    enabled: !!ticker,
    staleTime: 60_000,
    refetchInterval: range === "1D" ? 60_000 : false,
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/history?${new URLSearchParams({ ticker: ticker!, outcome, range })}`, { signal });
      return r.json();
    },
  });

  const pts = useMemo(() => q.data?.points ?? [], [q.data]);
  const model = forecast?.kind === "MODEL" && forecast.ensembleProbability != null ? forecast.ensembleProbability : null;

  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const vals = pts.map((p) => p.p).concat(model != null ? [model] : []);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const padV = Math.max(0.02, (hi - lo) * 0.15);
    lo = Math.max(0, lo - padV);
    hi = Math.min(1, hi + padV);
    const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (p: number) => PAD.t + (1 - (p - lo) / Math.max(1e-6, hi - lo)) * (H - PAD.t - PAD.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join("");
    const area = `${line}L${x(t1).toFixed(1)},${H - PAD.b}L${x(t0).toFixed(1)},${H - PAD.b}Z`;
    return { x, y, line, area, lo, hi, t0, t1 };
  }, [pts, model]);

  if (!ticker) return null;
  const first = pts[0]?.p ?? null;
  const last = pts[pts.length - 1]?.p ?? null;
  const change = first != null && last != null ? last - first : null;
  const hp = hover != null ? pts[hover] : null;
  // compare against the same market reference the rest of the app uses (bid/ask mid at analysis time),
  // falling back to the last traded close only when no observed baseline exists
  const ref = forecast?.baselineKind === "MARKET" && forecast.baselineProbability != null ? { p: forecast.baselineProbability, label: "market mid" } : last != null ? { p: last, label: "last trade" } : null;
  const gap = model != null && ref ? model - ref.p : null;

  const onMove = (e: React.PointerEvent) => {
    if (!geo || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(geo.x(p.t) - sx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div className="mt-3 rounded-md border border-line bg-black/20 p-2.5" data-testid="odds-history">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-ink">
          Odds over time <KindTag kind="MARKET" small />
        </span>
        <div className="seg !h-6" role="radiogroup" aria-label="History range">
          {RANGES.map((r) => (
            <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={`!h-5 !px-1.5 !text-[9.5px] ${range === r ? "bg-white/[0.08]" : ""}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="num mt-1.5 flex items-baseline gap-2 text-[10.5px]">
        <span className="text-market">{hp ? fmtPct(hp.p) : last != null ? fmtPct(last) : "—"}</span>
        <span className="text-ink-3">{hp ? fmtTime(hp.t, range) : `${outcome} · last trade`}</span>
        {!hp && change != null && (
          <span className={`ml-auto ${change > 0.0005 ? "text-up" : change < -0.0005 ? "text-down" : "text-ink-3"}`}>
            {change >= 0 ? "+" : "−"}
            {Math.abs(change * 100).toFixed(1)}pp / {range}
          </span>
        )}
      </div>

      <div className="relative mt-1">
        {q.isLoading ? (
          <div className="flex h-[96px] items-center justify-center text-[10.5px] text-ink-3">
            <Loader2 size={12} className="mr-1.5 animate-spin" /> Loading Gemini candles…
          </div>
        ) : !q.data?.ok ? (
          <div className="flex h-[96px] items-center justify-center px-3 text-center text-[10.5px] text-ink-3">No price history available{q.data?.error ? ` (${q.data.error})` : ""}. Nothing is drawn rather than an invented line.</div>
        ) : !geo ? (
          <div className="flex h-[96px] items-center justify-center text-[10.5px] text-ink-3">Not enough trading in this range to draw a line.</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-[96px] w-full touch-none" preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${outcome} market price over ${range}: from ${first != null ? fmtPct(first) : "—"} to ${last != null ? fmtPct(last) : "—"}`}>
            <defs>
              <linearGradient id={`${gid}-fill`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--market)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--market)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[geo.lo, (geo.lo + geo.hi) / 2, geo.hi].map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <text x={W - PAD.r + 4} y={geo.y(v) + 3} fontSize="8" fill="var(--text-3)" className="num">
                  {(v * 100).toFixed(0)}%
                </text>
              </g>
            ))}
            <path d={geo.area} fill={`url(#${gid}-fill)`} />
            <path d={geo.line} fill="none" stroke="var(--market)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {model != null && (
              <g>
                <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(model)} y2={geo.y(model)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                <text x={W - PAD.r + 4} y={geo.y(model) + 3} fontSize="8" fill="var(--accent)" className="num">
                  {(model * 100).toFixed(0)}%
                </text>
              </g>
            )}
            {hp && (
              <g>
                <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-3)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
                <circle cx={geo.x(hp.t)} cy={geo.y(hp.p)} r="2.4" fill="var(--market)" />
              </g>
            )}
            <text x={PAD.l} y={H - 3} fontSize="8" fill="var(--text-3)">
              {fmtTime(geo.t0, range)}
            </text>
            <text x={W - PAD.r} y={H - 3} fontSize="8" fill="var(--text-3)" textAnchor="end">
              {fmtTime(geo.t1, range)}
            </text>
          </svg>
        )}
      </div>

      {gap != null && (
        <div className="mt-2 flex items-start gap-2 border-t border-line pt-2 text-[10.5px] leading-snug" data-testid="market-model-gap">
          <span className="mt-[3px] h-px w-4 shrink-0 border-t border-dashed border-accent" aria-hidden />
          <span className="text-ink-2">
            {isOrigin ? "Analysts vs market" : "This world vs today’s market"}:{" "}
            <span className={`num ${Math.abs(gap) < 0.02 ? "text-ink" : gap > 0 ? "text-up" : "text-down"}`}>
              {fmtPct(model!)} vs {ref!.label} {fmtPct(ref!.p)} ({gap >= 0 ? "+" : "−"}
              {Math.abs(gap * 100).toFixed(0)}pp)
            </span>
            <span className="block text-ink-3">
              {isOrigin
                ? Math.abs(gap) < 0.02
                  ? "The analysts broadly agree with the crowd."
                  : `The analysts think the market ${gap > 0 ? "underprices" : "overprices"} this outcome. A model estimate, not a trading signal.`
                : "How far this Verse’s assumptions move the outcome away from what the market prices today."}
            </span>
          </span>
        </div>
      )}
      <p className="num mt-1.5 text-[9px] text-ink-3">
        Gemini {q.data?.symbol ?? ""} · {q.data?.timeframe ?? ""} candle closes (traded prices){q.data?.inverted ? " · NO = 1 − YES" : ""}
      </p>
    </div>
  );
}
