"use client";
import { useMemo, useState } from "react";
import { ExternalLink, Loader2, Zap } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse } from "@/store/universe";
import { cumulativeAssumptions } from "@/lib/domain/verse";
import type { ForkEvent } from "@/lib/domain/types";
import { ruleValue, useRuleActions, useRules } from "@/lib/client/rules";
import { explorerTx } from "./SolanaProvider";
import { short } from "./WalletButton";

const field =
  "min-w-0 rounded-md border border-line bg-black/20 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent/50";

const live = (e?: ForkEvent) =>
  !!e && e.source === "gemini" && !!e.externalMarketId;
export const outcomeLabel = (e: ForkEvent, outcome: string) =>
  `${e.title} → ${outcome}`;

/**
 * "If A happens, buy B" for the current world.
 *   B = this world's target outcome (a live Gemini market).
 *   A = one of this world's assumptions (a live Gemini outcome that is a YES side).
 * Arming asks the Solana service to set up the "B given A = YES" market if it doesn't
 * exist yet, reserve the max cost, and watch A's Gemini odds. When they reach the
 * threshold it buys once. If A ends up NOT happening, the market voids and the
 * money comes back.
 */
export function IfThenBuy() {
  const { verse, target, events } = useUniverse(
    useShallow((s) => ({
      verse: s.verses[s.currentVerseId],
      target: s.target,
      events: s.events,
    })),
  );
  const rulesQ = useRules();
  const actions = useRuleActions();
  const tEvent = events[target.eventId];
  const conditions = useMemo(
    () =>
      cumulativeAssumptions(verse)
        .map((a) => ({ a, e: events[a.eventId] }))
        .filter(({ e, a }) => live(e) && a.eventId !== target.eventId)
        .map(({ a, e }) => ({
          key: `${a.eventId}::${a.selectedOutcome}`,
          ticker: e!.externalMarketId!,
          outcome: a.selectedOutcome,
          label: outcomeLabel(e!, a.selectedOutcome),
          // these markets are "B given A = YES": a binary NO assumption can't be the condition
          ok: !(e!.eventType === "binary" && a.selectedOutcome === "NO"),
        })),
    [verse, events, target.eventId],
  );
  const usable = conditions.filter((c) => c.ok);
  const [cond, setCond] = useState("");
  const [threshold, setThreshold] = useState("90");
  const [shares, setShares] = useState("10");
  const [maxCost, setMaxCost] = useState("8");
  const [against, setAgainst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const enabled = rulesQ.data?.enabled;
  if (enabled === false) return null; // this deployment runs no Solana service
  const chosen = usable.find((c) => c.key === cond) ?? usable[0];
  const targetLabel = tEvent ? outcomeLabel(tEvent, target.outcome) : "";
  // rules armed from this world for this target; every rule is listed in the top bar
  const mine = (rulesQ.data?.rules ?? []).filter(
    (r) => r.labels?.world === verse.id && r.labels.target === targetLabel,
  );

  const arm = async () => {
    if (!chosen || !tEvent) return;
    setBusy(true);
    setError("");
    try {
      await actions.quick({
        condition: { ticker: chosen.ticker, outcome: chosen.outcome },
        target: { ticker: tEvent.externalMarketId, outcome: target.outcome },
        threshold: Number(threshold) / 100,
        against,
        shares: Number(shares),
        maxCost: Number(maxCost),
        labels: {
          condition: chosen.label,
          target: targetLabel,
          world: verse.id,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="if-then-buy">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
          <Zap size={12} className="text-accent" aria-hidden /> If this happens,
          buy
        </span>
        <span className="tag tag-custom">solana · mock USDC</span>
      </div>

      {!live(tEvent) ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
          Pick a live Gemini market as the target to set up an automatic buy.
        </p>
      ) : !usable.length ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
          Add a live Gemini event as an assumption (a YES outcome) and fork.
          Then you can say “if that happens, buy{" "}
          <span className="text-ink-2">{target.outcome}</span> here”.
          {conditions.length > 0 &&
            " Assumptions set to NO can’t be used as the trigger."}
        </p>
      ) : (
        <>
          <div className="mt-2 space-y-1.5 text-[11px] text-ink-2">
            <label className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-ink-3">If</span>
              <select
                className={`${field} w-full`}
                aria-label="Condition"
                value={chosen?.key}
                onChange={(e) => setCond(e.target.value)}
              >
                {usable.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-ink-3">hits</span>
              <input
                className={`${field} w-16`}
                aria-label="Odds threshold"
                inputMode="numeric"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
              <span className="text-ink-3">% odds on Gemini,</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-ink-3">buy</span>
              <input
                className={`${field} w-14`}
                aria-label="Shares"
                inputMode="numeric"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
              <select
                className={`${field} min-w-0 flex-1`}
                aria-label="Direction"
                value={against ? "against" : "for"}
                onChange={(e) => setAgainst(e.target.value === "against")}
              >
                <option value="for">shares of “{target.outcome}”</option>
                <option value="against">
                  shares against “{target.outcome}”
                </option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-ink-3">max</span>
              <input
                className={`${field} w-16`}
                aria-label="Max cost"
                inputMode="decimal"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
              />
              <span className="text-ink-3">USDC total</span>
            </label>
          </div>
          <button
            className="btn mt-2.5 !h-7 w-full !text-[11px]"
            onClick={() => void arm()}
            disabled={busy || !threshold}
            data-testid="arm-if-then"
          >
            {busy ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Zap size={11} />
            )}
            {busy ? "Setting up on Solana…" : "Arm"}
          </button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-3">
            Each share pays 1 USDC if “{target.outcome}” wins. If the “if” never
            happens, the bet is cancelled and the money comes back. Runs from
            FORK’s auto-trader
            {rulesQ.data?.executor ? ` (${short(rulesQ.data.executor)})` : ""},
            not your wallet.
          </p>
          {error && (
            <p className="mt-1.5 text-[10.5px] text-down" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      {mine.length > 0 && (
        <ul className="mt-2 space-y-1">
          {mine.map((r) => (
            <li
              key={r.id}
              className="num flex items-center justify-between gap-2 text-[10px]"
              data-testid="if-then-rule"
              data-status={r.status}
            >
              <span
                className="min-w-0 truncate text-ink-3"
                title={r.labels?.condition}
              >
                {r.status === "armed"
                  ? `waiting · now ${ruleValue(r, r.last)}`
                  : r.status === "fired"
                    ? `bought at ${ruleValue(r, r.fired)}`
                    : (r.error ?? r.status)}
              </span>
              {r.signature ? (
                <a
                  className="inline-flex shrink-0 items-center gap-0.5 text-up"
                  href={explorerTx(r.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  bought <ExternalLink size={9} />
                </a>
              ) : (
                <span
                  className={`shrink-0 uppercase ${r.status === "armed" ? "text-accent" : "text-ink-3"}`}
                >
                  {r.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
