"use client";
import { AnimatePresence, motion } from "motion/react";
import * as Popover from "@radix-ui/react-popover";
import { Columns2, CornerLeftUp, Crosshair, GitFork, Layers, Minus, Orbit, Plus, Scan, Search, SlidersHorizontal, Compass } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse } from "@/store/universe";
import { useUI } from "@/store/ui";
import { engine } from "@/lib/client/runtime";
import { focusCurrent, navigateTo, requestNextForks } from "@/lib/client/actions";
import { ORIGIN_ID } from "@/lib/domain/verse";
import { SavedVerses } from "@/components/verse/SavedVerses";
import { WalletButton } from "@/components/solana/WalletButton";
import { useQuery } from "@tanstack/react-query";

function Settings() {
  const { engineMode, setEngine, providers, setProviders } = useUniverse(
    useShallow((s) => ({ engineMode: s.engine, setEngine: s.setEngine, providers: s.providers, setProviders: s.setProviders })),
  );
  const reduced = useUI((s) => s.reducedMotion);
  const status = useQuery({ queryKey: ["status"], queryFn: () => fetch("/api/status").then((r) => r.json()), staleTime: 60_000 });
  return (
    <div className="w-[300px] p-3.5 text-[11.5px]" data-testid="settings">
      <div className="meta mb-2">Forecast engine</div>
      <div className="seg w-full" role="radiogroup" aria-label="Forecast engine">
        {(["auto", "demo"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={engineMode === m} onClick={() => setEngine(m)} className={`flex-1 ${engineMode === m ? "bg-white/[0.08]" : ""}`} data-testid={`engine-${m}`}>
            {m === "auto" ? "LIVE MODELS" : "DEMONSTRATION"}
          </button>
        ))}
      </div>
      {engineMode === "auto" && (
        <>
          <div className="meta mb-2 mt-3">Analysts</div>
          <div className="seg w-full" role="radiogroup" aria-label="Analyst model providers">
            {(["mixed", "claude", "codex", "grok"] as const).map((m) => {
              const ok = !status.data || (m === "mixed" ? [status.data.claude, status.data.codex, status.data.grok].filter(Boolean).length > 1 : status.data[m]);
              return (
                <button key={m} role="radio" aria-checked={providers === m} disabled={!ok} onClick={() => setProviders(m)} className={`flex-1 ${providers === m ? "bg-white/[0.08]" : ""} disabled:opacity-30`} data-testid={`providers-${m}`}>
                  {m.toUpperCase()}
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className="mt-2 leading-relaxed text-ink-3">
        {!status.data
          ? "Checking engine…"
          : engineMode === "demo"
            ? "Labelled demonstration fixtures — instant and deterministic."
            : status.data.engine === "demo"
              ? "No model CLI on this server — forecasts fall back to labelled demonstration fixtures."
              : providers === "mixed"
                ? status.data.grok
                  ? "A Claude · B Codex · C Grok · D Codex. Research and next-fork search fan out to all three in parallel. Different families — still not independent forecasters."
                  : "Analysts A & C run on Claude (claude -p), B & D on Codex (codex exec). Two model families — still not independent forecasters."
                : providers === "claude"
                  ? `All four analysts on Claude “${status.data.model}” via claude -p.`
                  : providers === "grok"
                    ? "All four analysts on Grok via grok -p (research uses Grok web search)."
                    : "All four analysts on Codex via codex exec (research uses Codex web search)."}
      </p>
      <div className="mt-1.5 flex gap-2 text-[10px] text-ink-3">
        <span className={status.data?.claude ? "text-up/80" : ""}>● claude {status.data?.claude ? "ready" : "missing"}</span>
        <span className={status.data?.codex ? "text-up/80" : ""}>● codex {status.data?.codex ? "ready" : "missing"}</span>
        <span className={status.data?.grok ? "text-up/80" : ""}>● grok {status.data?.grok ? "ready" : "missing"}</span>
      </div>
      <div className="meta mb-2 mt-4">Motion</div>
      <div className="seg w-full" role="radiogroup" aria-label="Motion preference">
        {(["system", "reduce", "full"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={reduced === m} onClick={() => useUI.getState().set({ reducedMotion: m })} className={`flex-1 ${reduced === m ? "bg-white/[0.08]" : ""}`}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="meta mb-2 mt-4">Legend</div>
      <ul className="flex flex-col gap-1.5 text-ink-2">
        <li className="flex items-center gap-2"><span className="h-px w-6 bg-accent" />Assumed in this Verse</li>
        <li className="flex items-center gap-2"><span className="h-px w-6 bg-white/40" />Inherited assumption</li>
        <li className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-accent" />Proposed (in basket)</li>
        <li className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-white/40" />Model-inferred / illustrative dependency</li>
        <li className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-warn" />Contradiction / disagreement</li>
        <li className="flex items-center gap-2"><span className="h-px w-6 bg-up" /><span className="h-px w-6 bg-down" />Analyst above / below baseline</li>
      </ul>
      <div className="mt-4 border-t border-line pt-3">
        <button
          className="btn !h-7 !border-down/30 !text-[11px] !text-down"
          onClick={() => {
            if (useUI.getState().forkPhase !== "idle") return;
            useUniverse.getState().resetUniverse();
            useUI.getState().toast("Universe reset to Origin.");
            setTimeout(() => focusCurrent(), 50);
          }}
        >
          Reset universe
        </button>
      </div>
    </div>
  );
}

export function TopRight() {
  const panel = useUI((s) => s.panel);
  const set = useUI((s) => s.set);
  return (
    <div className="pointer-events-auto relative flex items-center gap-0.5 rounded-lg border border-line bg-surface/80 p-0.5 backdrop-blur">
      <button className="ibtn" onClick={() => set({ palette: true })} aria-label="Search (⌘K)" title="Search  ⌘K">
        <Search size={14} />
      </button>
      <button className="ibtn" aria-pressed={panel === "saved"} onClick={() => set({ panel: panel === "saved" ? null : "saved" })} aria-label="Saved Verses" title="Saved Verses" data-testid="open-saved">
        <Layers size={14} />
      </button>
      <button className="ibtn" aria-pressed={panel === "compare"} onClick={() => set({ panel: panel === "compare" ? null : "compare" })} aria-label="Compare Verses" title="Compare Verses" data-testid="open-compare">
        <Columns2 size={14} />
      </button>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button className="ibtn" aria-label="View settings" title="Settings">
            <SlidersHorizontal size={14} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={8} className="surface z-50">
            <Settings />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button className="ibtn !px-3" onClick={() => useUI.getState().set({ workspaceTab: "trade" })} aria-label="Trade markets">Trade</button>
      <span className="mx-0.5 h-4 w-px bg-line" />
      <WalletButton />
      <AnimatePresence>
        {panel === "saved" && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-40">
            <SavedVerses />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ActionBar({ onAddEvent }: { onAddEvent: () => void }) {
  const { current, verses, basketLen, target } = useUniverse(useShallow((s) => ({ current: s.currentVerseId, verses: s.verses, basketLen: s.basket.length, target: s.target })));
  const busy = useUI((s) => s.forkPhase !== "idle");
  const parent = verses[current]?.parentId;
  const Btn = ({ icon, label, onClick, disabled, testid, primary }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; testid?: string; primary?: boolean }) => (
    <motion.button whileTap={{ scale: 0.95 }} className={`ibtn !h-8 !px-2.5 whitespace-nowrap text-[11.5px] ${primary ? "!text-accent" : ""}`} onClick={onClick} disabled={disabled || busy} aria-label={label} title={label} data-testid={testid}>
      {icon}
      <span className="hidden min-[1360px]:inline">{label}</span>
    </motion.button>
  );
  return (
    <nav aria-label="Graph actions" className="pointer-events-auto flex items-center gap-0.5 rounded-[10px] border border-line bg-surface/85 p-1 backdrop-blur">
      <Btn icon={<Plus size={14} />} label="Add event" onClick={onAddEvent} testid="bar-add" />
      <Btn icon={<Compass size={14} />} label="Next fork" onClick={() => requestNextForks(current, target)} testid="bar-next-fork" />
      <Btn
        icon={<GitFork size={14} />}
        label="Fork this world"
        primary={basketLen > 0}
        onClick={() => {
          if (!basketLen) useUI.getState().toast("Drag events into the basket first — they become this world's new assumptions.", "info");
          else (document.querySelector('[data-testid="fork-reality"]') as HTMLButtonElement | null)?.focus();
        }}
      />
      <span className="mx-1 h-4 w-px bg-line" />
      <Btn icon={<CornerLeftUp size={14} />} label="Parent" onClick={() => parent && navigateTo(parent)} disabled={!parent} testid="bar-parent" />
      <Btn icon={<Orbit size={14} />} label="Origin" onClick={() => navigateTo(ORIGIN_ID)} disabled={current === ORIGIN_ID} testid="bar-origin" />
      <Btn icon={<Columns2 size={14} />} label="Compare" onClick={() => useUI.getState().set({ panel: "compare" })} />
      <span className="mx-1 h-4 w-px bg-line" />
      <button className="ibtn !h-8" onClick={() => focusCurrent()} aria-label="Focus current Verse" title="Focus  F">
        <Crosshair size={14} />
      </button>
      <button className="ibtn !h-8" onClick={() => engine.fitAll()} aria-label="Fit everything" title="Fit all  0">
        <Scan size={14} />
      </button>
      <button className="ibtn !h-8" onClick={() => engine.zoomBy(1 / 1.25)} aria-label="Zoom out">
        <Minus size={14} />
      </button>
      <button className="ibtn !h-8" onClick={() => engine.zoomBy(1.25)} aria-label="Zoom in">
        <Plus size={14} />
      </button>
    </nav>
  );
}
