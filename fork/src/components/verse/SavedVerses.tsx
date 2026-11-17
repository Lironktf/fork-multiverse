"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Columns2, CornerDownRight, Pencil, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import { childrenOf, ORIGIN_ID } from "@/lib/domain/verse";
import { fmtPct } from "@/lib/domain/market";
import { navigateTo } from "@/lib/client/actions";
import type { Verse } from "@/lib/domain/types";

/** Saved Verses as a navigable tree (never flattened into a chronological list). */
export function SavedVerses() {
  const { verses, current, target, forecasts, forecastIndex, compare, events } = useUniverse(
    useShallow((s) => ({ verses: s.verses, current: s.currentVerseId, target: s.target, forecasts: s.forecasts, forecastIndex: s.forecastIndex, compare: s.compare, events: s.events })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const Row = ({ v, depth }: { v: Verse; depth: number }) => {
    const f = forecastFor({ forecasts, forecastIndex }, v.id, target);
    const kids = childrenOf(verses, v.id);
    return (
      <li>
        <div className={`group flex items-center gap-2 rounded-md py-1.5 pr-1.5 transition-colors hover:bg-white/[0.035] ${v.id === current ? "bg-white/[0.04]" : ""}`} style={{ paddingLeft: 8 + depth * 14 }}>
          {depth > 0 && <CornerDownRight size={11} className="shrink-0 text-ink-3" aria-hidden />}
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `hsl(${v.visualMetadata.hue} 70% 68%)` }} aria-hidden />
          {editing === v.id ? (
            <input
              autoFocus
              defaultValue={v.name}
              onBlur={(e) => {
                useUniverse.getState().renameVerse(v.id, e.target.value);
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditing(null);
              }}
              className="min-w-0 flex-1 border-b border-accent/50 bg-transparent text-[12px] text-ink focus:outline-none"
              aria-label="Rename Verse"
            />
          ) : (
            <button onClick={() => (navigateTo(v.id), useUI.getState().set({ panel: null }))} className={`min-w-0 flex-1 truncate text-left text-[12px] ${v.id === current ? "text-accent" : "text-ink"}`} title={`Enter ${v.name}`} aria-label={`Enter ${v.name}`}>
              {v.name}
              {v.relationshipType === "disagreement-split" && <span className="ml-1.5 text-[10px] text-warn/80">split</span>}
            </button>
          )}
          <span className="num shrink-0 text-[10.5px] text-ink-2">{f?.ensembleProbability != null ? fmtPct(f.ensembleProbability) : <span className="text-ink-3">—</span>}</span>
          <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button className="ibtn !h-6 !min-w-6 !p-0" onClick={() => setEditing(v.id)} aria-label={`Rename ${v.name}`}>
              <Pencil size={11} />
            </button>
            <button className="ibtn !h-6 !min-w-6 !p-0" aria-pressed={compare.includes(v.id)} onClick={() => useUniverse.getState().toggleCompare(v.id)} aria-label={`Select ${v.name} for comparison`}>
              <Columns2 size={11} />
            </button>
            {v.id !== ORIGIN_ID && (
              <button className="ibtn !h-6 !min-w-6 !p-0" onClick={() => setConfirmDel(v.id)} aria-label={`Delete ${v.name}`}>
                <Trash2 size={11} />
              </button>
            )}
          </span>
        </div>
        {confirmDel === v.id && (
          <div className="ml-6 mr-2 flex items-center justify-between rounded border border-down/30 px-2 py-1.5 text-[11px] text-down">
            Delete {v.name}
            {kids.length ? ` and ${kids.length} descendant branch${kids.length > 1 ? "es" : ""}` : ""}?
            <span className="flex gap-1">
              <button className="btn !h-6 !text-[10.5px]" onClick={() => setConfirmDel(null)}>
                Keep
              </button>
              <button
                className="btn !h-6 !border-down/40 !text-[10.5px] !text-down"
                onClick={() => {
                  useUniverse.getState().deleteVerse(v.id);
                  setConfirmDel(null);
                }}
              >
                Delete
              </button>
            </span>
          </div>
        )}
        {kids.length > 0 && (
          <ul>
            {kids.map((k) => (
              <Row key={k.id} v={k} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  const count = Object.keys(verses).length;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="surface surface-solid pointer-events-auto flex max-h-[min(70vh,600px)] w-[min(92vw,360px)] flex-col overflow-hidden" data-testid="saved-verses">
      <header className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <h2 className="text-[12px] font-medium text-ink">Universe</h2>
        <span className="num text-[10.5px] text-ink-3">{count} Verse{count !== 1 ? "s" : ""} · {events[target.eventId]?.title.slice(0, 26)}…</span>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <Row v={verses[ORIGIN_ID]} depth={0} />
      </ul>
      <footer className="flex items-center justify-between border-t border-line px-3.5 py-2.5 text-[10.5px] text-ink-3">
        <span>Saved locally and mirrored to this server.</span>
        <button className="btn !h-6 !text-[10.5px]" disabled={compare.length !== 2} onClick={() => useUI.getState().set({ panel: "compare" })}>
          <Columns2 size={11} /> Compare {compare.length}/2
        </button>
      </footer>
    </motion.div>
  );
}
