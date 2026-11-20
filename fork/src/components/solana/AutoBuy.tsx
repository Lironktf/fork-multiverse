"use client";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Zap } from "lucide-react";
import { api } from "@/lib/contracts/client";
import type { MarketDescriptor } from "@/lib/contracts/generated/app-types";
import { explorerTx } from "./SolanaProvider";
import { short } from "./WalletButton";

type Op = ">=" | "<=";
interface Observation {
  value: number;
  source: string;
  at: string;
}
interface Rule {
  id: string;
  market: string;
  trigger:
    | { kind: "spot"; symbol: string; op: Op; value: number }
    | { kind: "contract"; ticker: string; instrument: string; op: Op; value: number };
  action: { side: "yes" | "no"; shares: number; maxCost: number };
  status: "armed" | "fired" | "failed" | "cancelled" | "expired";
  createdAt: string;
  executor: string;
  last?: Observation;
  firedAt?: string;
  fired?: Observation;
  signature?: string;
  error?: string;
}

const field =
  "w-full min-w-0 rounded-md border border-line bg-black/20 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent/50";
const button = "btn !h-7 !text-[11px]";
// Gemini spot symbols for the assets FORK's crypto markets reference.
const SPOT = ["solusd", "btcusd", "ethusd"];

const fmtObs = (r: Rule, o?: Observation) =>
  !o ? "—" : r.trigger.kind === "spot" ? `$${o.value.toLocaleString()}` : `${(o.value * 100).toFixed(1)}%`;
const label = (r: Rule) => {
  const op = r.trigger.op === ">=" ? "≥" : "≤";
  return r.trigger.kind === "spot"
    ? `${r.trigger.symbol.toUpperCase()} ${op} $${r.trigger.value.toLocaleString()}`
    : `${r.trigger.instrument} ${op} ${(r.trigger.value * 100).toFixed(0)}%`;
};
const tone: Record<Rule["status"], string> = {
  armed: "text-accent",
  fired: "text-up",
  failed: "text-down",
  cancelled: "text-ink-3",
  expired: "text-ink-3",
};

/**
 * Trigger orders on a FORK conditional market: "when this Gemini observation crosses a
 * threshold, buy YES/NO of B once". Executed by the service's auto-trader account with
 * mock funds; the user's wallet never signs unattended.
 */
export function AutoBuy({ market }: { market: MarketDescriptor }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [executor, setExecutor] = useState("");
  const [kind, setKind] = useState<"contract" | "spot">("contract");
  const [which, setWhich] = useState<0 | 1>(0);
  const [symbol, setSymbol] = useState("solusd");
  const [op, setOp] = useState<Op>(">=");
  const [value, setValue] = useState("");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [shares, setShares] = useState("10");
  const [maxCost, setMaxCost] = useState("8");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ executor: string; rules: Rule[] }>("rules");
      setExecutor(d.executor);
      setRules(d.rules.filter((r) => r.market === market.address));
    } catch {
      /* keep the last list; the trading card reports service errors */
    }
  }, [market.address]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  const arm = async () => {
    setBusy(true);
    setError("");
    try {
      const v = Number(value);
      const b = market.bindings[which];
      const trigger =
        kind === "spot"
          ? { kind, symbol, op, value: v }
          : { kind, ticker: b.ticker, instrument: b.instrument, op, value: v / 100 };
      await api("rules", {
        op: "create",
        market: market.address,
        trigger,
        action: { side, shares: Number(shares), maxCost: Number(maxCost) },
      });
      setValue("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    setError("");
    try {
      await api("rules", { op: "cancel", id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="autobuy">
      <div className="flex items-center gap-1.5 text-ink-2">
        <Zap size={12} className="text-accent" /> Auto-buy when…
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-ink-3">
        When a Gemini price crosses your line, FORK buys B once, with the price capped on-chain at your max cost. It
        runs from FORK’s auto-trader account{executor ? ` (${short(executor)})` : ""} with mock funds, because your
        wallet can’t sign while you’re away.
      </p>

      <fieldset disabled={busy} className="mt-2 grid grid-cols-2 gap-1.5">
        <select className={field} aria-label="Trigger source" value={kind} onChange={(e) => setKind(e.target.value as "contract" | "spot")}>
          <option value="contract">Gemini contract odds</option>
          <option value="spot">Gemini spot price</option>
        </select>
        {kind === "contract" ? (
          <select className={field} aria-label="Trigger contract" value={which} onChange={(e) => setWhich(Number(e.target.value) as 0 | 1)}>
            <option value={0}>A: {market.bindings[0].instrument}</option>
            <option value={1}>B: {market.bindings[1].instrument}</option>
          </select>
        ) : (
          <select className={field} aria-label="Spot symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SPOT.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>
        )}
        <select className={field} aria-label="Comparator" value={op} onChange={(e) => setOp(e.target.value as Op)}>
          <option value=">=">rises to ≥</option>
          <option value="<=">falls to ≤</option>
        </select>
        <input
          className={field}
          aria-label="Threshold"
          inputMode="decimal"
          placeholder={kind === "spot" ? "price in $" : "odds in %"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <select className={field} aria-label="Side to buy" value={side} onChange={(e) => setSide(e.target.value as "yes" | "no")}>
          <option value="yes">then buy B YES</option>
          <option value="no">then buy B NO</option>
        </select>
        <input className={field} aria-label="Shares" inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="shares" />
        <input className={field} aria-label="Max cost" inputMode="decimal" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} placeholder="max cost" />
        <button className={button} onClick={() => void arm()} disabled={busy || !value}>
          {busy ? "Arming…" : "Arm auto-buy"}
        </button>
      </fieldset>
      <p className="mt-1 text-[9.5px] text-ink-3">Shares · max total cost in mock USDC (a share pays 1 if B wins).</p>
      {error && (
        <p className="mt-2 text-down" role="alert">
          {error}
        </p>
      )}

      {rules.length > 0 && (
        <ul className="mt-2 space-y-1.5" data-testid="autobuy-rules">
          {rules.map((r) => (
            <li key={r.id} className="rounded border border-line px-2 py-1.5 text-[10.5px]" data-testid="autobuy-rule" data-status={r.status}>
              <div className="flex items-center justify-between gap-2">
                <span className="num min-w-0 truncate text-ink-2" title={label(r)}>
                  {label(r)} → buy {r.action.shares} {r.action.side.toUpperCase()}
                </span>
                <span className={`num shrink-0 uppercase ${tone[r.status]}`}>{r.status}</span>
              </div>
              <div className="num mt-0.5 text-[9.5px] text-ink-3">
                {r.status === "armed" && <>now {fmtObs(r, r.last)} · max {r.action.maxCost} USDC · </>}
                {r.fired && (
                  <>
                    triggered at {fmtObs(r, r.fired)} ({r.fired.source}) {new Date(r.firedAt!).toLocaleTimeString()} ·{" "}
                  </>
                )}
                {r.signature && (
                  <a className="inline-flex items-center gap-0.5 text-accent" href={explorerTx(r.signature)} target="_blank" rel="noreferrer">
                    tx <ExternalLink size={9} />
                  </a>
                )}
                {r.status === "armed" && (
                  <button className="text-ink-2 underline" onClick={() => void cancel(r.id)}>
                    cancel
                  </button>
                )}
              </div>
              {r.error && <div className="mt-0.5 text-[9.5px] text-down">{r.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
