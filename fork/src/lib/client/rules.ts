"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ServiceNotConfigured } from "@/lib/contracts/client";

export interface Observation {
  value: number;
  source: string;
  at: string;
}
export interface Rule {
  id: string;
  market: string;
  trigger:
    | { kind: "spot"; symbol: string; op: ">=" | "<="; value: number }
    | { kind: "contract"; ticker: string; instrument: string; op: ">=" | "<="; value: number };
  action: { side: "yes" | "no"; shares: number; maxCost: number };
  status: "armed" | "fired" | "failed" | "cancelled" | "expired";
  createdAt: string;
  executor: string;
  labels?: { condition: string; target: string };
  last?: Observation;
  firedAt?: string;
  fired?: Observation;
  signature?: string;
  error?: string;
}
export interface RulesState {
  enabled: boolean;
  executor: string;
  rules: Rule[];
}

/** All auto-buy rules from the Solana service; `enabled: false` when this deployment has none. */
export function useRules() {
  return useQuery<RulesState>({
    queryKey: ["autobuy-rules"],
    refetchInterval: 10_000,
    retry: false,
    queryFn: async () => {
      try {
        const d = await api<{ executor: string; rules: Rule[] }>("rules");
        return { enabled: true, ...d };
      } catch (e) {
        if (e instanceof ServiceNotConfigured) return { enabled: false, executor: "", rules: [] };
        throw e;
      }
    },
  });
}

export function useRuleActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["autobuy-rules"] });
  return {
    async cancel(id: string) {
      await api("rules", { op: "cancel", id });
      await refresh();
    },
    async quick(body: Record<string, unknown>) {
      const r = await api<Rule>("rules", { op: "quick", ...body });
      await refresh();
      return r;
    },
  };
}

export const ruleCondition = (r: Rule) =>
  r.labels?.condition ??
  (r.trigger.kind === "spot" ? `${r.trigger.symbol.toUpperCase()} spot` : r.trigger.instrument);
export const ruleThreshold = (r: Rule) =>
  r.trigger.kind === "spot" ? `$${r.trigger.value.toLocaleString()}` : `${Math.round(r.trigger.value * 100)}%`;
export const ruleValue = (r: Rule, o?: Observation) =>
  !o ? "—" : r.trigger.kind === "spot" ? `$${o.value.toLocaleString()}` : `${(o.value * 100).toFixed(1)}%`;
