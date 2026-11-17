"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EventCategory, ForkEvent } from "@/lib/domain/types";
import { useUniverse } from "@/store/universe";

export function useDebounced<T>(v: T, ms = 220) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export interface LiveResult {
  ok: boolean;
  events: ForkEvent[];
  fetchedAt?: string;
  error?: string;
  cached?: boolean;
}

/** Live Gemini events (server-cached, abortable, deduplicated by TanStack Query). */
export function useLiveEvents(q: string, enabled = true) {
  const dq = useDebounced(q.trim(), 260);
  return useQuery<LiveResult>({
    queryKey: ["gemini-events", dq],
    enabled,
    staleTime: 40_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/events?${new URLSearchParams(dq ? { q: dq } : {})}`, { signal });
      return res.json();
    },
  });
}

const norm = (s: string) => s.toLowerCase();

export function matches(e: ForkEvent, q: string) {
  if (!q) return true;
  const hay = norm(`${e.title} ${e.description} ${e.category} ${(e.metadata.tags ?? []).join(" ")} ${e.externalMarketId ?? ""}`);
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export type SourceFilter = "all" | "live" | "library" | "custom";

/** Local library: demo fixtures + user custom + model-proposed events (never mixed with live results). */
export function useLibraryEvents(q: string, category: EventCategory | "all") {
  const events = useUniverse((s) => s.events);
  return useMemo(
    () =>
      Object.values(events)
        .filter((e) => e.source !== "gemini")
        .filter((e) => category === "all" || e.category === category)
        .filter((e) => matches(e, q))
        .sort((a, b) => (a.source === b.source ? a.title.localeCompare(b.title) : a.source === "custom" ? -1 : 1)),
    [events, q, category],
  );
}

export const CATEGORY_LABEL: Record<EventCategory | "all", string> = {
  all: "All",
  crypto: "Crypto",
  macro: "Macro",
  politics: "Politics",
  tech: "Tech",
  ai: "AI",
  geopolitics: "Geopolitics",
  energy: "Energy",
  markets: "Markets",
  business: "Business",
  culture: "Culture",
  other: "Other",
};
