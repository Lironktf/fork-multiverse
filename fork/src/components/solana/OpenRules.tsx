"use client";
import * as Popover from "@radix-ui/react-popover";
import { ExternalLink, Zap } from "lucide-react";
import {
  ruleCondition,
  ruleThreshold,
  ruleValue,
  useRuleActions,
  useRules,
  type Rule,
} from "@/lib/client/rules";
import { useUI } from "@/store/ui";
import { explorerTx } from "./SolanaProvider";

const tone: Record<Rule["status"], string> = {
  armed: "text-accent",
  fired: "text-up",
  failed: "text-down",
  cancelled: "text-ink-3",
  expired: "text-ink-3",
};
const word: Record<Rule["status"], string> = {
  armed: "waiting",
  fired: "bought",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
};

/** Top-bar list of every "if A, buy B" rule: open ones first, then history. */
export function OpenRules() {
  const q = useRules();
  const { cancel } = useRuleActions();
  if (!q.data?.enabled) return null;
  const rules = [...q.data.rules].sort(
    (a, b) => Number(b.status === "armed") - Number(a.status === "armed"),
  );
  const open = rules.filter((r) => r.status === "armed").length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="ibtn relative"
          aria-label={`Auto-buys: ${open} open`}
          title="If-then buys"
          data-testid="open-rules"
        >
          <Zap size={14} />
          {open > 0 && (
            <span className="num absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[8.5px] font-medium text-black">
              {open}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="surface z-50 w-[340px] p-3.5 text-[11.5px]"
          data-testid="open-rules-panel"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-ink">If-then buys</span>
            <span className="text-[10px] text-ink-3">{open} waiting</span>
          </div>
          {rules.length === 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              None yet. Open a world with a live Gemini target and assumption,
              then use “If this happens, buy”.
            </p>
          ) : (
            <ul className="mt-2 max-h-[60vh] space-y-2 overflow-y-auto">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-line p-2"
                  data-testid="open-rule"
                  data-status={r.status}
                >
                  <div className="text-[11px] leading-snug text-ink-2">
                    <span className="text-ink-3">If </span>
                    {ruleCondition(r)} <span className="text-ink-3">hits</span>{" "}
                    {ruleThreshold(r)}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-ink-2">
                    <span className="text-ink-3">buy </span>
                    {r.action.shares} shares{" "}
                    {r.labels
                      ? r.action.side === "yes"
                        ? "of"
                        : "against"
                      : r.action.side.toUpperCase()}{" "}
                    {r.labels?.target ?? ""}{" "}
                    <span className="text-ink-3">
                      · max {r.action.maxCost} USDC
                    </span>
                  </div>
                  <div className="num mt-1 flex items-center justify-between gap-2 text-[10px]">
                    <span className={`uppercase ${tone[r.status]}`}>
                      {word[r.status]}
                    </span>
                    <span className="min-w-0 truncate text-ink-3">
                      {r.status === "armed" && <>now {ruleValue(r, r.last)}</>}
                      {r.fired && (
                        <>
                          at {ruleValue(r, r.fired)} ·{" "}
                          {new Date(r.firedAt!).toLocaleString()}
                        </>
                      )}
                      {r.status === "failed" && r.error}
                    </span>
                    {r.status === "armed" && (
                      <button
                        className="shrink-0 text-ink-2 underline"
                        onClick={() =>
                          cancel(r.id).catch((e) =>
                            useUI
                              .getState()
                              .toast(String(e.message ?? e), "error"),
                          )
                        }
                      >
                        cancel
                      </button>
                    )}
                    {r.signature && (
                      <a
                        className="inline-flex shrink-0 items-center gap-0.5 text-accent"
                        href={explorerTx(r.signature)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        tx <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[9.5px] leading-relaxed text-ink-3">
            Mock USDC on Solana. Bought by FORK’s auto-trader, not your wallet.
            If the “if” doesn’t happen, the bet is cancelled and refunded.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
