"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsRight, Compass, Layers, ShoppingBasket } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { GraphView } from "@/components/graph/GraphView";
import { NodePopover } from "@/components/graph/NodePopover";
import { TopLeft } from "@/components/hud/TopLeft";
import { TargetSelector } from "@/components/hud/TargetSelector";
import { ActionBar, TopRight } from "@/components/hud/Controls";
import { Palette } from "@/components/hud/Palette";
import { Toasts } from "@/components/hud/Toasts";
import { DiscoveryPanel } from "@/components/discovery/DiscoveryPanel";
import { Basket } from "@/components/basket/Basket";
import { DragLayer } from "@/components/basket/DragLayer";
import { ForecastPanel } from "@/components/forecast/ForecastPanel";
import { NamingCard } from "@/components/verse/NamingCard";
import { ComparePanel } from "@/components/verse/ComparePanel";
import { SolanaProvider } from "@/components/solana/SolanaProvider";
import { Welcome } from "@/components/Welcome";
import { useUniverse } from "@/store/universe";
import { useUI, prefersReducedMotion } from "@/store/ui";
import { engine } from "@/lib/client/runtime";
import { pollForecasts } from "@/lib/client/actions";

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    const done = () => setH(true);
    if (useUniverse.persist.hasHydrated()) done();
    return useUniverse.persist.onFinishHydration(done);
  }, []);
  return h;
}

function useMedia(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    setM(mq.matches);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}

/** Background services: forecast polling, server mirror, motion preference, shortcuts. */
function Services() {
  const reduced = useUI((s) => s.reducedMotion);
  useEffect(() => {
    const apply = () => {
      engine.reduced = prefersReducedMotion();
      document.documentElement.dataset.reduced = String(engine.reduced);
    };
    apply();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [reduced]);

  useEffect(() => {
    const t = setInterval(pollForecasts, 1500);
    pollForecasts();
    return () => clearInterval(t);
  }, []);

  // mirror the universe to the server (SQLite), debounced; restore if local storage was wiped
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failedOnce = false;
    const push = () => {
      const s = useUniverse.getState();
      const body = { verses: s.verses, forecasts: s.forecasts, forecastIndex: s.forecastIndex, events: Object.fromEntries(Object.entries(s.events).filter(([, e]) => e.source !== "demo")), attestations: s.attestations, target: s.target };
      fetch("/api/universe", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.universeId, universe: body }) })
        .then((r) => r.json())
        .then((j) => {
          if (!j.ok) throw new Error(j.error);
          failedOnce = false;
        })
        .catch(() => {
          if (!failedOnce) useUI.getState().toast("Server backup unavailable — your universe is still saved in this browser.", "warn");
          failedOnce = true;
        });
    };
    const unsub = useUniverse.subscribe((s, p) => {
      if (s.verses === p.verses && s.forecasts === p.forecasts && s.attestations === p.attestations) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(push, 1500);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) useUniverse.getState().redoBasket();
        else useUniverse.getState().undoBasket();
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        useUI.getState().set({ palette: true });
      }
      if (e.key === "Escape" && !typing) {
        const ui = useUI.getState();
        if (ui.panel) ui.set({ panel: null });
        else if (ui.inspectRole || ui.disagreementOpen) ui.set({ inspectRole: null, disagreementOpen: false });
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return null;
}

function Workspace() {
  const { phase, panel } = useUI(useShallow((s) => ({ phase: s.forkPhase, panel: s.panel })));
  const desktop = useMedia("(min-width: 1100px)");
  const tablet = useMedia("(min-width: 760px)");
  const [discovery, setDiscovery] = useState(true);
  const [sheet, setSheet] = useState<"forecast" | "basket" | "discover">("basket");
  const cinematic = phase === "rupture" || phase === "travel" || phase === "arrive";
  const hudFade = { opacity: cinematic ? 0.08 : 1, transition: { duration: cinematic ? 0.25 : 0.6 } };

  useEffect(() => {
    if (tablet && !desktop) setDiscovery(false);
  }, [tablet, desktop]);

  return (
    <>
      <motion.div animate={hudFade} className="pointer-events-none fixed inset-0 z-10">
        {/* top bar */}
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
          <TopLeft />
          {tablet && (
            <div className="absolute left-1/2 top-0 -translate-x-1/2">
              <TargetSelector />
            </div>
          )}
          <TopRight />
        </div>
        {!tablet && (
          <div className="absolute inset-x-3 top-[104px] flex justify-center overflow-x-auto">
            <TargetSelector />
          </div>
        )}

        {tablet ? (
          <>
            {/* left: discovery */}
            <AnimatePresence initial={false}>
              {discovery ? (
                <motion.div key="disc" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="absolute bottom-[78px] left-4 top-[124px] w-[min(316px,30vw)]">
                  <DiscoveryPanel onCollapse={() => setDiscovery(false)} />
                </motion.div>
              ) : (
                <motion.button key="rail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDiscovery(true)} className="surface pointer-events-auto absolute left-4 top-[124px] flex h-9 items-center gap-2 px-3 text-[11.5px] text-ink-2 hover:text-ink" aria-label="Open event discovery">
                  <ChevronsRight size={13} /> Possible futures
                </motion.button>
              )}
            </AnimatePresence>
            {/* right: forecast + basket */}
            <div className="absolute bottom-[78px] right-4 top-[64px] flex w-[min(352px,34vw)] flex-col justify-end gap-3">
              <div className="flex min-h-[160px] flex-1 flex-col justify-start">
                <ForecastPanel />
              </div>
              <div className="flex max-h-[48%] shrink-0 flex-col">
                <Basket />
              </div>
            </div>
            {/* bottom */}
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
              <ActionBar onAddEvent={() => setDiscovery(true)} />
            </div>
          </>
        ) : (
          <div className="absolute inset-x-2 bottom-2 flex max-h-[52vh] flex-col gap-2">
            <div className="min-h-0 flex-1 overflow-hidden">
              {sheet === "forecast" && <ForecastPanel />}
              {sheet === "basket" && <Basket compact />}
              {sheet === "discover" && (
                <div className="h-[46vh]">
                  <DiscoveryPanel />
                </div>
              )}
            </div>
            <nav className="surface pointer-events-auto flex justify-around p-1" aria-label="Panels">
              {(
                [
                  ["discover", <Compass key="c" size={14} />, "Discover"],
                  ["basket", <ShoppingBasket key="b" size={14} />, "Basket"],
                  ["forecast", <Layers key="f" size={14} />, "Forecast"],
                ] as const
              ).map(([k, icon, label]) => (
                <button key={k} className="ibtn flex-1 !h-9 text-[11.5px]" aria-pressed={sheet === k} onClick={() => setSheet(k)}>
                  {icon} {label}
                </button>
              ))}
            </nav>
          </div>
        )}
      </motion.div>

      {/* naming lives above the HUD fade so it can appear during reveal */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-30 flex justify-center px-3">
        <NamingCard />
      </div>
      <NodePopover />
      <AnimatePresence>{panel === "compare" && <ComparePanel />}</AnimatePresence>
    </>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

export function ForkApp() {
  const hydrated = useHydrated();
  const started = useUniverse((s) => s.started);
  return (
    <QueryClientProvider client={queryClient}>
      <SolanaProvider>
        <main className="fixed inset-0 overflow-hidden bg-bg" data-started={started}>
          {hydrated && (
            <>
              <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: started ? 1 : 0.55 }} transition={{ duration: 1.2 }}>
                <GraphView />
              </motion.div>
              <Services />
              <AnimatePresence>{started ? <Workspace key="ws" /> : <Welcome key="welcome" />}</AnimatePresence>
              <DragLayer />
              <Palette />
              <Toasts />
            </>
          )}
        </main>
      </SolanaProvider>
    </QueryClientProvider>
  );
}
