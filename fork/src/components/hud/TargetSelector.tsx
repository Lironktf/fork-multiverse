"use client";
import { useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Search, Target } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import type { ForkEvent } from "@/lib/domain/types";
import { fmtPct, observedProbability } from "@/lib/domain/market";
import { useLibraryEvents, useLiveEvents } from "@/lib/client/search";
import { EventRow } from "@/components/discovery/EventRow";
import { KindTag, SourceTag } from "@/components/ui/tags";

export function ModeSwitch() {
  const mode = useUniverse((s) => s.mode);
  const setMode = useUniverse((s) => s.setMode);
  return (
    <div className="seg" role="radiogroup" aria-label="Mode">
      {(["explore", "markets"] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className="relative">
          {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-[4px] bg-white/[0.08]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{m.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

export function TargetPicker({ onPicked, autoFocus = true }: { onPicked?: () => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const mode = useUniverse((s) => s.mode);
  const live = useLiveEvents(q, true);
  const lib = useLibraryEvents(q, "all");
  const listRef = useRef<HTMLDivElement>(null);

  const items: ForkEvent[] = useMemo(() => {
    const L = (live.data?.events ?? []).slice(0, 30);
    return mode === "markets" ? [...L, ...lib] : [...lib, ...L];
  }, [live.data, lib, mode]);

  const pick = (e: ForkEvent, outcome?: string) => {
    if (e.eventType === "categorical" && !outcome) {
      setExpanded(expanded === e.id ? null : e.id);
      return;
    }
    const s = useUniverse.getState();
    s.registerEvents([e]);
    s.setTarget({ eventId: e.id, outcome: outcome ?? "YES" });
    useUI.getState().set({ announce: `Target set to ${e.title}${outcome ? `, ${outcome}` : ""}.` });
    onPicked?.();
  };

  return (
    <div className="flex max-h-[min(70vh,560px)] w-[min(92vw,520px)] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
        <Search size={14} className="text-ink-3" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            }
            if (e.key === "Enter" && items[active]) pick(items[active]);
          }}
          placeholder="Search a market or event to forecast…"
          className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
          aria-label="Search targets"
          aria-controls="target-list"
          aria-activedescendant={items[active] ? `target-opt-${active}` : undefined}
        />
        {live.isFetching && <span className="meta">searching</span>}
      </div>
      <div ref={listRef} id="target-list" role="listbox" className="flex-1 overflow-y-auto p-1.5">
        {live.data && !live.data.ok && (
          <div className="mx-2 my-1.5 rounded-md border border-warn/25 bg-warn/[0.04] px-3 py-2 text-[11.5px] text-warn/90">
            Live Gemini markets are unavailable right now. Showing the demonstration library only.
          </div>
        )}
        {items.length === 0 && !live.isFetching && <div className="px-3 py-6 text-center text-[12px] text-ink-3">No events match “{q}”. Try a broader word, or create a custom event from the discovery panel.</div>}
        {items.map((e, i) => (
          <div key={e.id}>
            <EventRow id={`target-opt-${i}`} event={e} active={i === active} onActivate={() => pick(e)} />
            <AnimatePresence initial={false}>
              {expanded === e.id && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                  <div className="mb-2 ml-6 mr-2 grid grid-cols-1 gap-0.5 border-l border-line pl-2">
                    {e.possibleOutcomes.slice(0, 24).map((o) => {
                      const p = observedProbability(e, o);
                      return (
                        <button key={o} onClick={() => pick(e, o)} className="flex items-center justify-between rounded px-2 py-1.5 text-left text-[12px] text-ink-2 hover:bg-white/[0.04] hover:text-ink">
                          <span className="truncate">{o}</span>
                          <span className="num text-[11px] text-market/90">{p ? fmtPct(p.value) : "—"}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TargetSelector() {
  const [open, setOpen] = useState(false);
  const { target, events, currentVerseId, forecasts, forecastIndex, mode } = useUniverse(
    useShallow((s) => ({ target: s.target, events: s.events, currentVerseId: s.currentVerseId, forecasts: s.forecasts, forecastIndex: s.forecastIndex, mode: s.mode })),
  );
  const busy = useUI((s) => s.forkPhase !== "idle");
  const ev = events[target.eventId];
  const obs = observedProbability(ev, target.outcome);
  const f = forecastFor({ forecasts, forecastIndex }, currentVerseId, target);
  const snap = obs?.snapshot;
  const outcomes = ev?.eventType === "binary" ? ["YES", "NO"] : null;

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <ModeSwitch />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            disabled={busy}
            className="group flex h-[34px] max-w-[min(52vw,560px)] items-center gap-2.5 rounded-lg border border-line bg-surface/80 px-3 text-left backdrop-blur transition-colors hover:border-line-2"
            aria-label={`Change target. Current: ${ev?.title}`}
            data-testid="target-selector"
          >
            <Target size={13} className="shrink-0 text-accent" aria-hidden />
            <span className="truncate text-[12.5px] font-medium text-ink">{ev?.title ?? "Select a target"}</span>
            {ev?.eventType === "categorical" && <span className="shrink-0 truncate text-[11px] text-accent">→ {target.outcome}</span>}
            {ev && <SourceTag source={ev.source} small />}
            {obs && (
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={`num text-[12px] ${obs.kind === "MARKET" ? "text-market" : "text-ink-3"}`}>{fmtPct(obs.value)}</span>
              </span>
            )}
            <ChevronDown size={13} className="shrink-0 text-ink-3 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={8} align="center" className="surface z-50 overflow-hidden data-[state=open]:animate-[fadein_.18s_ease-out]">
            <TargetPicker onPicked={() => setOpen(false)} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {outcomes && (
        <div className="seg" role="radiogroup" aria-label="Target outcome">
          {outcomes.map((o) => (
            <button key={o} role="radio" aria-checked={target.outcome === o} disabled={busy} onClick={() => useUniverse.getState().setTarget({ ...target, outcome: o })} className="relative">
              {target.outcome === o && <motion.span layoutId="target-outcome" className="absolute inset-0 rounded-[4px] bg-white/[0.08]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{o}</span>
            </button>
          ))}
        </div>
      )}
      {mode === "markets" && snap && (
        <div className="hidden items-center gap-2 xl:flex" aria-label="Market quote">
          <KindTag kind="MARKET" small />
          <span className="num text-[10.5px] text-ink-3">
            bid <span className="text-ink-2">{snap.bid ?? "—"}</span> · ask <span className="text-ink-2">{snap.ask ?? "—"}</span>
          </span>
        </div>
      )}
      {f && f.status !== "complete" && f.status !== "partial" && f.status !== "failed" && <span className="sr-only">Analysis in progress</span>}
    </div>
  );
}
