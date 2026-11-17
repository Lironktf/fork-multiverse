"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsLeft, Plus, Search, Sparkles, Target, X } from "lucide-react";
import type { EventCategory, ForkEvent } from "@/lib/domain/types";
import { useUniverse } from "@/store/universe";
import { useUI } from "@/store/ui";
import { CATEGORY_LABEL, matches, useLibraryEvents, useLiveEvents, type SourceFilter } from "@/lib/client/search";
import { addEventToBasket } from "@/lib/client/actions";
import { fmtPct, fmtUsd, observedProbability } from "@/lib/domain/market";
import { EventRow } from "./EventRow";
import { beginEventDrag } from "@/components/basket/DragLayer";

const CATS: (EventCategory | "all")[] = ["all", "crypto", "macro", "politics", "markets", "ai", "tech", "energy", "geopolitics", "business"];

function EventDetail({ event, onClose }: { event: ForkEvent; onClose: () => void }) {
  const addAs = (o: string) => {
    if (addEventToBasket(event, o)) onClose();
  };
  const snaps = event.snapshots ?? [];
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
      <div className="mx-2.5 mb-2 rounded-md border border-line bg-black/30 p-2.5 text-[11.5px]">
        {event.description && <p className="text-ink-2">{event.description}</p>}
        {event.resolutionCriteria && <p className="mt-1.5 line-clamp-3 text-ink-3">{event.resolutionCriteria}</p>}
        {event.source === "gemini" && (
          <div className="mt-2 flex items-center gap-2 text-[10.5px] text-ink-3">
            <span className="num">{event.externalMarketId}</span>
            {event.metadata.volumeUsd != null && <span className="num">vol {fmtUsd(event.metadata.volumeUsd)}</span>}
            {event.fetchedAt && <span className="num">quoted {new Date(event.fetchedAt).toLocaleTimeString()}</span>}
          </div>
        )}
        <div className="meta mb-1 mt-2.5">Assume outcome</div>
        <div className="flex max-h-[180px] flex-col gap-0.5 overflow-y-auto">
          {event.possibleOutcomes.map((o) => {
            const p = observedProbability(event, o);
            const snap = snaps.find((s) => s.outcome === o);
            return (
              <button key={o} onClick={() => addAs(o)} className="group flex items-center justify-between rounded px-2 py-1.5 text-left hover:bg-white/[0.05]">
                <span className="flex items-center gap-2 text-ink-2 group-hover:text-ink">
                  <Plus size={11} className="text-ink-3 group-hover:text-accent" aria-hidden />
                  <span className="truncate">{o}</span>
                </span>
                <span className="num text-[10.5px] text-ink-3">
                  {p ? <span className={p.kind === "MARKET" ? "text-market" : ""}>{fmtPct(p.value)}</span> : "—"}
                  {snap && snap.bid !== null && snap.ask !== null && (
                    <span className="ml-1.5 text-ink-3">
                      {snap.bid.toFixed(2)}/{snap.ask.toFixed(2)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
          <button
            className="btn !h-7 !text-[11px]"
            onClick={() => {
              const s = useUniverse.getState();
              s.registerEvents([event]);
              s.setTarget({ eventId: event.id, outcome: event.eventType === "binary" ? "YES" : event.possibleOutcomes[0] });
              onClose();
            }}
          >
            <Target size={12} aria-hidden /> Make target
          </button>
          {event.metadata.url && (
            <a className="btn !h-7 !text-[11px]" href={event.metadata.url} target="_blank" rel="noreferrer">
              Gemini ↗
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CustomEventForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [outcomes, setOutcomes] = useState("YES, NO");
  const [category, setCategory] = useState<EventCategory>("other");
  const list = outcomes
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const valid = title.trim().length >= 6 && new Set(list).size >= 2 && list.length === new Set(list).size;
  const create = () => {
    const id = `custom:${Date.now().toString(36)}`;
    const ev: ForkEvent = {
      id,
      title: title.trim(),
      description: "",
      category,
      source: "custom",
      externalMarketId: null,
      eventType: list.length === 2 && list[0] === "YES" && list[1] === "NO" ? "binary" : "categorical",
      possibleOutcomes: list,
      resolutionCriteria: criteria.trim() || "Defined by the user; no external resolution source.",
      resolutionDate: null,
      metadata: {},
    };
    useUniverse.getState().registerEvents([ev]);
    addEventToBasket(ev, list[0]);
    onDone();
  };
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="mx-3 mb-3 flex flex-col gap-2 rounded-md border border-line bg-black/30 p-3">
        <div className="meta">Define a custom event</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Apple ships a foldable iPhone in 2027" className="h-8 rounded-md border border-line bg-transparent px-2.5 text-[12px] text-ink placeholder:text-ink-3 focus:border-accent/50 focus:outline-none" aria-label="Event title" />
        <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2} placeholder="Resolution criteria (precise, checkable)" className="resize-none rounded-md border border-line bg-transparent px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-3 focus:border-accent/50 focus:outline-none" aria-label="Resolution criteria" />
        <div className="flex gap-2">
          <input value={outcomes} onChange={(e) => setOutcomes(e.target.value)} className="num h-8 min-w-0 flex-1 rounded-md border border-line bg-transparent px-2.5 text-[11px] text-ink focus:border-accent/50 focus:outline-none" aria-label="Outcomes, comma separated" />
          <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} className="h-8 rounded-md border border-line bg-[#0d0d0f] px-1.5 text-[11px] text-ink-2" aria-label="Category">
            {(Object.keys(CATEGORY_LABEL) as (EventCategory | "all")[])
              .filter((c) => c !== "all")
              .map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] text-ink-3">Outcomes, comma-separated. Custom events never show a market price.</span>
          <button className="btn !h-7 shrink-0 !text-[11px]" disabled={!valid} onClick={create}>
            Create & add
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function DiscoveryPanel({ onCollapse }: { onCollapse?: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<EventCategory | "all">("all");
  const mode = useUniverse((s) => s.mode);
  const [source, setSource] = useState<SourceFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const busy = useUI((s) => s.forkPhase !== "idle");
  const effectiveSource: SourceFilter = source === "all" && mode === "markets" ? "live" : source;
  const live = useLiveEvents(q, effectiveSource === "all" || effectiveSource === "live");
  const lib = useLibraryEvents(q, cat);

  const liveEvents = useMemo(() => (live.data?.events ?? []).filter((e) => (cat === "all" || e.category === cat) && matches(e, q)), [live.data, cat, q]);
  const rows: { header: string; note?: string; items: ForkEvent[] }[] = [];
  if (effectiveSource === "all" || effectiveSource === "live")
    rows.push({ header: "Live · Gemini", note: live.data?.fetchedAt ? `quoted ${new Date(live.data.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : undefined, items: liveEvents });
  if (effectiveSource === "all" || effectiveSource === "library") rows.push({ header: "Library · demonstration", items: lib.filter((e) => e.source === "demo") });
  if (effectiveSource === "all" || effectiveSource === "custom") rows.push({ header: "Custom & model-proposed", items: lib.filter((e) => e.source === "custom" || e.source === "model") });
  if (mode === "markets" && effectiveSource === "all") rows.reverse();

  return (
    <section aria-label="Event discovery" className="surface pointer-events-auto flex h-full w-full flex-col overflow-hidden" data-testid="discovery">
      <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <h2 className="text-[12px] font-medium tracking-wide text-ink">Possible futures</h2>
        <span className="meta ml-1">{mode === "markets" ? "markets" : "explore"}</span>
        <div className="ml-auto flex">
          <button className="ibtn !h-6 !min-w-6 !px-1" onClick={() => setCreating((c) => !c)} aria-label="Define a custom event" title="Custom event" data-active={creating}>
            <Sparkles size={12} />
          </button>
          {onCollapse && (
            <button className="ibtn !h-6 !min-w-6 !px-1" onClick={onCollapse} aria-label="Collapse discovery panel">
              <ChevronsLeft size={13} />
            </button>
          )}
        </div>
      </header>
      <AnimatePresence>{creating && <CustomEventForm onDone={() => setCreating(false)} />}</AnimatePresence>
      <div className="px-3">
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-black/30 px-2.5 focus-within:border-accent/40">
          <Search size={13} className="text-ink-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-3 focus:outline-none" aria-label="Search events" data-testid="discovery-search" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="text-ink-3 hover:text-ink">
              <X size={12} />
            </button>
          )}
          {live.isFetching && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-label="Searching live markets" />}
        </label>
        <div className="mt-2 flex gap-3 border-b border-line text-[11px]" role="tablist" aria-label="Source">
          {(["all", "live", "library", "custom"] as SourceFilter[]).map((sname) => (
            <button key={sname} role="tab" aria-selected={effectiveSource === sname} onClick={() => setSource(sname)} className={`relative pb-1.5 capitalize transition-colors ${effectiveSource === sname ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}>
              {sname}
              {effectiveSource === sname && <motion.span layoutId="src-underline" className="absolute inset-x-0 -bottom-px h-px bg-accent" />}
            </button>
          ))}
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto py-2" role="group" aria-label="Category">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={`h-[22px] shrink-0 rounded-[5px] px-2 text-[10.5px] transition-colors ${cat === c ? "bg-white/[0.08] text-ink" : "text-ink-3 hover:text-ink-2"}`}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3" role="listbox" aria-label="Events">
        {rows.map((g) => (
          <div key={g.header} className="mb-1">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0d0d0f]/95 px-2.5 pb-1 pt-2 backdrop-blur">
              <span className="meta">{g.header}</span>
              {g.note && <span className="num text-[9.5px] text-ink-3">{g.note}</span>}
            </div>
            {g.header.startsWith("Live") && live.data && !live.data.ok && (
              <div className="mx-2 my-1 rounded-md border border-warn/25 bg-warn/[0.04] px-2.5 py-2 text-[11px] text-warn/90">Gemini is unreachable. No live prices are shown — nothing is substituted.</div>
            )}
            {g.header.startsWith("Live") && live.isLoading && <div className="px-3 py-3 text-[11px] text-ink-3">Fetching live markets…</div>}
            {g.items.length === 0 && !(g.header.startsWith("Live") && live.isLoading) && (
              <div className="px-3 py-2 text-[11px] text-ink-3">{g.header.startsWith("Custom") ? "None yet — use ✦ to define one." : q ? `Nothing matches “${q}”.` : "No events in this category."}</div>
            )}
            {g.items.map((e) => (
              <div key={e.id} style={{ contentVisibility: "auto", containIntrinsicSize: "0 56px" }}>
                <EventRow
                  event={e}
                  active={open === e.id}
                  onActivate={() => setOpen(open === e.id ? null : e.id)}
                  onPointerDown={(pe) => !busy && beginEventDrag(pe, e.id, e.title)}
                  trailing={
                    <button
                      className="ibtn !h-7 !min-w-7 !p-0 opacity-50 group-hover:opacity-100"
                      onPointerDown={(pe) => pe.stopPropagation()}
                      onClick={(ce) => {
                        ce.stopPropagation();
                        useUniverse.getState().registerEvents([e]);
                        addEventToBasket(e);
                      }}
                      aria-label={`Add ${e.title} to basket`}
                      data-testid="add-to-basket"
                      disabled={busy}
                    >
                      <Plus size={13} />
                    </button>
                  }
                />
                <AnimatePresence>{open === e.id && <EventDetail event={e} onClose={() => setOpen(null)} />}</AnimatePresence>
              </div>
            ))}
          </div>
        ))}
        <p className="px-3 pt-2 text-[10px] leading-relaxed text-ink-3">
          Live rows are quoted from Gemini&apos;s public API (mid of best bid/ask, or last trade). Library rows are hypothetical with illustrative numbers.
        </p>
      </div>
    </section>
  );
}
