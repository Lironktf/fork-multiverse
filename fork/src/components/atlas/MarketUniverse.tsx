"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Network, RefreshCw } from "lucide-react";
import { useLiveEvents } from "@/lib/client/search";
import { CATEGORY_LABEL } from "@/lib/client/search";
import { fmtPct, fmtUsd, observedProbability } from "@/lib/domain/market";
import { marketFreshness } from "@/lib/domain/atlas";
import type { ForkEvent } from "@/lib/domain/types";
import { AtlasCanvas } from "./AtlasCanvas";

const accents = ["#7cd6ff", "#9ca8ff", "#6be3ca", "#b7a5ff", "#8ebcff"];

export function MarketUniverse({ onMarket, onTopic }: { onMarket: (market: ForkEvent) => void; onTopic: (topic: string, markets: ForkEvent[], catalog: ForkEvent[]) => void }) {
  const [full, setFull] = useState(false);
  const curated = useLiveEvents("", true, "atlas");
  const catalog = useLiveEvents("", full, "atlas-full");
  const live = full ? catalog : curated;
  const data = live.data ?? curated.data;
  const [category, setCategory] = useState("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [limit, setLimit] = useState(18);
  const [selected, setSelected] = useState<string | undefined>();
  const section = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(1050);
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const columns = width >= 910 ? 3 : width >= 620 ? 2 : 1;
  const canvasWidth = Math.max(310, Math.min(1050, width));
  const gap = canvasWidth / columns;
  const categories = useMemo(() => {
    const groups = new Map<string, ForkEvent[]>();
    for (const market of new Map((data?.events ?? []).map((event) => [event.id, event])).values()) {
      const label = market.category === "other" ? market.metadata.sourceCategory ?? "Other" : CATEGORY_LABEL[market.category];
      const group = groups.get(label) ?? [];
      group.push(market);
      groups.set(label, group);
    }
    for (const group of groups.values()) group.sort((a, b) => (b.metadata.volumeUsd ?? 0) - (a.metadata.volumeUsd ?? 0));
    return [...groups].sort((a, b) => (b[1][0]?.metadata.volumeUsd ?? 0) - (a[1][0]?.metadata.volumeUsd ?? 0));
  }, [data?.events]);
  const visible = categories.filter(([key]) => category === "all" || key === category);
  const failed = live.isError || live.data?.ok === false;
  const noMarkets = !live.isFetching && !categories.length;
  const snapshot = data?.fetchedAt;
  const cards = visible.map(([key, markets], index) => ({
    key, markets, color: accents[index % accents.length],
    x: visible.length === 1 ? (canvasWidth - 270) / 2 : (gap - 270) / 2 + (index % columns) * gap,
    y: 58 + Math.floor(index / columns) * 320 + (index % columns === 1 ? 38 : 0),
  }));
  const canvasHeight = Math.max(500, Math.ceil(cards.length / columns) * 320 + 100 + (expanded.length ? 330 : 0));
  const details = categories.flatMap(([, markets]) => markets).find((market) => market.id === selected);

  return <section ref={section} aria-label="Gemini market universe" className="surface overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="font-medium">Market universe</h2>
        <p className="text-xs text-ink-2">{categories.length ? `${categories.reduce((sum, [, markets]) => sum + markets.length, 0)} active Gemini events across ${categories.length} topics` : "Active Gemini prediction markets"}</p>
      </div>
      <div className="flex items-center gap-2">
        <select aria-label="Filter market topics" className="ibtn bg-bg" value={category} onChange={(event) => { setCategory(event.target.value); setExpanded([]); }}>
          <option value="all">All topics</option>
          {categories.map(([key]) => <option key={key} value={key}>{key}</option>)}
        </select>
        <button type="button" className="ibtn" aria-pressed={full} onClick={() => {
          setFull(!full);
          setCategory("all");
          setExpanded([]);
        }}>{full ? "Curated markets" : "Browse all topics"}</button>
        <button type="button" className="ibtn" onClick={() => void live.refetch()} disabled={live.isFetching}><RefreshCw size={13} /> Refresh markets</button>
      </div>
    </header>
    {categories.length ? <AtlasCanvas width={canvasWidth} height={canvasHeight} label="Scrollable market constellation">
      <svg width={canvasWidth} height={canvasHeight} className="absolute inset-0" aria-hidden="true">
        {cards.map(({ key, x, y, color }) => <path key={key} d={`M ${canvasWidth / 2} 22 Q ${x + 140} 26 ${x + 140} ${y + 14}`} stroke={color} opacity=".24" fill="none" strokeDasharray="3 5" />)}
        <circle cx={canvasWidth / 2} cy={22} r={4} fill="var(--accent)" />
      </svg>
      {cards.map(({ key, markets, color, x, y }) => {
        const open = expanded.includes(key);
        const preview = markets.slice(0, open ? limit : 3);
        return <div key={key} className="absolute w-[270px]" style={{ left: x, top: y }}>
          <div className="surface flex h-9" style={{ borderColor: color }}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left" style={{ color }}
              disabled={!markets.some((market) => market.possibleOutcomes.length)}
              onClick={() => onTopic(key, markets, data?.events ?? [])}>
              <Network size={14} /> {key} <ArrowRight size={13} className="ml-auto" />
            </button>
            <button type="button" aria-label={`Browse ${key} markets`} aria-expanded={open} className="border-l border-line px-2 text-xs text-ink-2"
              onClick={() => { setExpanded(open ? [] : [key]); setLimit(18); }}>{markets.length} <ChevronDown size={12} className="inline" /></button>
          </div>
          <div className={`ml-4 mt-1 space-y-1.5 border-l pl-3 ${open ? "max-h-[240px] overflow-auto" : ""}`} style={{ borderColor: color }}>
            {preview.map((market) => {
              const odds = market.possibleOutcomes.map((outcome) => ({ outcome, quote: observedProbability(market, outcome) })).find(({ quote }) => quote);
              return <button type="button" key={market.id} onFocus={() => setSelected(market.id)} onMouseEnter={() => setSelected(market.id)}
                onClick={() => onMarket(market)} disabled={!market.possibleOutcomes.length} title={market.title}
                className="group relative block w-full rounded-lg border border-line-2 bg-elevated px-2.5 py-2 text-left hover:border-accent">
                <span className="absolute -left-[15px] top-1/2 h-1.5 w-1.5 rounded-full shadow-[0_0_10px_currentColor]" style={{ background: color, color }} />
                <span className="line-clamp-2 text-xs font-medium">{market.title}</span>
                <span className="mt-1 flex justify-between gap-2 text-[10px] text-ink-2">
                  <span className="truncate text-market">{odds?.quote ? `${odds.outcome} ${fmtPct(odds.quote.value, 1)}` : "Odds unavailable"}</span>
                  {market.metadata.volumeUsd != null && <span className="shrink-0">{fmtUsd(market.metadata.volumeUsd)} volume</span>}
                </span>
              </button>;
            })}
            {open && limit < markets.length && <button type="button" className="ibtn w-full" onClick={() => setLimit(limit + 18)}>Show more markets</button>}
          </div>
        </div>;
      })}
    </AtlasCanvas> : (
      <div className="atlas-canvas grid min-h-[340px] place-content-center px-5 text-center" role={failed ? "alert" : "status"}>
        <Network size={28} className="mx-auto mb-3 text-accent" />
        <p>{failed ? "Gemini markets are temporarily unavailable." : noMarkets ? "Gemini returned no active markets." : "Loading the Gemini market universe…"}</p>
        {(failed || noMarkets) && <button type="button" className="ibtn mx-auto mt-3" onClick={() => void live.refetch()}>Retry</button>}
      </div>
    )}
    <footer className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-ink-2">
      <span>{details ? `${details.title} · ${details.possibleOutcomes.length} outcomes` : "Topic lines group markets by category. Select a market to see possible outcomes."}</span>
      {snapshot && <span>{full && live.isFetching ? "Loading more topics · " : ""}{failed || data?.partial ? "Incomplete market coverage · " : ""}{marketFreshness(snapshot)} · <time dateTime={snapshot}>{new Date(snapshot).toLocaleString()}</time></span>}
    </footer>
  </section>;
}
