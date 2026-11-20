"use client";
import { Compass, GitFork } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse } from "@/store/universe";
import { ancestry } from "@/lib/domain/verse";
import { navigateTo } from "@/lib/client/actions";
import { useUI } from "@/store/ui";

export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label="FORK">
      <GitFork size={lg ? 22 : 14} strokeWidth={1.6} className="text-accent" aria-hidden />
      <span className={`font-semibold text-ink ${lg ? "text-[22px] tracking-[0.42em]" : "text-[12.5px] tracking-[0.34em]"}`}>FORK</span>
    </span>
  );
}

export function TopLeft({ openAtlas }: { openAtlas: () => void }) {
  const { verses, currentVerseId } = useUniverse(useShallow((s) => ({ verses: s.verses, currentVerseId: s.currentVerseId })));
  const busy = useUI((s) => s.forkPhase !== "idle");
  const path = ancestry(verses, currentVerseId);
  const cur = verses[currentVerseId];
  return (
    <div className="pointer-events-auto flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Wordmark />
        <button type="button" className="ibtn !h-7 !px-2" disabled={busy} onClick={openAtlas}><Compass size={13} /> Atlas</button>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: `hsl(${cur.visualMetadata.hue} 75% 70%)`, boxShadow: `0 0 10px hsl(${cur.visualMetadata.hue} 80% 65% / .7)` }}
          aria-hidden
        />
        <span className="text-[13px] font-medium text-ink" data-testid="current-verse-name">
          {cur.name}
        </span>
        <span className="num text-[10px] text-ink-3">G{cur.visualMetadata.generation}</span>
      </div>
      <nav aria-label="Verse ancestry" className="-mt-1 flex max-w-[420px] flex-wrap items-center gap-x-1 gap-y-0.5">
        {path.map((v, i) => (
          <span key={v.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-ink-3">/</span>}
            <button
              type="button"
              disabled={busy || v.id === currentVerseId}
              onClick={() => navigateTo(v.id)}
              className={`num rounded px-0.5 text-[10px] uppercase tracking-[0.1em] transition-colors ${v.id === currentVerseId ? "text-ink-2" : "text-ink-3 hover:text-accent"}`}
            >
              {v.name}
            </button>
          </span>
        ))}
      </nav>
    </div>
  );
}
