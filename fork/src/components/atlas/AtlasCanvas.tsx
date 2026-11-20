"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, Plus } from "lucide-react";

export function AtlasCanvas({ width, height, focus, label, children }: {
  width: number; height: number; focus?: { x: number; y: number }; label: string; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const fit = () => {
    setZoom(Math.min(1, Math.max(0.4, Math.min(size.width / width, size.height / height))));
    root.current?.scrollTo(0, 0);
  };

  useEffect(() => {
    const viewport = root.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => setSize({ width: viewport.clientWidth, height: viewport.clientHeight }));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const x = focus?.x;
  const y = focus?.y;
  useEffect(() => {
    if (x == null || y == null) return;
    const viewport = root.current;
    if (!viewport) return;
    if (x * zoom + 100 > viewport.scrollLeft + viewport.clientWidth || x * zoom < viewport.scrollLeft) {
      viewport.scrollLeft = x * zoom - viewport.clientWidth / 2;
    }
    if (y * zoom + 50 > viewport.scrollTop + viewport.clientHeight || y * zoom < viewport.scrollTop) {
      viewport.scrollTop = y * zoom - viewport.clientHeight / 2;
    }
  }, [x, y, zoom]);

  return <div className="relative">
    <div ref={root} tabIndex={0} aria-label={label} className="atlas-canvas h-[clamp(395px,68vh,830px)] overflow-auto"
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as Element).closest("button, a, input")) return;
        const viewport = event.currentTarget;
        drag.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
        viewport.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
        event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
      }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <div className="relative mx-auto overflow-hidden" style={{ width: width * zoom, height: height * zoom }}>
        <div className="relative origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>{children}</div>
      </div>
    </div>
    <div className="surface absolute bottom-3 right-3 flex items-center gap-1 p-1" aria-label="Map controls">
      <button type="button" className="ibtn !h-8 !px-2" aria-label="Zoom out" disabled={zoom <= 0.4} onClick={() => setZoom(Math.max(0.4, zoom - 0.15))}><Minus size={14} /></button>
      <span className="num text-xs text-ink-2">{Math.round(zoom * 100)}%</span>
      <button type="button" className="ibtn !h-8 !px-2" aria-label="Zoom in" disabled={zoom >= 1.75} onClick={() => setZoom(Math.min(1.75, zoom + 0.15))}><Plus size={14} /></button>
      <button type="button" className="ibtn !h-8 !px-2" aria-label="Fit map to view" onClick={fit}><Maximize size={14} /></button>
    </div>
  </div>;
}
