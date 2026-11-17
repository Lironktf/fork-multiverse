"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useSpring } from "motion/react";
import { useUI } from "@/store/ui";
import { useUniverse } from "@/store/universe";
import { basketProximity } from "@/lib/client/runtime";
import { addEventToBasket } from "@/lib/client/actions";

/**
 * Pointer-driven drag from the discovery panel into the basket.
 *   detach → follow (spring) → basket reacts → magnetic pull → land / fly home
 * Started by `beginEventDrag` once a press moves > 6px; a plain click never drags.
 */
export function beginEventDrag(e: React.PointerEvent, eventId: string, title: string, from: "discovery" | "suggestion" = "discovery", outcome?: string) {
  if (e.button !== 0 || useUI.getState().forkPhase !== "idle") return;
  const sx = e.clientX;
  const sy = e.clientY;
  const el = e.currentTarget as HTMLElement;
  const move = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    cleanup();
    const r = el.getBoundingClientRect();
    useUI.getState().set({ drag: { eventId, title, outcome, origin: { x: r.left + 18, y: r.top + r.height / 2 }, from } });
    pending = { x: ev.clientX, y: ev.clientY };
  };
  const up = () => cleanup();
  const cleanup = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
let pending: { x: number; y: number } | null = null;

export function DragLayer() {
  const drag = useUI((s) => s.drag);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 900, damping: 50, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 900, damping: 50, mass: 0.6 });
  const [hot, setHot] = useState(0);
  const [landing, setLanding] = useState(false);
  const scale = useSpring(1, { stiffness: 400, damping: 28 });
  const opacity = useMotionValue(1);
  const live = useRef(false);

  useEffect(() => {
    if (!drag) return;
    live.current = true;
    setLanding(false);
    opacity.set(1);
    x.jump(drag.origin.x);
    y.jump(drag.origin.y);
    sx.jump(drag.origin.x);
    sy.jump(drag.origin.y);
    scale.set(1.04);
    if (pending) {
      x.set(pending.x);
      y.set(pending.y);
    }
    document.body.style.cursor = "grabbing";

    const onMove = (e: PointerEvent) => {
      if (!live.current) return;
      const p = basketProximity(e.clientX, e.clientY);
      setHot(p.hot);
      useUI.getState().set({ basketHot: p.hot });
      // magnetic attraction: the closer, the more the item is pulled toward the tray
      if (p.rect && p.hot > 0.35) {
        const pull = Math.pow((p.hot - 0.35) / 0.65, 1.6) * 0.55;
        const tx = p.rect.left + p.rect.width / 2;
        const ty = p.rect.top + Math.min(p.rect.height - 40, 90);
        x.set(e.clientX + (tx - e.clientX) * pull);
        y.set(e.clientY + (ty - e.clientY) * pull);
        scale.set(1.04 - p.hot * 0.1);
      } else {
        x.set(e.clientX);
        y.set(e.clientY);
        scale.set(1.04);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!live.current) return;
      live.current = false;
      document.body.style.cursor = "";
      const p = basketProximity(e.clientX, e.clientY);
      const ev = useUniverse.getState().events[drag.eventId];
      if (ev && p.hot > 0.55 && p.rect) {
        setLanding(true);
        x.set(p.rect.left + p.rect.width / 2);
        y.set(p.rect.top + Math.min(p.rect.height - 40, 90));
        scale.set(0.7);
        animate(opacity, 0, { duration: 0.22, delay: 0.08 });
        // the new pending node is born at the tray and travels into its orbit
        addEventToBasket(ev, drag.outcome, { x: p.rect.left + 24, y: p.rect.top + 40 });
      } else {
        // fly home and dissolve
        x.set(drag.origin.x);
        y.set(drag.origin.y);
        scale.set(0.9);
        animate(opacity, 0, { duration: 0.3, delay: 0.12 });
      }
      useUI.getState().set({ basketHot: 0 });
      setTimeout(() => useUI.getState().set({ drag: null }), 380);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onUp(new PointerEvent("pointerup", { clientX: -9999, clientY: -9999 }));
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      document.body.style.cursor = "";
    };
  }, [drag, x, y, sx, sy, scale, opacity]);

  return (
    <AnimatePresence>
      {drag && (
        <motion.div
          key={drag.eventId + drag.origin.x}
          className="pointer-events-none fixed left-0 top-0 z-[80]"
          style={{ x: sx, y: sy, scale, opacity }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden
        >
          <div
            className="-translate-x-4 -translate-y-1/2 flex max-w-[280px] items-center gap-2.5 rounded-[9px] border bg-[#0b0b0d]/95 py-2 pl-2.5 pr-3.5 text-[12px] text-ink shadow-2xl"
            style={{
              borderColor: `rgba(124,214,255,${0.25 + hot * 0.6})`,
              boxShadow: `0 18px 50px -12px rgba(0,0,0,.9), 0 0 ${20 + hot * 40}px -10px rgba(124,214,255,${0.3 + hot * 0.5})`,
              rotate: landing ? "0deg" : `${(1 - hot) * -1.5}deg`,
            }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" style={{ boxShadow: "0 0 10px rgba(124,214,255,.8)" }} />
            <span className="line-clamp-2 leading-snug">{drag.title}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

