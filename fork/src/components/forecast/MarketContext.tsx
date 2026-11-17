"use client";
import { useMemo } from "react";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useUniverse } from "@/store/universe";
import type { ForkEvent } from "@/lib/domain/types";
import { fmtPct, fmtUsd } from "@/lib/domain/market";
import { useLiveEvents } from "@/lib/client/search";
import { addEventToBasket } from "@/lib/client/actions";
import { leadQuote } from "@/components/discovery/EventRow";
import { KindTag } from "@/components/ui/tags";

/**
 * Markets mode: the observed order-book context for a live target, plus
 * related live markets. Everything here is MARKET data from Gemini's public
 * API, re-fetched by ticker; nothing is interpolated or synthesised.
 */
export function MarketContext() {
  const { target, events } = useUniverse(useShallow((s) => ({ target: s.target, events: s.events })));
  const ev = events[target.eventId];
  const ticker = ev?.source === "gemini" ? ev.externalMarketId : null;
  const fresh = useQuery({
    queryKey: ["gemini-event", ticker],
    enabled: !!ticker,
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/events/${encodeURIComponent(ticker!)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      useUniverse.getState().registerEvents([j.event]); // keep the registry's snapshot current
      return j.event as ForkEvent;
    },
  });
  const live = useLiveEvents("", true);
  const related = useMemo(
    () => (live.data?.events ?? []).filter((e) => e.id !== ev?.id && e.category === ev?.category).slice(0, 5),
    [live.data, ev],
  );

  if (!ev) return null;
  if (ev.source !== "gemini")
    return (
      <div className="mt-4 border-t border-line pt-3" data-testid="market-context">
        <div className="meta mb-1">Market</div>
        <p className="text-[11px] leading-relaxed text-ink-3">
          This target is {ev.source === "demo" ? "a demonstration event" : "a custom event"} — no exchange lists it, so there is no observed price. Pick a Gemini market as the target to compare model estimates with live pricing.
        </p>
      </div>
    );

  const e = fresh.data ?? ev;
  const snaps = e.snapshots ?? [];
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="market-context">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11.5px] font-medium text-ink">
          Market · Gemini <KindTag kind="MARKET" small />
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-ink-3">
          {fresh.isFetching && <RefreshCw size={10} className="animate-spin" />}
          <span className="num">{e.fetchedAt ? `quoted ${new Date(e.fetchedAt).toLocaleTimeString()}` : ""}</span>
        </span>
      </div>
      {fresh.isError && <p className="mt-1 text-[10.5px] text-warn">Refresh failed; showing the last quote with its original timestamp.</p>}
      <div className="num mt-1 flex gap-3 text-[10.5px] text-ink-3">
        <span>{e.externalMarketId}</span>
        <span>vol {fmtUsd(e.metadata.volumeUsd ?? null)}</span>
        {e.resolutionDate && <span>expires {new Date(e.resolutionDate).toLocaleDateString()}</span>}
      </div>
      <table className="mt-2 w-full text-[11px]">
        <thead>
          <tr className="meta text-left">
            <th className="pb-1 font-normal">Outcome</th>
            <th className="pb-1 text-right font-normal">Bid</th>
            <th className="pb-1 text-right font-normal">Ask</th>
            <th className="pb-1 text-right font-normal">Last</th>
            <th className="pb-1 text-right font-normal">Implied</th>
          </tr>
        </thead>
        <tbody className="num">
          {snaps.slice(0, 10).map((s) => (
            <tr key={s.outcome} className={`border-t border-line ${s.outcome === target.outcome || (e.eventType === "binary" && target.outcome === "NO" && s.outcome === "YES") ? "text-ink" : "text-ink-2"}`}>
              <td className="max-w-[110px] truncate py-1 pr-2 font-sans" title={s.outcome}>
                {s.outcome}
              </td>
              <td className="py-1 text-right">{s.bid?.toFixed(2) ?? "—"}</td>
              <td className="py-1 text-right">{s.ask?.toFixed(2) ?? "—"}</td>
              <td className="py-1 text-right">{s.lastPrice?.toFixed(2) ?? "—"}</td>
              <td className="py-1 text-right text-market" title={s.dataQuality}>
                {s.impliedProbabilityEstimate !== null ? fmtPct(s.impliedProbabilityEstimate) : <span className="text-ink-3">{s.dataQuality === "one-sided" ? "1-sided" : "—"}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-3">
        Implied = mid of best bid/ask; last trade when one side is empty; blank when only one side quotes. {e.eventType === "binary" ? "NO is the complement of the YES book." : "Each outcome is its own YES contract."}
      </p>
      {e.metadata.url && (
        <a className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline" href={e.metadata.url} target="_blank" rel="noreferrer">
          View on Gemini <ExternalLink size={10} />
        </a>
      )}
      {related.length > 0 && (
        <div className="mt-3">
          <div className="meta mb-1">Related live markets</div>
          <ul className="flex flex-col">
            {related.map((r) => {
              const q = leadQuote(r);
              return (
                <li key={r.id} className="group flex items-center gap-2 py-1 text-[11px]">
                  <span className="min-w-0 flex-1 truncate text-ink-2">{r.title}</span>
                  <span className="num text-market/90">{q ? fmtPct(q.p) : "—"}</span>
                  <button className="ibtn !h-6 !min-w-6 !p-0 opacity-50 group-hover:opacity-100" onClick={() => addEventToBasket(r)} aria-label={`Assume an outcome of ${r.title}`}>
                    <Plus size={11} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
