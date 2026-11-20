"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, GitFork, Network, Search, X } from "lucide-react";
import { Wordmark } from "@/components/hud/TopLeft";
import { useQuery } from "@tanstack/react-query";
import { useUniverse } from "@/store/universe";
import { useDebounced, useLiveEvents } from "@/lib/client/search";
import { fmtPct, fmtUsd, observedProbability } from "@/lib/domain/market";
import { chainScenario, diverseMarketLinks, marketFreshness, marketLinks, pairKey, selectedMarketEdges, type AtlasPremise, type AtlasScenario, type MarketEdge, type MarketLink } from "@/lib/domain/atlas";
import type { ForkEvent } from "@/lib/domain/types";
import { AtlasCanvas } from "./AtlasCanvas";
import { MarketUniverse } from "./MarketUniverse";

const MAX_CHAIN = 8;

function quoteLabel(event: ForkEvent, outcome: string) {
  const quote = observedProbability(event, outcome);
  return quote ? `${fmtPct(quote.value, 1)} Gemini odds` : "Odds unavailable";
}

function ChainMap({ chain, edges, links, focus, assumptionIds, targetId, select, follow }: {
  chain: AtlasPremise[]; edges: MarketEdge[]; links: MarketLink[]; focus: number; assumptionIds: string[]; targetId?: string; select: (index: number) => void; follow: (link: MarketLink) => void;
}) {
  const x = (index: number) => 24 + index * 258;
  const tail = chain.length - 1;
  const width = x(tail + (links.length ? 2 : 1));
  const height = Math.max(440, links.length * 88 + 42);
  const center = height / 2;
  const linkY = (index: number) => center + (index - (links.length - 1) / 2) * 88;

  return <section aria-label="Gemini market graph" className="surface min-w-0 overflow-hidden">
    <header className="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-3">
      <h2 className="font-medium">Related markets</h2>
      <span className="text-xs text-ink-2">Select any market to discover more connections.</span>
    </header>
    <AtlasCanvas width={width} height={height} focus={{ x: x(focus), y: center - 42 }} label="Scrollable market graph">
      <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {edges.map(({ from, to }) => {
          const left = chain.findIndex(({ event }) => event.id === from);
          const right = chain.findIndex(({ event }) => event.id === to);
          if (left < 0 || right < 0) return null;
          const a = x(Math.min(left, right)) + 220;
          const b = x(Math.max(left, right));
          const up = Math.abs(left - right) > 1 ? center - 155 : center;
          const active = focus === left || focus === right;
          return <path key={pairKey(from, to)} d={`M ${a} ${center} C ${a + 45} ${up}, ${b - 45} ${up}, ${b} ${center}`}
            stroke={active ? "var(--accent)" : "var(--accent-line)"} strokeWidth={active ? 1.7 : 1} fill="none" />;
        })}
        {links.map(({ event }, index) => <path key={event.id} d={`M ${x(focus) + 220} ${center} C ${x(focus) + 239} ${center}, ${x(tail) + 239} ${linkY(index)}, ${x(tail + 1)} ${linkY(index)}`}
          stroke="var(--accent-line)" strokeDasharray="4 4" fill="none" />)}
      </svg>
      {chain.map(({ event, outcome }, index) => (
        <button key={event.id} type="button" aria-pressed={focus === index} onClick={() => select(index)}
          title={event.title} style={{ left: x(index), top: center }}
          className={`absolute w-[220px] -translate-y-1/2 rounded-lg border bg-elevated p-3 text-left shadow-lg hover:border-accent ${focus === index ? "border-accent" : "border-line-2"}`}>
          <span className="block text-[10px] uppercase tracking-wider text-accent">{assumptionIds.includes(event.id) ? "Selected assumption" : event.id === targetId ? "Verse target" : index === 0 ? "Starting market" : "Connected market"}</span>
          <span className="mt-1 block line-clamp-2 font-medium">{event.title}</span>
          <span className="mt-1 block truncate text-xs text-market">{outcome} · {quoteLabel(event, outcome)}</span>
        </button>
      ))}
      {links.map((link, index) => <button key={link.event.id} type="button" onClick={() => follow(link)} title={link.reason}
        style={{ left: x(tail + 1), top: linkY(index) }}
        className="absolute w-[220px] -translate-y-1/2 rounded-lg border border-line-2 bg-elevated p-2.5 text-left hover:border-accent">
        <span className="block line-clamp-2 text-xs font-medium">{link.event.title}</span>
        <span className="mt-1 flex items-center gap-1 text-[10px] text-ink-2"><span className="flex-1 truncate">{link.type ? `${link.type} · ` : ""}{link.reason}</span><ArrowRight size={12} className="shrink-0 text-accent" /></span>
      </button>)}
    </AtlasCanvas>
  </section>;
}

export function Atlas({ onBack, onFork }: { onBack: () => void; onFork: (scenario: AtlasScenario) => void }) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [chain, setChain] = useState<AtlasPremise[]>([]);
  const [reviewedEdges, setReviewedEdges] = useState<MarketEdge[]>([]);
  const [targetId, setTargetId] = useState<string>();
  const [assumptionIds, setAssumptionIds] = useState<string[]>([]);
  const [manualScenario, setManualScenario] = useState(false);
  const [focus, setFocus] = useState(0);
  const [topic, setTopic] = useState<string>();

  const searching = searchOpen && search.trim().length >= 2;
  const results = useLiveEvents(search, searching, "atlas");


  const current = chain[focus];
  const catalog = useLiveEvents("", !!current, "atlas");
  const providers = useUniverse((state) => state.providers);
  const request = current ? JSON.stringify({
    current: { ticker: current.event.externalMarketId, outcome: current.outcome },
    visited: chain.map(({ event }) => event.id).sort(),
    providers,
  }) : "";
  const debounced = useDebounced(request, 300);
  const discovery = useQuery<{ links: MarketLink[]; pairs?: MarketEdge[]; checked: number; reviewed: number; partial: boolean }>({
    queryKey: ["atlas-related-links", debounced],
    enabled: !!request && request === debounced,
    staleTime: 300_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/atlas", { method: "POST", body: debounced, signal, headers: { "content-type": "application/json" } });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.links)) throw new Error(data?.error ?? `Atlas could not check market links (HTTP ${response.status}).`);
      return data;
    },
  });
  const selectedIds = useMemo(() => new Set(chain.map(({ event }) => event.id)), [chain]);
  const preview = useMemo(() => current ? diverseMarketLinks(marketLinks(current.event, catalog.data?.events ?? [], selectedIds, current.outcome, 72), 20) : [],
    [current, catalog.data?.events, selectedIds]);
  const reviewed = request === debounced ? discovery.data : undefined;
  const links = (reviewed?.links ?? preview).filter(({ event }) => !selectedIds.has(event.id));
  const edges = useMemo(() => {
    const candidates = [...selectedMarketEdges(chain.map(({ event }) => event)), ...reviewedEdges];
    return [...new Map(candidates.filter(({ from, to }) => selectedIds.has(from) && selectedIds.has(to))
      .map((edge) => [pairKey(edge.from, edge.to), edge])).values()];
  }, [chain, reviewedEdges, selectedIds]);

  useEffect(() => {
    if (!reviewed || !current) return;
    const pairs = [...(reviewed.pairs ?? []), ...reviewed.links.filter(({ event }) => selectedIds.has(event.id)).map(({ event, reason, type }) =>
      ({ from: current.event.id, to: event.id, reason, type }))];
    if (!pairs.length) return;
    setReviewedEdges((prior) => [...new Map([...prior, ...pairs].map((edge) => [pairKey(edge.from, edge.to), edge])).values()]);
  }, [current, reviewed, selectedIds]);

  function start(event: ForkEvent, label?: string) {
    setTopic(label);
    setChain([{ event, outcome: event.possibleOutcomes[0] }]);
    setReviewedEdges([]);
    setTargetId(undefined);
    setAssumptionIds([]);
    setManualScenario(false);
    setFocus(0);
    setSearchOpen(false);
    setSearch("");
  }

  function openTopic(label: string, markets: ForkEvent[]) {
    const opening = markets.find((event) => event.possibleOutcomes.length);
    if (opening) start(opening, label);
  }

  function follow({ event, reason, type }: MarketLink) {
    if (chain.length >= MAX_CHAIN || chain.some((node) => node.event.id === event.id)) return;
    setChain([...chain, { event, outcome: event.possibleOutcomes[0] }]);
    if (type) setReviewedEdges([...reviewedEdges, { from: current.event.id, to: event.id, reason, type }]);
    setFocus(chain.length);
    setSearchOpen(false);
    setSearch("");
  }

  const odds = current && observedProbability(current.event, current.outcome);
  const timestamp = odds?.timestamp ?? current?.event.fetchedAt;
  const tail = chain.at(-1);
  const other = focus === chain.length - 1 ? chain[focus - 1] : tail;
  const suggested = !other && links[0]?.event;
  const target = targetId ? chain.find(({ event }) => event.id === targetId)
    : manualScenario ? undefined : other ?? (suggested ? { event: suggested, outcome: suggested.possibleOutcomes[0] } : undefined);
  const assumptions = manualScenario ? chain.filter(({ event }) => assumptionIds.includes(event.id) && event.id !== target?.event.id)
    : current && current.event.id !== target?.event.id ? [current] : [];
  const scenario = chainScenario(assumptions, target);
  const incident = edges.flatMap((edge) => {
    const id = edge.from === current?.event.id ? edge.to : edge.to === current?.event.id ? edge.from : undefined;
    const market = chain.find(({ event }) => event.id === id);
    return market ? [{ edge, title: market.event.title }] : [];
  });

  return <div className="absolute inset-0 z-40 overflow-auto bg-bg">
    <div className="mx-auto flex min-h-full max-w-[1800px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-4">
        <Wordmark />
        <h1 className="text-2xl font-semibold">Atlas</h1>
        {!!chain.length && <button type="button" className="ibtn" onClick={() => { setChain([]); setFocus(0); setSearchOpen(false); }}><ArrowLeft size={14} /> Market universe</button>}
        <button type="button" onClick={onBack} className="ibtn ml-auto">Open Verse <ArrowRight size={14} /></button>
      </header>
      <div className="relative z-20">
        <div className="surface flex items-center gap-3 px-3">
          <Search size={17} className="shrink-0 text-ink-2" />
          <input aria-label="Search Gemini markets" placeholder="Search Gemini markets…" value={search} maxLength={80}
            className="min-w-0 flex-1 bg-transparent py-2.5" onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }}
            onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }} />
          {searching && <button type="button" aria-label="Close search results" onClick={() => setSearchOpen(false)}><X size={15} /></button>}
        </div>
        {searching && (
          <div className="surface absolute inset-x-0 top-full mt-2 max-h-[42vh] overflow-auto !bg-surface p-2" aria-label="Gemini market search results">
            {results.isFetching && <p className="p-2 text-ink-2">Searching Gemini…</p>}
            {(results.isError || results.data?.ok === false) && <p role="alert" className="p-2 text-warn">{results.error?.message ?? results.data?.error ?? "Gemini search is unavailable."}</p>}
            {!results.isFetching && results.data?.ok && !results.data.events.length && <p className="p-2 text-ink-2">No matching markets.</p>}
            {results.data?.events.map((event) => <div key={event.id} className="flex items-center gap-2 rounded hover:bg-raised">
              <button type="button" className="flex-1 p-2 text-left" disabled={!event.possibleOutcomes.length} onClick={() => start(event)}>{event.title}</button>
              {!!chain.length && <button type="button" className="ibtn" disabled={chain.length >= MAX_CHAIN || !event.possibleOutcomes.length || chain.some((node) => node.event.id === event.id)}
                onClick={() => follow({ event, reason: "Market added by you" })}>Add to graph <ArrowRight size={13} /></button>}
            </div>)}
          </div>
        )}
      </div>

      {!current || !tail ? <MarketUniverse onMarket={start} onTopic={openTopic} /> : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ChainMap chain={chain} edges={edges} links={chain.length < MAX_CHAIN ? links.slice(0, 8) : []} focus={focus} assumptionIds={assumptions.map(({ event }) => event.id)} targetId={target?.event.id} select={setFocus} follow={follow} />
          <aside className="min-w-0 space-y-4">
            <section aria-label="Selected market" className="surface space-y-3 p-4">
              <p className="text-xs text-accent">{topic ? `${topic} · ` : ""}Gemini market</p>
              <h2 className="text-lg font-medium">{current.event.title}</h2>
              {incident.length > 0 && <ul aria-label="Relationships with selected markets" className="space-y-2 text-xs text-ink-2">
                {incident.map(({ edge, title }) => <li key={pairKey(edge.from, edge.to)}><strong>{title} · {edge.type ?? "Related"}</strong><br />{edge.reason}</li>)}
              </ul>}
              <label className="block text-xs">Outcome
                <select aria-label={`Outcome for ${current.event.title}`} className="mt-1 w-full rounded border border-line-2 bg-bg p-2 text-sm" value={current.outcome}
                  onChange={(event) => setChain(chain.map((entry, index) => index === focus ? { ...entry, outcome: event.target.value } : entry))}>
                  {current.event.possibleOutcomes.map((outcome) => <option key={outcome} value={outcome}>{outcome} · {quoteLabel(current.event, outcome)}</option>)}
                </select>
              </label>
              <div className="space-y-1 text-xs text-ink-2">
                {odds && <p className="text-market">{fmtPct(odds.value, 1)} Gemini market-implied odds · {odds.label}</p>}
                <p>{marketFreshness(timestamp)}{timestamp && ` · ${new Date(timestamp).toLocaleString()}`}</p>
                {current.event.resolutionDate && <p>Resolves {new Date(current.event.resolutionDate).toLocaleDateString()}</p>}
                {current.event.metadata.volumeUsd != null && <p>Volume {fmtUsd(current.event.metadata.volumeUsd)}</p>}
                {current.event.resolutionCriteria && <details><summary className="cursor-pointer text-ink">Resolution criteria</summary><p className="mt-1 whitespace-pre-line">{current.event.resolutionCriteria}</p></details>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="ibtn" aria-pressed={targetId === current.event.id} onClick={() => {
                  setManualScenario(true);
                  setTargetId(current.event.id);
                  setAssumptionIds(assumptionIds.filter((id) => id !== current.event.id));
                }}>Set as target</button>
                <button type="button" className="ibtn" aria-pressed={assumptionIds.includes(current.event.id)} disabled={targetId === current.event.id}
                  onClick={() => {
                    setManualScenario(true);
                    setAssumptionIds(assumptionIds.includes(current.event.id) ? assumptionIds.filter((id) => id !== current.event.id) : [...assumptionIds, current.event.id]);
                  }}>
                  {assumptionIds.includes(current.event.id) ? "Remove assumption" : "Add assumption"}
                </button>
                {chain.length > 1 && <button type="button" className="ibtn" onClick={() => {
                  setChain(chain.filter((_, index) => index !== focus));
                  setReviewedEdges(reviewedEdges.filter(({ from, to }) => from !== current.event.id && to !== current.event.id));
                  if (targetId === current.event.id) setTargetId(undefined);
                  setAssumptionIds(assumptionIds.filter((id) => id !== current.event.id));
                  setFocus(Math.min(focus, chain.length - 2));
                }}>Remove market</button>}
              </div>
            </section>
            <section className="surface space-y-3 p-4">
              <h2 className="font-medium">Fork into Verse</h2>
              {assumptions.map(({ event, outcome }) => <p key={event.id} className="text-sm">Assume <strong>{event.title}</strong> · {outcome}</p>)}
              {target && <p className="text-xs text-ink-2">Forecast {target.event.title} · {target.outcome}</p>}
              {!scenario && <p className="text-xs text-ink-2">Choose a target and a different market outcome to assume.</p>}
              <button type="button" disabled={!scenario} onClick={() => { if (scenario) onFork(scenario); }}
                className="ibtn w-full justify-center border border-[var(--accent-line)] bg-[var(--accent-dim)] text-accent">
                <GitFork size={15} /> Fork Reality
              </button>
            </section>
            <section className="surface space-y-2 p-4" aria-label="Connected Gemini markets">
              <h2 className="flex items-center gap-2 font-medium"><Network size={14} className="text-accent" /> Related Gemini markets</h2>
              {chain.length >= MAX_CHAIN ? <p className="text-xs text-ink-2">Eight markets are on the map. Remove one to add another.</p>
                : links.length ? <ul className="space-y-1">{links.map((link) => <li key={link.event.id}>
                  <button type="button" onClick={() => follow(link)} className="w-full rounded border border-line px-2 py-1.5 text-left hover:border-accent">
                    <span className="block text-xs">{link.event.title}</span><span className="block text-[10px] text-ink-2">{link.type ? `${link.type} · ` : ""}{link.reason}</span>
                  </button>
                </li>)}</ul>
                  : discovery.isFetching || request !== debounced ? <p className="text-xs text-ink-2">Searching the full Gemini catalog and ranking related markets…</p>
                    : discovery.isError ? null : <p className="text-xs text-ink-2">No strong matches found. You can add a market from search.</p>}
              {request === debounced && discovery.isError && <div className="space-y-1"><p role="alert" className="text-xs text-warn">{discovery.error.message}</p><button type="button" className="ibtn" onClick={() => void discovery.refetch()}>Retry link check</button></div>}
              {reviewed && <p className="text-xs text-ink-2">{reviewed.checked} Gemini markets checked · {reviewed.reviewed} reviewed by AI{reviewed.partial ? " · Partial catalog" : ""}</p>}
            </section>
          </aside>
        </div>
      )}
    </div>
  </div>;
}
