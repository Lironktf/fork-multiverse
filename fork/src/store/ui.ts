"use client";
import { create } from "zustand";
import type { NextForkSuggestion } from "@/lib/domain/types";

export type Panel = null | "saved" | "compare" | "settings" | "markets";

/**
 * Fork transition state machine.
 *   idle → commit → converge → rupture → travel → arrive → reveal → idle
 * Only `idle` accepts a new fork; every other phase ignores further triggers,
 * so rapid clicks cannot start overlapping transitions.
 */
export type ForkPhase = "idle" | "commit" | "converge" | "rupture" | "travel" | "arrive" | "reveal";

export interface DragState {
  eventId: string;
  outcome?: string;
  title: string;
  origin: { x: number; y: number }; // where the drag started (screen)
  from: "discovery" | "graph" | "suggestion";
}

interface UIState {
  hoveredNode: string | null;
  selectedNode: string | null;
  panel: Panel;
  workspaceTab: "forecast" | "trade";
  palette: boolean;
  discoveryOpen: boolean;
  inspectRole: string | null;
  disagreementOpen: boolean;
  namingVerseId: string | null;
  forkPhase: ForkPhase;
  forkFromVerse: string | null;
  forkToVerse: string | null;
  drag: DragState | null;
  basketHot: number; // 0..1 proximity of a drag to the basket
  basketPulse: number; // increments when an item lands
  reducedMotion: "system" | "reduce" | "full";
  toasts: { id: number; tone: "info" | "warn" | "error"; text: string }[];
  announce: string;
  /** "verseId::targetKey" -> next-fork analysis */
  nextForks: Record<string, { status: "loading" | "done" | "error"; engine?: "claude-cli" | "codex-cli" | "grok-cli" | "multi-cli" | "demo"; suggestions: NextForkSuggestion[]; error?: string }>;

  set: (p: Partial<UIState>) => void;
  toast: (text: string, tone?: "info" | "warn" | "error") => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useUI = create<UIState>()((set) => ({
  hoveredNode: null,
  selectedNode: null,
  panel: null,
  workspaceTab: "forecast",
  palette: false,
  discoveryOpen: true,
  inspectRole: null,
  disagreementOpen: false,
  namingVerseId: null,
  forkPhase: "idle",
  forkFromVerse: null,
  forkToVerse: null,
  drag: null,
  basketHot: 0,
  basketPulse: 0,
  reducedMotion: "system",
  toasts: [],
  announce: "",
  nextForks: {},
  set: (p) => set(p),
  toast: (text, tone = "info") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, text }], announce: text }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "error" ? 7000 : 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function prefersReducedMotion(): boolean {
  const pref = useUI.getState().reducedMotion;
  if (pref === "reduce") return true;
  if (pref === "full") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
