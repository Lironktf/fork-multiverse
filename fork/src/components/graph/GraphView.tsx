"use client";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import { engine, basketProximity, markDragEnd, justDragged } from "@/lib/client/runtime";
import { addEventToBasket, navigateTo, focusCurrent, fitConstellationK } from "@/lib/client/actions";
import { targetKey } from "@/lib/domain/types";
import { buildGraph, type NodeMeta } from "./model";
import { GraphNodeBody } from "./nodes";
import type { NodeSpec } from "./engine";

function describe(meta: NodeMeta): string {
  switch (meta.kind) {
    case "target":
      return `Target: ${meta.event?.title}, outcome ${meta.outcome}`;
    case "forecast":
      return `Analyst ${meta.role} estimate`;
    case "disagreement":
      return "Significant model disagreement — open details";
    case "assumption":
      return `${meta.layer === "new" ? "Assumed here" : "Inherited"}: ${meta.event?.title} = ${meta.outcome}`;
    case "pending":
      return `In basket: ${meta.event?.title} = ${meta.outcome}`;
    case "event":
      return `Related event: ${meta.event.title}. Press Enter for options.`;
    case "verse":
      return `Verse ${meta.verse.name}, generation ${meta.verse.visualMetadata.generation}. Press Enter for options, double-click to enter.`;
  }
}

const GraphNode = memo(function GraphNode({ spec, meta, dim, hot, current }: { spec: NodeSpec; meta: NodeMeta; dim: boolean; hot: boolean; current: boolean }) {
  const ref = useCallback((el: HTMLButtonElement | null) => engine.registerEl(spec.id, el), [spec.id]);
  return (
    <button
      ref={ref}
      type="button"
      className="gnode"
      data-node={spec.id}
      data-type={spec.type}
      data-dim={dim}
      data-hot={hot}
      aria-label={describe(meta)}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        engine.beginNodeDrag(spec.id, e.nativeEvent);
      }}
      onPointerEnter={() => {
        engine.hover = spec.id;
        useUI.getState().set({ hoveredNode: spec.id });
      }}
      onPointerLeave={() => {
        if (engine.hover === spec.id) engine.hover = null;
        if (useUI.getState().hoveredNode === spec.id) useUI.getState().set({ hoveredNode: null });
      }}
      onFocus={() => {
        engine.hover = spec.id;
        useUI.getState().set({ hoveredNode: spec.id });
      }}
      onBlur={() => {
        if (engine.hover === spec.id) engine.hover = null;
      }}
      onClick={() => {
        if (justDragged()) return;
        onNodeActivate(spec.id, meta);
      }}
      onDoubleClick={() => {
        if (meta.kind === "verse") navigateTo(meta.verse.id);
        else {
          const n = engine.nodes.get(spec.id);
          if (n) engine.flyTo(n.ax, n.ay, Math.max(engine.cam.k, 1.35), 700);
        }
      }}
    >
      <div className="gnode-inner" style={{ cursor: spec.draggable === false ? "pointer" : "grab" }}>
        <GraphNodeBody meta={meta} current={current} />
      </div>
    </button>
  );
});

function onNodeActivate(id: string, meta: NodeMeta) {
  const ui = useUI.getState();
  if (meta.kind === "forecast") {
    ui.set({ inspectRole: meta.role, disagreementOpen: false, selectedNode: id });
    return;
  }
  if (meta.kind === "disagreement") {
    ui.set({ disagreementOpen: true, inspectRole: null, selectedNode: id });
    return;
  }
  ui.set({ selectedNode: ui.selectedNode === id ? null : id });
}

/** Screen y of the welcome focal orb (kept in sync with Welcome's layout). */
export function welcomeFocalY() {
  const el = document.querySelector('[data-focal="welcome"]');
  if (el) {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  }
  return window.innerHeight * 0.25;
}

export function GraphView() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  const { verses, currentVerseId, events, target, basket, forecasts, forecastIndex } = useUniverse(
    useShallow((s) => ({
      verses: s.verses,
      currentVerseId: s.currentVerseId,
      events: s.events,
      target: s.target,
      basket: s.basket,
      forecasts: s.forecasts,
      forecastIndex: s.forecastIndex,
    })),
  );
  const nextForks = useUI((s) => s.nextForks[`${currentVerseId}::${targetKey(target)}`]);
  const hovered = useUI((s) => s.hoveredNode);
  const selected = useUI((s) => s.selectedNode);

  const model = useMemo(
    () =>
      buildGraph({
        verses,
        currentVerseId,
        events,
        target,
        basket,
        forecastFor: (vid) => forecastFor({ forecasts, forecastIndex }, vid, target),
        suggestions: nextForks?.suggestions ?? [],
      }),
    [verses, currentVerseId, events, target, basket, forecasts, forecastIndex, nextForks],
  );

  useEffect(() => {
    engine.setGraph(model.nodes, model.edges);
  }, [model]);

  const related = useMemo(() => {
    const focus = hovered ?? null;
    if (!focus) return null;
    const set = new Set([focus]);
    for (const e of model.edges) {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    }
    return set;
  }, [hovered, model.edges]);

  // mount engine + input
  useEffect(() => {
    const root = rootRef.current!;
    engine.mount(root, canvasRef.current!, worldRef.current!);
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(root);
    root.addEventListener("wheel", engine.handleWheel, { passive: false });
    const down = (e: PointerEvent) => {
      if (e.target === root || e.target === canvasRef.current) engine.handleBackgroundDown(e);
    };
    root.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", engine.handlePointerMove);
    window.addEventListener("pointerup", engine.handlePointerUp);
    window.addEventListener("pointercancel", engine.handlePointerUp);

    engine.onBackgroundClick = () => useUI.getState().set({ selectedNode: null });
    engine.onEdgeHover = (edge, x, y) => {
      const tip = edgeTipRef.current;
      if (!tip) return;
      if (!edge?.label) {
        tip.style.opacity = "0";
        return;
      }
      tip.textContent = edge.label;
      tip.style.opacity = "1";
      tip.style.transform = `translate3d(${x + 14}px, ${y + 12}px, 0)`;
    };
    engine.onNodeDragMove = (_id, x, y) => {
      const p = basketProximity(x, y);
      const meta = modelRef.current.meta.get(_id);
      if (meta?.kind === "event") useUI.getState().set({ basketHot: p.hot });
    };
    engine.onNodeDrop = (id, x, y) => {
      markDragEnd();
      useUI.getState().set({ basketHot: 0 });
      const meta = modelRef.current.meta.get(id);
      if (meta?.kind === "event" && basketProximity(x, y).hot > 0.55) {
        addEventToBasket(meta.event, undefined, { x, y });
        return true;
      }
      return false;
    };

    // initial camera: frame the current Verse
    const s = useUniverse.getState();
    const v = s.verses[s.currentVerseId];
    if (s.started) {
      engine.cam = { x: v.visualMetadata.x, y: v.visualMetadata.y, k: fitConstellationK() * 0.82 };
      focusCurrent();
    } else {
      // first launch: the universe is a distant field of nodes behind the question
      // the Origin's target sits exactly behind the welcome focal point, so the orb becomes the node
      const orbY = welcomeFocalY();
      const dy = window.innerHeight / 2 - orbY;
      engine.cam = { x: v.visualMetadata.x, y: v.visualMetadata.y + dy / 0.24, k: 0.24 };
      engine.flyTo(v.visualMetadata.x, v.visualMetadata.y + dy / 0.3, 0.3, 4000);
    }

    return () => {
      ro.disconnect();
      root.removeEventListener("wheel", engine.handleWheel);
      root.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", engine.handlePointerMove);
      window.removeEventListener("pointerup", engine.handlePointerUp);
      window.removeEventListener("pointercancel", engine.handlePointerUp);
      engine.unmount();
    };
  }, []);

  const edgeTipRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== rootRef.current) return;
    const step = 80;
    const map: Record<string, () => void> = {
      ArrowLeft: () => engine.panBy(-step, 0),
      ArrowRight: () => engine.panBy(step, 0),
      ArrowUp: () => engine.panBy(0, -step),
      ArrowDown: () => engine.panBy(0, step),
      "+": () => engine.zoomBy(1.2),
      "=": () => engine.zoomBy(1.2),
      "-": () => engine.zoomBy(1 / 1.2),
      "0": () => engine.fitAll(),
      f: () => focusCurrent(),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div
      ref={rootRef}
      className="graph-root"
      tabIndex={0}
      role="application"
      aria-roledescription="multiverse graph"
      aria-label="Multiverse graph. Arrow keys pan, plus and minus zoom, 0 fits everything, F focuses the current Verse. Tab moves between nodes."
      onKeyDown={onKeyDown}
      data-zoom="near"
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden />
      <div
        ref={edgeTipRef}
        role="tooltip"
        className="pointer-events-none fixed left-0 top-0 z-30 rounded-[5px] border border-line-2 bg-[#0e0e11] px-2 py-1 text-[10.5px] text-ink-2 opacity-0 transition-opacity duration-150"
      />
      <div ref={worldRef} className="graph-world">
        {model.nodes.map((n) => (
          <GraphNode
            key={n.id}
            spec={n}
            meta={model.meta.get(n.id)!}
            dim={!!related && !related.has(n.id)}
            hot={hovered === n.id || selected === n.id}
            current={false}
          />
        ))}
      </div>
    </div>
  );
}
