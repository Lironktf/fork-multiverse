"use client";
import { memo } from "react";
import type { ForkEvent } from "@/lib/domain/types";
import { fmtPct, fmtUsd, observedProbability } from "@/lib/domain/market";
import { SourceTag } from "@/components/ui/tags";
import { CATEGORY_LABEL } from "@/lib/client/search";

export const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", day: d.getFullYear() === new Date().getFullYear() ? "numeric" : undefined });
};

/** Lead probability for a row: binary → YES; categorical → favourite outcome. */
export function leadQuote(e: ForkEvent): { outcome: string; p: number; kind: "MARKET" | "DEMO" } | null {
  if (e.source === "gemini") {
    if (e.eventType === "binary") {
      const o = observedProbability(e, "YES");
      return o ? { outcome: "YES", p: o.value, kind: "MARKET" } : null;
    }
    let best: { outcome: string; p: number; kind: "MARKET" } | null = null;
    for (const s of e.snapshots ?? []) if (s.impliedProbabilityEstimate !== null && (!best || s.impliedProbabilityEstimate > best.p)) best = { outcome: s.outcome, p: s.impliedProbabilityEstimate, kind: "MARKET" };
    return best;
  }
  const o = observedProbability(e, "YES");
  return o ? { outcome: "YES", p: o.value, kind: "DEMO" } : null;
}

export const EventRow = memo(function EventRow({
  event,
  active = false,
  onActivate,
  onPointerDown,
  trailing,
  id,
}: {
  event: ForkEvent;
  active?: boolean;
  onActivate?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  trailing?: React.ReactNode;
  id?: string;
}) {
  const q = leadQuote(event);
  const date = fmtDate(event.resolutionDate);
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-event={event.id}
      onPointerDown={onPointerDown}
      onClick={onActivate}
      className={`group relative flex cursor-pointer items-start gap-3 rounded-md px-2.5 py-2 transition-[background-color,transform] duration-200 ease-out select-none ${
        active ? "bg-white/[0.055]" : "hover:bg-white/[0.035]"
      }`}
    >
      <span
        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full transition-transform duration-200 group-hover:scale-125 ${
          event.source === "gemini" ? "bg-market/80" : event.source === "custom" ? "border border-ink-2" : event.source === "model" ? "bg-accent/70" : "border border-dashed border-[#8f8a7e]"
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] leading-snug text-ink transition-transform duration-200 ease-out group-hover:translate-x-[2px]">{event.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-ink-3">
          <SourceTag source={event.source} small />
          <span>{CATEGORY_LABEL[event.category]}</span>
          {date && <span className="num">· {date}</span>}
          {event.eventType === "categorical" && <span>· {event.possibleOutcomes.length} outcomes</span>}
          {event.source === "gemini" && event.metadata.volumeUsd != null && <span className="num">· vol {fmtUsd(event.metadata.volumeUsd)}</span>}
        </div>
        {event.metadata.match && event.metadata.match !== "title" && (
          <div className={`mt-1 line-clamp-1 text-[10px] ${event.metadata.related ? "text-ink-3 italic" : "text-accent/75"}`} data-testid="match-reason">
            {event.metadata.match}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
        {q ? (
          <>
            <span className={`num text-[12.5px] ${q.kind === "MARKET" ? "text-market" : "text-ink-3"}`}>{fmtPct(q.p)}</span>
            <span className="max-w-[90px] truncate text-[9.5px] text-ink-3" title={q.outcome}>
              {q.kind === "MARKET" ? q.outcome : "illustr."}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-ink-3">{event.source === "gemini" ? "no quote" : "no market"}</span>
        )}
      </div>
      {trailing && <div className="-mr-1 flex shrink-0 self-center">{trailing}</div>}
    </div>
  );
});
