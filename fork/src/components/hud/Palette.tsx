"use client";
import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { ArrowRight, Orbit, Plus, Search, Target } from "lucide-react";
import { useUI } from "@/store/ui";
import { useUniverse } from "@/store/universe";
import { matches, useLibraryEvents, useLiveEvents } from "@/lib/client/search";
import { addEventToBasket, navigateTo } from "@/lib/client/actions";
import { leadQuote } from "@/components/discovery/EventRow";
import { fmtPct } from "@/lib/domain/market";
import { SourceTag } from "@/components/ui/tags";
import type { ForkEvent, Verse } from "@/lib/domain/types";

type Item = { kind: "verse"; v: Verse } | { kind: "event"; e: ForkEvent };

/** ⌘K — one keyboard-first search across worlds, markets and library events. */
export function Palette() {
  const open = useUI((s) => s.palette);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const verses = useUniverse((s) => s.verses);
  const live = useLiveEvents(q, open);
  const lib = useLibraryEvents(q, "all");

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUI.getState().set({ palette: !useUI.getState().palette });
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const items: Item[] = useMemo(() => {
    const vs = Object.values(verses)
      .filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
      .map((v) => ({ kind: "verse" as const, v }));
    const evs = [...lib.slice(0, 12), ...(live.data?.events ?? []).filter((e) => matches(e, q)).slice(0, 20)].map((e) => ({ kind: "event" as const, e }));
    return [...vs, ...evs];
  }, [verses, q, lib, live.data]);

  const close = () => useUI.getState().set({ palette: false });
  const run = (it: Item, alt = false) => {
    if (it.kind === "verse") navigateTo(it.v.id);
    else if (alt) {
      const s = useUniverse.getState();
      s.registerEvents([it.e]);
      s.setTarget({ eventId: it.e.id, outcome: it.e.eventType === "binary" ? "YES" : it.e.possibleOutcomes[0] });
    } else addEventToBasket(it.e);
    close();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => useUI.getState().set({ palette: o })}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(92vw,600px)] -translate-x-1/2 focus:outline-none" aria-describedby={undefined}>
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 34 }} className="surface overflow-hidden">
            <Dialog.Title className="sr-only">Search FORK</Dialog.Title>
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <Search size={15} className="text-ink-3" />
              <input
                autoFocus
                value={q}
                onChange={(e) => (setQ(e.target.value), setI(0))}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") (e.preventDefault(), setI((x) => Math.min(items.length - 1, x + 1)));
                  if (e.key === "ArrowUp") (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
                  if (e.key === "Enter" && items[i]) run(items[i], e.shiftKey);
                }}
                placeholder="Search Verses, live markets, events…"
                className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
                aria-label="Search"
              />
              <span className="kbd">esc</span>
            </div>
            <ul className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
              {items.length === 0 && <li className="px-3 py-8 text-center text-[12px] text-ink-3">{live.isFetching ? "Searching…" : `No results for “${q}”.`}</li>}
              {items.map((it, idx) => (
                <li key={it.kind === "verse" ? it.v.id : it.e.id} role="option" aria-selected={idx === i}>
                  <button onMouseEnter={() => setI(idx)} onClick={() => run(it)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${idx === i ? "bg-white/[0.06]" : ""}`}>
                    {it.kind === "verse" ? (
                      <>
                        <Orbit size={14} className="shrink-0 text-ink-3" />
                        <span className="flex-1 text-[12.5px] text-ink">{it.v.name}</span>
                        <span className="num text-[10px] text-ink-3">G{it.v.visualMetadata.generation}</span>
                        <span className="text-[10.5px] text-ink-3">enter</span>
                        <ArrowRight size={12} className="text-ink-3" />
                      </>
                    ) : (
                      <>
                        <span className="w-14 shrink-0">
                          <SourceTag source={it.e.source} small />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{it.e.title}</span>
                        <span className={`num text-[11px] ${leadQuote(it.e)?.kind === "MARKET" ? "text-market" : "text-ink-3"}`}>{leadQuote(it.e) ? fmtPct(leadQuote(it.e)!.p) : ""}</span>
                        {idx === i && (
                          <span className="flex items-center gap-2 text-[10.5px] text-ink-3">
                            <Plus size={11} /> ↵ <Target size={11} /> ⇧↵
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[10.5px] text-ink-3">
              <span>
                <span className="kbd">↵</span> add to basket / enter
              </span>
              <span>
                <span className="kbd">⇧↵</span> make target
              </span>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
