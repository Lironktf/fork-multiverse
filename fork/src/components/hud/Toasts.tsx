"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Info, X, XCircle } from "lucide-react";
import { useUI } from "@/store/ui";

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const announce = useUI((s) => s.announce);
  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>
      <div className="pointer-events-none fixed left-1/2 top-16 z-[70] flex w-[min(92vw,440px)] -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className={`surface pointer-events-auto flex w-full items-start gap-2.5 px-3.5 py-2.5 text-[12px] ${t.tone === "error" ? "!border-down/30" : t.tone === "warn" ? "!border-warn/25" : ""}`}
              role={t.tone === "error" ? "alert" : "status"}
            >
              {t.tone === "error" ? <XCircle size={14} className="mt-px shrink-0 text-down" /> : t.tone === "warn" ? <AlertTriangle size={14} className="mt-px shrink-0 text-warn" /> : <Info size={14} className="mt-px shrink-0 text-accent" />}
              <span className="flex-1 leading-snug text-ink-2">{t.text}</span>
              <button className="text-ink-3 hover:text-ink" onClick={() => useUI.getState().dismissToast(t.id)} aria-label="Dismiss">
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
