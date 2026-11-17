"use client";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Search } from "lucide-react";
import { useUniverse } from "@/store/universe";
import { useUI } from "@/store/ui";
import { DEMO_TARGETS, FEATURED_TARGET_IDS } from "@/lib/demo/events";
import { useLiveEvents } from "@/lib/client/search";
import { leadQuote } from "@/components/discovery/EventRow";
import { fmtPct } from "@/lib/domain/market";
import { SourceTag } from "@/components/ui/tags";
import { TargetPicker } from "@/components/hud/TargetSelector";
import { Wordmark } from "@/components/hud/TopLeft";
import { engine } from "@/lib/client/runtime";
import { fitConstellationK, seedDemoUniverse } from "@/lib/client/actions";
import type { ForkEvent } from "@/lib/domain/types";

const LIVE_PICKS = ["RECESSION26", "CRYPTOSTRUCT26", "FED261211", "BESTAI26"];

export function Welcome() {
  const [searching, setSearching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const live = useLiveEvents("", true);
  const liveFeatured = useMemo(() => {
    const evs = live.data?.events ?? [];
    return LIVE_PICKS.map((t) => evs.find((e) => e.externalMarketId === t)).filter(Boolean).slice(0, 2) as ForkEvent[];
  }, [live.data]);
  const featured = FEATURED_TARGET_IDS.map((id) => DEMO_TARGETS.find((t) => t.id === id)!);

  const enter = (after?: () => void) => {
    if (leaving) return;
    setLeaving(true);
    after?.();
    // the focal point becomes the target node: the camera falls into the Origin
    const s = useUniverse.getState();
    const v = s.verses[s.currentVerseId];
    engine.flyTo(v.visualMetadata.x, v.visualMetadata.y, fitConstellationK(), 1300);
    setTimeout(() => useUniverse.getState().start(), 420);
  };
  const choose = (e: ForkEvent, outcome?: string) =>
    enter(() => {
      const s = useUniverse.getState();
      s.registerEvents([e]);
      s.setTarget({ eventId: e.id, outcome: outcome ?? (e.eventType === "binary" ? "YES" : leadQuote(e)?.outcome ?? e.possibleOutcomes[0]) });
      useUI.getState().set({ announce: `Target: ${e.title}` });
    });

  return (
    <motion.div className="pointer-events-none fixed inset-0 z-20 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: leaving ? 0.5 : 1.2, ease: [0.22, 1, 0.36, 1] }} data-testid="welcome">
      <div className="pointer-events-auto px-6 pt-5">
        <Wordmark />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-[8vh]">
        {/* focal point — becomes the target node */}
        <motion.div
          className="relative mb-9 h-[74px] w-[74px]"
          animate={leaving ? { scale: 3.2, opacity: 0 } : { scale: 1, opacity: 1 }}
          transition={{ duration: leaving ? 0.7 : 0.6, ease: [0.65, 0, 0.35, 1] }}
          aria-hidden
        >
          <div className="absolute inset-0 rounded-full border border-white/10" />
          <div className="absolute inset-[-14px] animate-[spin_40s_linear_infinite] rounded-full border border-dashed border-white/[0.06]" />
          <div className="absolute inset-[30px] rounded-full bg-accent" style={{ boxShadow: "0 0 30px 6px rgba(124,214,255,0.45), 0 0 80px 20px rgba(124,214,255,0.12)" }} />
          <div className="absolute left-1/2 top-[-22px] h-[22px] w-px bg-gradient-to-t from-white/25 to-transparent" />
          <div className="absolute bottom-[-30px] left-1/2 h-[30px] w-px origin-top -rotate-[28deg] bg-gradient-to-b from-white/20 to-transparent" />
          <div className="absolute bottom-[-30px] left-1/2 h-[30px] w-px origin-top rotate-[28deg] bg-gradient-to-b from-white/20 to-transparent" />
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="text-center text-[clamp(28px,4.2vw,46px)] font-medium leading-[1.08] tracking-[-0.035em] text-ink">
          Every future begins with a question.
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.8 }} className="mt-3.5 text-center text-[14px] text-ink-2">
          Choose an event. Change the assumptions. Explore what happens next.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="pointer-events-auto relative mt-8 w-[min(92vw,520px)]">
          {searching ? (
            <div className="surface overflow-hidden">
              <TargetPicker onPicked={() => enter()} />
            </div>
          ) : (
            <button onClick={() => setSearching(true)} className="group flex h-12 w-full items-center gap-3 rounded-[10px] border border-line-2 bg-surface/80 px-4 text-left backdrop-blur transition-colors hover:border-white/20" data-testid="welcome-search">
              <Search size={15} className="text-ink-3" />
              <span className="flex-1 text-[13.5px] text-ink-3">Search a prediction market or event…</span>
              <span className="kbd">/</span>
            </button>
          )}
        </motion.div>

        {!searching && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75, duration: 0.8 }} className="pointer-events-auto mt-6 w-[min(92vw,520px)]">
            <div className="meta mb-2 px-1">Begin with</div>
            <ul className="flex flex-col">
              {[...featured, ...liveFeatured].map((e, i) => {
                const q = leadQuote(e);
                return (
                  <motion.li key={e.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.06 }}>
                    <button onClick={() => choose(e)} className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/[0.035]" data-testid={`example-${e.id}`}>
                      <span className="w-[54px] shrink-0">
                        <SourceTag source={e.source} small />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 transition-colors group-hover:text-ink">
                        {e.title}
                        {e.eventType === "categorical" && q && <span className="text-ink-3"> · {q.outcome}</span>}
                      </span>
                      {q && <span className={`num text-[12px] ${q.kind === "MARKET" ? "text-market" : "text-ink-3"}`}>{fmtPct(q.p)}</span>}
                      <ArrowRight size={13} className="text-ink-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
            <div className="mt-5 flex items-center justify-between border-t border-line px-1 pt-3 text-[11px] text-ink-3">
              <span>
                <span className="text-market/90">Gemini</span> rows are live market prices · <span className="text-[#8f8a7e]">Demo</span> rows are illustrative
              </span>
              <button onClick={() => enter(seedDemoUniverse)} className="text-ink-2 underline-offset-4 hover:text-accent hover:underline" data-testid="load-demo">
                Open the demonstration universe
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
