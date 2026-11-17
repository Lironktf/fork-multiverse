"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, Reorder, motion, useDragControls, useSpring } from "motion/react";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, Bookmark, BookmarkCheck, ChevronDown, GitFork, GripVertical, Info, Lock, Redo2, Trash2, Undo2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, detectConflicts, conflictKey, BASKET_LIMIT, type BasketItem } from "@/store/universe";
import { useUI } from "@/store/ui";
import { dom } from "@/lib/client/runtime";
import { forkReality } from "@/lib/client/actions";
import { cumulativeAssumptions } from "@/lib/domain/verse";
import { fmtPct, observedProbability } from "@/lib/domain/market";
import type { ForkEvent } from "@/lib/domain/types";
import { SourceTag } from "@/components/ui/tags";
import { fmtDate } from "@/components/discovery/EventRow";

function OutcomeControl({ item, event, locked }: { item: BasketItem; event: ForkEvent; locked: boolean }) {
  const setOutcome = useUniverse((s) => s.setOutcome);
  if (event.eventType === "binary" && event.possibleOutcomes.length === 2) {
    return (
      <div className="seg" role="radiogroup" aria-label={`Assumed outcome for ${event.title}`}>
        {event.possibleOutcomes.map((o) => (
          <button key={o} role="radio" aria-checked={item.outcome === o} disabled={locked} onClick={() => setOutcome(item.uid, o)} className="relative" data-testid={`outcome-${o}`}>
            {item.outcome === o && (
              <motion.span
                layoutId={`oc-${item.uid}`}
                className={`absolute inset-0 rounded-[4px] ${o === "NO" ? "bg-white/[0.09]" : "bg-accent/[0.16] ring-1 ring-accent/40"}`}
                transition={{ type: "spring", stiffness: 520, damping: 36 }}
              />
            )}
            <span className={`relative ${item.outcome === o && o !== "NO" ? "text-accent" : ""}`}>{o}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button disabled={locked} className="flex h-[26px] max-w-[170px] items-center gap-1.5 rounded-[6px] border border-accent/35 bg-accent/[0.08] px-2 text-[11px] text-accent" aria-label={`Assumed outcome: ${item.outcome}. Change`}>
          <span className="truncate">{item.outcome}</span>
          <ChevronDown size={11} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="left" align="start" sideOffset={10} className="surface z-50 max-h-[320px] w-[260px] overflow-y-auto p-1.5">
          <div className="meta px-2 pb-1.5 pt-1">Assume this outcome</div>
          {event.possibleOutcomes.map((o) => {
            const p = observedProbability(event, o);
            return (
              <Popover.Close asChild key={o}>
                <button onClick={() => setOutcome(item.uid, o)} className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] hover:bg-white/[0.05] ${o === item.outcome ? "text-accent" : "text-ink-2"}`}>
                  <span className="truncate pr-2">{o}</span>
                  <span className="num text-[10.5px] text-market/80">{p ? fmtPct(p.value) : ""}</span>
                </button>
              </Popover.Close>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SourceDetails({ event }: { event: ForkEvent }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="ibtn !h-6 !min-w-6 !p-0" aria-label={`Source details for ${event.title}`}>
          <Info size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="left" align="start" sideOffset={10} className="surface z-50 w-[320px] p-3.5 text-[11.5px]">
          <div className="flex items-center gap-2">
            <SourceTag source={event.source} />
            {event.externalMarketId && <span className="num text-[10.5px] text-ink-3">{event.externalMarketId}</span>}
          </div>
          <div className="mt-2 text-[12.5px] font-medium text-ink">{event.title}</div>
          {event.description && <p className="mt-1.5 text-ink-2">{event.description}</p>}
          <div className="meta mt-3">Resolution</div>
          <p className="mt-1 max-h-[120px] overflow-y-auto text-ink-2">{event.resolutionCriteria || "No formal resolution criteria."}</p>
          {event.resolutionDate && (
            <div className="mt-2 text-ink-3">
              Resolves by <span className="num text-ink-2">{fmtDate(event.resolutionDate)}</span>
            </div>
          )}
          {event.source === "gemini" && event.metadata.url && (
            <a href={event.metadata.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-accent hover:underline">
              View on Gemini ↗
            </a>
          )}
          {event.source === "demo" && <p className="mt-2 text-[10.5px] text-ink-3">Hypothetical demonstration event — illustrative only.</p>}
          {event.source === "model" && <p className="mt-2 text-[10.5px] text-ink-3">Premise proposed by an AI analyst ({event.metadata.proposedBy}). Not an observed or listed event.</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function BasketRow({ item, event, locked, conflicted }: { item: BasketItem; event: ForkEvent; locked: boolean; conflicted: boolean }) {
  const controls = useDragControls();
  const remove = useUniverse((s) => s.removeFromBasket);
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={`relative rounded-[9px] border bg-[#0a0a0c] ${conflicted ? "border-warn/40" : locked ? "border-accent/35" : "border-line"}`}
      style={locked ? { boxShadow: "0 0 24px -8px rgba(124,214,255,0.55)" } : undefined}
      data-testid="basket-item"
    >
      <div className="flex items-start gap-1.5 px-1.5 py-2">
        <button
          onPointerDown={(e) => !locked && controls.start(e)}
          className="mt-0.5 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-ink-3 hover:text-ink-2 active:cursor-grabbing"
          aria-label={`Reorder ${event.title}`}
          disabled={locked}
        >
          {locked ? <Lock size={11} className="text-accent" /> : <GripVertical size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] leading-snug text-ink">{event.title}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <OutcomeControl item={item} event={event} locked={locked} />
            <SourceTag source={event.source} small />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <button className="ibtn !h-6 !min-w-6 !p-0" onClick={() => remove(item.uid)} disabled={locked} aria-label={`Remove ${event.title}`} data-testid="basket-remove">
            <X size={12} />
          </button>
          <SourceDetails event={event} />
        </div>
      </div>
    </Reorder.Item>
  );
}

export function Basket({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { basket, events, verses, currentVerseId, canUndo, canRedo, savedDraft, acknowledged } = useUniverse(
    useShallow((s) => ({
      basket: s.basket,
      events: s.events,
      verses: s.verses,
      currentVerseId: s.currentVerseId,
      canUndo: s.basketPast.length > 0,
      canRedo: s.basketFuture.length > 0,
      savedDraft: s.savedDraft,
      acknowledged: s.acknowledgedConflicts,
    })),
  );
  const { hot, pulse, phase, dragging } = useUI(useShallow((s) => ({ hot: s.basketHot, pulse: s.basketPulse, phase: s.forkPhase, dragging: !!s.drag })));
  const locked = phase !== "idle";
  const [showInherited, setShowInherited] = useState(false);
  const cur = verses[currentVerseId];
  const inherited = cumulativeAssumptions(cur);
  const conflicts = useMemo(() => detectConflicts({ basket, verses, currentVerseId, events }), [basket, verses, currentVerseId, events]);
  const unacked = conflicts.filter((c) => !acknowledged.includes(conflictKey(c)));
  const conflictedIds = new Set(conflicts.flatMap((c) => c.eventIds));

  useEffect(() => {
    dom.basket = ref.current;
    return () => {
      if (dom.basket === ref.current) dom.basket = null;
    };
  }, []);

  // magnetic response: scale + glow follow drag proximity; a landed item bumps the tray
  const scale = useSpring(1, { stiffness: 380, damping: 26 });
  useEffect(() => {
    scale.set(1 + hot * 0.025);
  }, [hot, scale]);
  useEffect(() => {
    if (!pulse) return;
    scale.set(1.035);
    const t = setTimeout(() => scale.set(1), 140);
    return () => clearTimeout(t);
  }, [pulse, scale]);

  const s = useUniverse.getState;
  const fork = () => {
    if (unacked.length) return;
    forkReality();
  };

  return (
    <motion.section
      ref={ref}
      aria-label="Event basket"
      data-testid="basket"
      style={{
        scale,
        borderColor: hot > 0.05 || locked ? `rgba(124,214,255,${0.15 + hot * 0.45})` : undefined,
        boxShadow: hot > 0.05 ? `0 0 ${30 + hot * 50}px -12px rgba(124,214,255,${0.25 + hot * 0.35}), 0 24px 60px -20px rgba(0,0,0,.8)` : undefined,
      }}
      className={`surface pointer-events-auto relative flex w-full flex-col overflow-hidden ${compact ? "max-h-[46vh]" : "max-h-[min(58vh,560px)]"}`}
    >
      {/* magnetic field line along the top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(124,214,255,${0.2 + hot * 0.8}), transparent)` }} />

      <header className="flex items-center gap-2 px-3.5 pb-2 pt-3">
        <h2 className="text-[12px] font-medium tracking-wide text-ink">Assumptions</h2>
        <span className="num text-[10.5px] text-ink-3">
          {basket.length}/{BASKET_LIMIT}
        </span>
        <div className="ml-auto flex items-center">
          <button className="ibtn !h-6 !min-w-6 !px-1" disabled={!canUndo || locked} onClick={() => s().undoBasket()} aria-label="Undo basket change" title="Undo (⌘Z)">
            <Undo2 size={12} />
          </button>
          <button className="ibtn !h-6 !min-w-6 !px-1" disabled={!canRedo || locked} onClick={() => s().redoBasket()} aria-label="Redo basket change" title="Redo (⇧⌘Z)">
            <Redo2 size={12} />
          </button>
          <button
            className="ibtn !h-6 !min-w-6 !px-1"
            disabled={locked || (!basket.length && !savedDraft)}
            onClick={() => {
              if (basket.length) {
                s().saveDraft();
                useUI.getState().toast("Basket saved as a draft.");
              } else {
                s().restoreDraft();
                useUI.getState().toast("Draft restored.");
              }
            }}
            aria-label={basket.length ? "Save basket as draft" : "Restore saved draft"}
            title={basket.length ? "Save draft" : "Restore draft"}
          >
            {savedDraft && !basket.length ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
          </button>
          <button className="ibtn !h-6 !min-w-6 !px-1" disabled={!basket.length || locked} onClick={() => s().clearBasket()} aria-label="Clear basket" title="Clear">
            <Trash2 size={12} />
          </button>
        </div>
      </header>

      {inherited.length > 0 && (
        <div className="px-3.5 pb-2">
          <button onClick={() => setShowInherited((v) => !v)} className="flex w-full items-center gap-1.5 text-[11px] text-ink-3 hover:text-ink-2" aria-expanded={showInherited}>
            <ChevronDown size={11} className={`transition-transform ${showInherited ? "" : "-rotate-90"}`} aria-hidden />
            Inherits {inherited.length} assumption{inherited.length > 1 ? "s" : ""} from {cur.name}
          </button>
          <AnimatePresence initial={false}>
            {showInherited && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {inherited.map((a) => (
                  <li key={a.eventId} className="flex items-center gap-2 py-1 pl-4 text-[11px] text-ink-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-ink-2" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{events[a.eventId]?.title ?? a.eventId}</span>
                    <span className="num text-[10px] text-ink-2">{a.selectedOutcome}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-1">
        {basket.length === 0 ? (
          <div
            className={`mx-1 mb-2 flex flex-col items-center justify-center rounded-[9px] border border-dashed px-4 py-6 text-center transition-colors duration-300 ${
              dragging || hot > 0.05 ? "border-accent/50 bg-accent/[0.035]" : "border-line-2"
            }`}
          >
            <div className="text-[12px] text-ink-2">{dragging ? "Release to assume it" : "Drag events here"}</div>
            <div className="mt-1 text-[11px] text-ink-3">or press + on any event. Each one becomes an assumption of the next world.</div>
          </div>
        ) : (
          <Reorder.Group axis="y" values={basket} onReorder={(items) => s().reorderBasket(items)} className="flex flex-col gap-1.5 pb-1.5">
            <AnimatePresence initial={false}>
              {basket.map((item) =>
                events[item.eventId] ? <BasketRow key={item.uid} item={item} event={events[item.eventId]} locked={locked} conflicted={conflictedIds.has(item.eventId)} /> : null,
              )}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>

      <AnimatePresence>
        {unacked.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden px-3.5" role="alert">
            <div className="mb-2 rounded-md border border-warn/30 bg-warn/[0.05] p-2.5 text-[11px] text-warn/90">
              <div className="flex items-start gap-2">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                <div className="flex-1">
                  {unacked.map((c) => (
                    <p key={conflictKey(c)}>{c.message}</p>
                  ))}
                  <button className="mt-1.5 text-[11px] text-ink underline-offset-2 hover:underline" onClick={() => s().acknowledgeConflicts(unacked.map(conflictKey))}>
                    Assume both anyway
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-line p-2.5">
        <ForkButton disabled={!basket.length || locked || unacked.length > 0} locked={locked} onClick={fork} />
      </div>
    </motion.section>
  );
}

function ForkButton({ disabled, locked, onClick }: { disabled: boolean; locked: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.01 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      data-testid="fork-reality"
      className="group relative flex h-11 w-full items-center justify-center gap-2.5 overflow-hidden rounded-[8px] border text-[12px] font-semibold tracking-[0.28em] transition-[border-color,color,opacity] duration-300 disabled:cursor-not-allowed"
      style={{
        borderColor: disabled && !locked ? "rgba(255,255,255,0.08)" : "rgba(124,214,255,0.55)",
        color: disabled && !locked ? "var(--text-3)" : "var(--text)",
        background: disabled && !locked ? "transparent" : "linear-gradient(180deg, rgba(124,214,255,0.12), rgba(124,214,255,0.03))",
      }}
    >
      {!disabled && <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]" />}
      <GitFork size={14} className={locked ? "animate-pulse text-accent" : "text-accent"} aria-hidden />
      {locked ? "FORKING" : "FORK REALITY"}
    </motion.button>
  );
}
