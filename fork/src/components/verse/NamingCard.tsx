"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import { suggestNames } from "@/lib/domain/verse";
import { fmtPct } from "@/lib/domain/market";
import { isTerminal } from "@/lib/client/actions";

/** The moment of naming a world. Appears at the end of the fork reveal. */
export function NamingCard() {
  const id = useUI((s) => s.namingVerseId);
  const { verse, events, target, forecasts, forecastIndex, verses } = useUniverse(
    useShallow((s) => ({ verse: id ? s.verses[id] : null, events: s.events, target: s.target, forecasts: s.forecasts, forecastIndex: s.forecastIndex, verses: s.verses })),
  );
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const titles = useMemo(() => new Map(Object.values(events).map((e) => [e.id, e.title])), [events]);
  const suggestions = useMemo(() => (verse ? suggestNames(verse.newAssumptions, titles, verse.visualMetadata.signature) : []), [verse, titles]);

  useEffect(() => {
    if (verse) {
      setName(verse.named ? verse.name : (suggestions[0] ?? ""));
      setTimeout(() => inputRef.current?.select(), 60);
    }
  }, [verse?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => useUI.getState().set({ namingVerseId: null });
  const commit = (n = name) => {
    if (!verse) return;
    if (n.trim()) useUniverse.getState().renameVerse(verse.id, n);
    useUI.getState().set({ namingVerseId: null, announce: `Verse named ${n}.` });
  };

  const f = verse ? forecastFor({ forecasts, forecastIndex }, verse.id, target) : null;
  const parent = verse?.parentId ? verses[verse.parentId] : null;
  const pf = parent ? forecastFor({ forecasts, forecastIndex }, parent.id, target) : null;

  return (
    <AnimatePresence>
      {verse && (
        <motion.div
          role="dialog"
          aria-label="Name this Verse"
          initial={{ opacity: 0, y: 18, scale: 0.97, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="surface pointer-events-auto w-[min(92vw,440px)] p-4"
          onKeyDown={(e) => e.key === "Escape" && close()}
          data-testid="naming-card"
        >
          <div className="flex items-center justify-between">
            <span className="meta text-accent/90">
              A new world · generation {verse.visualMetadata.generation}
            </span>
            <button className="ibtn !h-6 !min-w-6 !p-0" onClick={close} aria-label="Dismiss">
              <X size={12} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `hsl(${verse.visualMetadata.hue} 75% 70%)`, boxShadow: `0 0 14px hsl(${verse.visualMetadata.hue} 80% 65% / .8)` }} />
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              className="min-w-0 flex-1 border-b border-line-2 bg-transparent pb-1 text-[20px] font-medium tracking-tight text-ink focus:border-accent/60 focus:outline-none"
              aria-label="Verse name"
              data-testid="verse-name-input"
            />
            <button className="btn !h-8 shrink-0" onClick={() => commit()} aria-label="Save name" data-testid="verse-name-save">
              <ArrowRight size={13} />
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setName(s)} className={`h-6 rounded-[5px] border px-2 text-[11px] transition-colors ${s === name ? "border-accent/50 text-accent" : "border-line text-ink-3 hover:text-ink-2"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[11px]">
            <span className="text-ink-3">
              {verse.newAssumptions.length} new · {verse.inheritedAssumptions.length} inherited assumption{verse.inheritedAssumptions.length === 1 ? "" : "s"}
            </span>
            <span className="num text-ink-2">
              {f && isTerminal(f) && f.ensembleProbability != null ? (
                <>
                  {pf?.ensembleProbability != null ? `${fmtPct(pf.ensembleProbability)} → ` : f.baselineProbability != null ? `${fmtPct(f.baselineProbability)} → ` : ""}
                  <span className="text-ink">{fmtPct(f.ensembleProbability)}</span>
                </>
              ) : f ? (
                <span className="text-accent/80">analysts at work…</span>
              ) : null}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
