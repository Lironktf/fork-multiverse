"use client";
import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Columns2, Minus, Pencil, Plus, Target as TargetIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import { engine } from "@/lib/client/runtime";
import { addEventToBasket, navigateTo } from "@/lib/client/actions";
import { buildGraph, type NodeMeta } from "./model";
import { fmtPct, observedProbability } from "@/lib/domain/market";
import { SourceTag, KindTag } from "@/components/ui/tags";
import { MODEL_ROLES } from "@/lib/domain/types";
import { finalProbability } from "@/lib/forecast/aggregate";
import { fmtDate } from "@/components/discovery/EventRow";

/** Hover → quiet tooltip. Click → the same card pinned, with actions. Follows its node every frame. */
export function NodePopover() {
  const { hovered, selected, phase } = useUI(useShallow((s) => ({ hovered: s.hoveredNode, selected: s.selectedNode, phase: s.forkPhase })));
  const st = useUniverse(useShallow((s) => ({ verses: s.verses, currentVerseId: s.currentVerseId, events: s.events, target: s.target, basket: s.basket, forecasts: s.forecasts, forecastIndex: s.forecastIndex })));
  const model = useMemo(
    () =>
      buildGraph({
        ...st,
        forecastFor: (v) => forecastFor(st, v, st.target),
        suggestions: [],
      }),
    [st],
  );
  const id = selected ?? hovered;
  const meta = id ? model.meta.get(id) : undefined;
  const pinned = !!selected && selected === id;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const place = () => {
      const p = engine.nodeScreen(id);
      const el = ref.current;
      if (!p || !el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x = p.x + p.r + 14;
      if (x + w > window.innerWidth - 12) x = p.x - p.r - 14 - w;
      const y = Math.max(12, Math.min(window.innerHeight - h - 12, p.y - h / 2));
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };
    place();
    return engine.onFrame(place);
  }, [id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && useUI.getState().set({ selectedNode: null });
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const show = !!meta && phase === "idle" && !(meta.kind === "target" && !pinned) && meta.kind !== "forecast" && meta.kind !== "disagreement";

  return (
    <div ref={ref} className={`fixed left-0 top-0 z-30 ${pinned ? "pointer-events-auto" : "pointer-events-none"}`} style={{ willChange: "transform" }}>
      <AnimatePresence mode="wait">
        {show && meta && (
          <motion.div
            key={id}
            initial={{ opacity: 0, scale: 0.97, x: -4 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`surface w-[270px] p-3 text-[11.5px] ${pinned ? "ring-1 ring-accent/25" : ""}`}
            role={pinned ? "dialog" : "tooltip"}
            data-testid="node-popover"
          >
            <Body meta={meta} pinned={pinned} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Body({ meta, pinned }: { meta: NodeMeta; pinned: boolean }) {
  const close = () => useUI.getState().set({ selectedNode: null });
  switch (meta.kind) {
    case "event": {
      const e = meta.event;
      return (
        <>
          <div className="flex items-center gap-1.5">
            <SourceTag source={e.source} small />
            <span className="meta">{meta.relation === "model-suggested" ? "model-inferred link" : "illustrative link"}</span>
          </div>
          <div className="mt-1.5 text-[12.5px] leading-snug text-ink">{e.title}</div>
          {e.description && <p className="mt-1 line-clamp-3 text-ink-3">{e.description}</p>}
          <p className="mt-2 text-[10.5px] text-ink-3">{meta.relation === "model-suggested" ? "A model suggested this may move the target. That is a hypothesis, not established causality." : "Demo fixture: an authored, illustrative dependency."}</p>
          {pinned ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {e.possibleOutcomes.slice(0, 3).map((o) => (
                <button key={o} className="btn !h-7 !text-[11px]" onClick={() => addEventToBasket(e, o) && close()}>
                  <Plus size={11} /> Assume {o.length > 14 ? o.slice(0, 13) + "…" : o}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-ink-3">Drag into the basket, or click for options.</p>
          )}
        </>
      );
    }
    case "assumption":
    case "pending": {
      const e = meta.event;
      const obs = e ? observedProbability(e, meta.outcome) : null;
      return (
        <>
          <div className="flex items-center gap-1.5">
            {e && <SourceTag source={e.source} small />}
            <span className="meta">{meta.kind === "pending" ? "proposed · in basket" : meta.layer === "new" ? "assumed in this Verse" : "inherited"}</span>
          </div>
          <div className="mt-1.5 text-[12.5px] leading-snug text-ink">{e?.title}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="num text-[11px] text-accent">assumes {meta.outcome}</span>
            {obs && (
              <span className="num text-[10.5px] text-ink-3">
                {obs.kind === "MARKET" ? "market" : "illustr."} {fmtPct(obs.value)}
              </span>
            )}
          </div>
          {e?.resolutionCriteria && <p className="mt-1.5 line-clamp-3 text-[10.5px] text-ink-3">{e.resolutionCriteria}</p>}
          {pinned && meta.kind === "pending" && (
            <button className="btn mt-2.5 !h-7 !text-[11px]" onClick={() => (useUniverse.getState().removeFromBasket(meta.uid), close())}>
              <Minus size={11} /> Remove from basket
            </button>
          )}
          {meta.kind === "assumption" && meta.layer === "inherited" && <p className="mt-2 text-[10px] text-ink-3">Inherited from an ancestor Verse; it defines this world and can’t be removed here.</p>}
        </>
      );
    }
    case "verse": {
      const v = meta.verse;
      return (
        <>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${v.visualMetadata.hue} 75% 70%)` }} />
            <span className="text-[13px] font-medium text-ink">{v.name}</span>
            <span className="num text-[10px] text-ink-3">G{v.visualMetadata.generation}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-ink-3">
            <span className="num text-[16px] text-ink">{meta.forecast?.ensembleProbability != null ? fmtPct(meta.forecast.ensembleProbability) : "—"}</span>
            {meta.forecast && <KindTag kind={meta.forecast.kind} small />}
            <span className="text-[10.5px]">{v.newAssumptions.length} new · {v.inheritedAssumptions.length} inherited</span>
          </div>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {v.newAssumptions.slice(0, 4).map((a) => (
              <li key={a.eventId} className="truncate text-[10.5px] text-ink-2">
                + {useUniverse.getState().events[a.eventId]?.title} <span className="num text-accent">{a.selectedOutcome}</span>
              </li>
            ))}
          </ul>
          <div className="num mt-1.5 text-[9.5px] text-ink-3">created {fmtDate(v.createdAt)}</div>
          {pinned && (
            <div className="mt-2.5 flex gap-1.5">
              <button className="btn !h-7 !text-[11px]" onClick={() => (navigateTo(v.id), close())} data-testid="enter-verse">
                <ArrowRight size={11} /> Enter
              </button>
              <button className="btn !h-7 !text-[11px]" onClick={() => useUniverse.getState().toggleCompare(v.id)}>
                <Columns2 size={11} /> {useUniverse.getState().compare.includes(v.id) ? "Selected" : "Compare"}
              </button>
            </div>
          )}
        </>
      );
    }
    case "target": {
      const f = meta.forecast;
      return (
        <>
          <div className="flex items-center gap-1.5">
            {meta.event && <SourceTag source={meta.event.source} small />}
            <span className="meta">target · {meta.outcome}</span>
          </div>
          <div className="mt-1.5 text-[12.5px] leading-snug text-ink">{meta.event?.title}</div>
          {meta.event?.resolutionCriteria && <p className="mt-1 line-clamp-4 text-[10.5px] text-ink-3">{meta.event.resolutionCriteria}</p>}
          {f && (
            <ul className="mt-2 flex flex-col gap-0.5">
              {f.modelOutputs.map((r) => (
                <li key={r.role} className="flex justify-between text-[10.5px] text-ink-2">
                  <span>{MODEL_ROLES[r.role].label}</span>
                  <span className="num">{fmtPct(finalProbability(r))}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 flex gap-1.5">
            <button className="btn !h-7 !text-[11px]" onClick={() => (useUI.getState().set({ palette: true, selectedNode: null }))}>
              <TargetIcon size={11} /> Change target
            </button>
            <button
              className="btn !h-7 !text-[11px]"
              onClick={() => {
                const v = useUniverse.getState().verses[useUniverse.getState().currentVerseId];
                useUI.getState().set({ namingVerseId: v.id, selectedNode: null });
              }}
            >
              <Pencil size={11} /> Rename world
            </button>
          </div>
        </>
      );
    }
    default:
      return null;
  }
}
