"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, GitFork, Network, Search, X } from "lucide-react";
import { Wordmark } from "@/components/hud/TopLeft";
import { useLiveEvents } from "@/lib/client/search";
import { fmtPct, fmtUsd, observedProbability } from "@/lib/domain/market";
import { chainScenario, marketFreshness, marketLinks, type AtlasPremise, type AtlasScenario, type MarketLink } from "@/lib/domain/atlas";
import type { ForkEvent } from "@/lib/domain/types";
import { AtlasCanvas } from "./AtlasCanvas";
import { MarketUniverse } from "./MarketUniverse";

const MAX_CHAIN = 8;

function quoteLabel(event: ForkEvent, outcome: string) {
  const quote = observedProbability(event, outcome);
  return quote ? `${fmtPct(quote.value, 1)} Gemini odds` : "Odds unavailable";
}

function ChainMap({ chain, reasons, links, focus, assumptionId, targetId, select, follow }: {
  chain: AtlasPremise[]; reasons: string[]; links: MarketLink[]; focus: number; assumptionId?: string; targetId?: string; select: (index: number) => void; follow: (link: MarketLink) => void;
}) {
  const x = (index: number) => 24 + index * 258;
  const tail = chain.length - 1;
  const width = x(tail + (links.length ? 2 : 1));
  const height = Math.max(440, links.length * 88 + 42);
  const center = height / 2;
  const linkY = (index: number) => center + (index - (links.length - 1) / 2) * 88;

  return <section aria-label="Gemini market chain" className="surface min-w-0 overflow-hidden">
    <header className="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-3">
      <h2 className="font-medium">Market chain</h2>
      <span className="text-xs text-ink-2">Edges show possible impacts, shared topics, or market series.</span>
    </header>
    <AtlasCanvas width={width} height={height} focus={{ x: x(focus), y: center - 42 }} label="Scrollable market chain">
      <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {chain.slice(1).map(({ event }, index) => <path key={event.id} d={`M ${x(index) + 220} ${center} H ${x(index + 1)}`} stroke="var(--accent)" fill="none" />)}
        {links.map(({ event }, index) => <path key={event.id} d={`M ${x(tail) + 220} ${center} C ${x(tail) + 239} ${center}, ${x(tail) + 239} ${linkY(index)}, ${x(tail + 1)} ${linkY(index)}`}
          stroke="var(--accent-line)" strokeDasharray="4 4" fill="none" />)}
      </svg>
      {chain.map(({ event, outcome }, index) => (
        <button key={event.id} type="button" aria-pressed={focus === index} onClick={() => select(index)}
          title={reasons[index] || event.title} style={{ left: x(index), top: center }}
          className={`absolute w-[220px] -translate-y-1/2 rounded-lg border bg-elevated p-3 text-left shadow-lg hover:border-accent ${focus === index ? "border-accent" : "border-line-2"}`}>
          <span className="block text-[10px] uppercase tracking-wider text-accent">{event.id === assumptionId ? "Selected assumption" : event.id === targetId ? "Verse target" : index === 0 ? "Starting market" : "Connected market"}</span>
          <span className="mt-1 block line-clamp-2 font-medium">{event.title}</span>
          <span className="mt-1 block truncate text-xs text-market">{outcome} · {quoteLabel(event, outcome)}</span>
        </button>
      ))}
      {links.map((link, index) => <button key={link.event.id} type="button" onClick={() => follow(link)} title={link.reason}
        style={{ left: x(tail + 1), top: linkY(index) }}
        className="absolute w-[220px] -translate-y-1/2 rounded-lg border border-line-2 bg-elevated p-2.5 text-left hover:border-accent">
        <span className="block line-clamp-2 text-xs font-medium">{link.event.title}</span>
        <span className="mt-1 flex items-center gap-1 text-[10px] text-ink-2"><span className="flex-1 truncate">{link.reason}</span><ArrowRight size={12} className="shrink-0 text-accent" /></span>
      </button>)}
    </AtlasCanvas>
  </section>;
}

export function Atlas({ onBack, onFork }: { onBack: () => void; onFork: (scenario: AtlasScenario) => void }) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [chain, setChain] = useState<AtlasPremise[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [focus, setFocus] = useState(0);
  const [topic, setTopic] = useState<string>();

  const searching = searchOpen && search.trim().length >= 2;
  const results = useLiveEvents(search, searching, "atlas");
  const catalog = useLiveEvents("", chain.length > 0, "atlas");
  const full = useLiveEvents("", chain.length > 0, "atlas-full");
  const current = chain[focus];
  const available = useMemo(() => [...(catalog.data?.events ?? []), ...(full.data?.events ?? [])], [catalog.data?.events, full.data?.events]);
  const links = useMemo(() => {
    const tail = chain.at(-1);
    if (!tail || chain.length >= MAX_CHAIN) return [];
    return marketLinks(tail.event, available, new Set(chain.map(({ event }) => event.id)));
  }, [chain, available]);

  function start(event: ForkEvent, label?: string, next?: MarketLink) {
    setTopic(label);
    setChain([{ event, outcome: event.possibleOutcomes[0] }, ...(next ? [{ event: next.event, outcome: next.event.possibleOutcomes[0] }] : [])]);
    setReasons(["", ...(next ? [next.reason] : [])]);
    setFocus(0);
    setSearchOpen(false);
    setSearch("");
  }

  function openTopic(label: string, markets: ForkEvent[], all: ForkEvent[]) {
    const candidates = markets.filter((event) => event.possibleOutcomes.length).slice(0, 12);
    const lead = candidates.map((event) => ({ event, next: marketLinks(event, all, new Set())[0] }));
    const opening = lead.find(({ next }) => next?.reason.startsWith("Possible impact")) ?? lead.find(({ next }) => next) ?? lead[0];
    if (opening) start(opening.event, label, opening.next);
  }

  function follow({ event, reason }: MarketLink) {
    if (chain.length >= MAX_CHAIN || chain.some((node) => node.event.id === event.id)) return;
    setChain([...chain, { event, outcome: event.possibleOutcomes[0] }]);
    setReasons([...reasons, reason]);
    setFocus(chain.length);
    setSearchOpen(false);
    setSearch("");
  }

  const odds = current && observedProbability(current.event, current.outcome);
  const timestamp = odds?.timestamp ?? current?.event.fetchedAt;
  const tail = chain.at(-1);
  const assumption = current;
  const other = focus === chain.length - 1 ? chain[focus - 1] : tail;
  const suggested = !other && current && links[0]?.event;
  const target = other ?? (suggested ? { event: suggested, outcome: suggested.possibleOutcomes[0] } : undefined);
  const scenario = chainScenario(assumption, target);

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
                onClick={() => follow({ event, reason: "Market added by you" })}>Add to chain <ArrowRight size={13} /></button>}
            </div>)}
          </div>
        )}
      </div>

      {!current || !tail ? <MarketUniverse onMarket={start} onTopic={openTopic} /> : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ChainMap chain={chain} reasons={reasons} links={links} focus={focus} assumptionId={assumption?.event.id} targetId={target?.event.id} select={setFocus} follow={follow} />
          <aside className="min-w-0 space-y-4">
            <section aria-label="Selected market" className="surface space-y-3 p-4">
              <p className="text-xs text-accent">{topic ? `${topic} · ` : ""}Gemini market</p>
              <h2 className="text-lg font-medium">{current.event.title}</h2>
              {reasons[focus] && <p className="text-xs text-ink-2">{reasons[focus]}</p>}
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
              {chain.length > 1 && <button type="button" className="ibtn" onClick={() => {
                setChain(chain.slice(0, -1)); setReasons(reasons.slice(0, -1)); setFocus(Math.min(focus, chain.length - 2));
              }}>Remove last market</button>}
            </section>
            <section className="surface space-y-3 p-4">
              <h2 className="font-medium">Fork into Verse</h2>
              <p className="text-sm">Assume <strong>{current.event.title}</strong> · {current.outcome}</p>
              {assumption && target && <p className="text-xs text-ink-2">Forecast {target.event.title} · {target.outcome}</p>}
              {assumption && !target && <p className="text-xs text-ink-2">Follow a connected market or add one from search as the forecast target.</p>}
              <button type="button" disabled={!scenario} onClick={() => { if (scenario) onFork(scenario); }}
                className="ibtn w-full justify-center border border-[var(--accent-line)] bg-[var(--accent-dim)] text-accent">
                <GitFork size={15} /> Fork Reality
              </button>
            </section>
            <section className="surface space-y-2 p-4" aria-label="Connected Gemini markets">
              <h2 className="flex items-center gap-2 font-medium"><Network size={14} className="text-accent" /> Continue the chain</h2>
              {chain.length >= MAX_CHAIN ? <p className="text-xs text-ink-2">This chain has reached eight markets. Fork into Verse to continue exploring.</p>
                : links.length ? <ul className="space-y-1">{links.map((link) => <li key={link.event.id}>
                  <button type="button" onClick={() => follow(link)} className="w-full rounded border border-line px-2 py-1.5 text-left hover:border-accent">
                    <span className="block text-xs">{link.event.title}</span><span className="block text-[10px] text-ink-2">{link.reason}</span>
                  </button>
                </li>)}</ul>
                  : full.isFetching || catalog.isFetching ? <p className="text-xs text-ink-2">Checking Gemini for related markets…</p>
                    : <p className="text-xs text-ink-2">No supported topic or series links found. Search Gemini to add a market yourself.</p>}
              {(full.isError || catalog.isError) && <button type="button" className="ibtn" onClick={() => { void catalog.refetch(); void full.refetch(); }}>Retry Gemini catalog</button>}
            </section>
          </aside>
        </div>
      )}
    </div>
  </div>;
}
