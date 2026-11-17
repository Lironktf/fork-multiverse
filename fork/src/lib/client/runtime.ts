"use client";
/** Small client-side registry for cross-component DOM handles (no React re-renders). */
import { GraphEngine } from "@/components/graph/engine";

export const engine = typeof window !== "undefined" ? new GraphEngine() : (null as unknown as GraphEngine);

export const dom = {
  basket: null as HTMLElement | null,
};

/** Distance from a screen point to the basket surface (0 when inside). */
export function basketProximity(x: number, y: number): { inside: boolean; hot: number; rect: DOMRect | null } {
  const el = dom.basket;
  if (!el) return { inside: false, hot: 0, rect: null };
  const r = el.getBoundingClientRect();
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  const d = Math.hypot(dx, dy);
  const RANGE = 220;
  return { inside: d === 0, hot: Math.max(0, 1 - d / RANGE), rect: r };
}

let lastDragEnd = 0;
export const markDragEnd = () => (lastDragEnd = performance.now());
export const justDragged = () => performance.now() - lastDragEnd < 120;

// debugging / e2e hook (development only)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __forkEngine: unknown }).__forkEngine = engine;
