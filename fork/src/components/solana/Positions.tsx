"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useUniverse } from "@/store/universe";
import {
  api,
  marketClient,
  validateConfig,
  type ChainState,
  type Quote,
} from "@/lib/contracts/client";
import { executionLimit, formatUnits } from "@/lib/contracts/amounts";
import type {
  AppConfig,
  Instrument,
  MarketDescriptor,
} from "@/lib/contracts/generated/app-types";
import { explorerTx, SOLANA_CLUSTER } from "./SolanaProvider";
import { short } from "./WalletButton";

const field =
  "w-full min-w-0 rounded-md border border-line bg-black/20 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent/50";
const button = "btn !h-7 !text-[11px]";
const errorText = (error: unknown) =>
  /reject|denied|cancel/i.test(String(error))
    ? "Transaction rejected in the wallet. No trade was submitted."
    : error instanceof Error
      ? error.message
      : String(error);
type Selection = Instrument & { close: string; reviewed: boolean };

function InstrumentPicker({
  role,
  initialSearch,
  selected,
  onSelect,
}: {
  role: "A" | "B";
  initialSearch: string;
  selected: Selection | null;
  onSelect: (value: Selection | null) => void;
}) {
  const [query, setQuery] = useState(initialSearch);
  const [items, setItems] = useState<Instrument[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (selected) return;
    let live = true;
    setBusy(true);
    setError("");
    setItems([]);
    const timer = setTimeout(() => {
      api<{ items: Instrument[]; hasNext: boolean }>(
        `catalog?q=${encodeURIComponent(query)}&offset=${offset}`,
      )
        .then((result) => {
          if (live) {
            setItems(result.items);
            setHasNext(result.hasNext);
          }
        })
        .catch((e) => {
          if (live) setError(errorText(e));
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, offset, selected]);
  const choose = async (item: Instrument) => {
    setBusy(true);
    setError("");
    try {
      const detail = await api<Instrument>(
        `instrument?ticker=${encodeURIComponent(item.ticker)}&instrument=${encodeURIComponent(item.instrument)}`,
      );
      onSelect({
        ...item,
        ...detail,
        title: item.title,
        label: item.label,
        close: detail.closeTs
          ? new Date(detail.closeTs * 1000).toISOString()
          : "",
        reviewed: false,
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3" data-testid={`instrument-${role}`}>
      <div className="meta mb-1">
        {role === "A"
          ? "Parent A · condition is YES"
          : "Target B · trade YES or NO"}
      </div>
      {selected ? (
        <>
          <div className="text-[11px] text-ink">
            {selected.title} · {selected.label}
          </div>
          <div className="num mt-1 break-all text-[10px] text-ink-3">
            {selected.ticker} / {selected.instrument}
          </div>
          <button
            className="ibtn mt-1 !h-6 !text-[10px]"
            onClick={() => onSelect(null)}
          >
            Change {role}
          </button>
          <p className="mt-1 text-[10px] text-ink-3">
            Observation / expiry: {selected.expiry}
          </p>
          <a
            href={selected.rulesUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent"
          >
            Read source rules <ExternalLink size={10} />
          </a>
          <details className="mt-1 text-[10px] leading-relaxed text-ink-3">
            <summary className="cursor-pointer">Resolution criteria</summary>
            {selected.description || "Read the linked source rules."}
          </details>
          <label className="mt-2 block text-[10px] text-ink-3">
            Trading close (UTC, from rules)
            <input
              aria-label={`${role} trading close UTC`}
              className={`${field} mt-1`}
              placeholder="2026-11-20T18:00:00Z"
              value={selected.close}
              readOnly={selected.closeTs !== undefined}
              onChange={(e) =>
                onSelect({
                  ...selected,
                  close: e.target.value,
                  reviewed: false,
                })
              }
            />
          </label>
          <label className="mt-2 flex items-start gap-2 text-[10px] text-ink-2">
            <input
              type="checkbox"
              aria-label={`Reviewed ${role} rules`}
              className="mt-0.5"
              checked={selected.reviewed}
              onChange={(e) =>
                onSelect({ ...selected, reviewed: e.target.checked })
              }
            />
            I reviewed the rules and this conservative close. Expiry alone is
            not the trading cutoff.
          </label>
        </>
      ) : (
        <>
          <input
            className={field}
            aria-label={`Search ${role} contracts`}
            placeholder="Search live Gemini · Bitcoin, SOL…"
            value={query}
            onChange={(e) => {
              setOffset(0);
              setQuery(e.target.value);
            }}
          />
          {busy && <p className="mt-2 text-ink-3">Loading live contracts…</p>}
          {!busy && !error && items.length === 0 && (
            <p className="mt-2 text-ink-3">
              No open contracts found. Try another search.
            </p>
          )}
          <div className="mt-1 max-h-40 overflow-y-auto">
            {items.map((item) => (
              <button
                disabled={busy}
                key={`${item.ticker}/${item.instrument}`}
                onClick={() => void choose(item)}
                className="block w-full border-b border-line py-2 text-left hover:text-accent"
                data-instrument={item.instrument}
              >
                <span className="block text-[11px]">
                  {item.title} · {item.label}
                </span>
                <span className="num block break-all text-[9px] text-ink-3">
                  {item.instrument}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            {offset > 0 && (
              <button
                className={button}
                disabled={busy}
                onClick={() => setOffset(offset - 20)}
              >
                Previous
              </button>
            )}
            {hasNext && (
              <button
                className={button}
                disabled={busy}
                onClick={() => setOffset(offset + 20)}
              >
                More contracts
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-down">
          {error}
        </p>
      )}
    </div>
  );
}

function Trading({
  config,
  market,
}: {
  config: AppConfig;
  market: MarketDescriptor;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const client = useMemo(
    () =>
      wallet.publicKey
        ? marketClient(connection, config, market, wallet.publicKey)
        : null,
    [connection, config, market, wallet.publicKey],
  );
  const [state, setState] = useState<ChainState | null>(null);
  const [amount, setAmount] = useState("100");
  const [lpAmount, setLpAmount] = useState("40");
  const [quantity, setQuantity] = useState("10");
  const [yes, setYes] = useState(true);
  const [buy, setBuy] = useState(true);
  const [slippage, setSlippage] = useState(50);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const alive = useRef(true);
  const historyKey = `fork-txs:${config.genesis}:${market.address}:${wallet.publicKey?.toBase58()}`;
  const [signatures, setSignatures] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(historyKey) ?? "[]");
    } catch {
      return [];
    }
  });
  const refresh = useCallback(async () => {
    if (!client) return;
    const result = await client.read();
    if (alive.current) setState(result);
  }, [client]);
  useEffect(() => {
    alive.current = true;
    void refresh().catch((e) => {
      if (alive.current) setError(errorText(e));
    });
    const timer = setInterval(() => {
      void refresh().catch((e) => {
        if (alive.current) setError(errorText(e));
      });
    }, 10_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [refresh]);
  const run = async (action: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("Checking confirmed state…");
    try {
      const signature = await action();
      if (!alive.current) return;
      if (signature) {
        setSignatures((previous) => {
          const next = [signature, ...previous].slice(0, 12);
          localStorage.setItem(historyKey, JSON.stringify(next));
          return next;
        });
        setQuote(null);
        setMessage(`Confirmed ${signature}`);
      } else setMessage("");
      await refresh();
    } catch (e) {
      if (alive.current) {
        setError(errorText(e));
        setQuote(null);
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const signer = wallet.signTransaction;
  const stale =
    !quote ||
    now - quote.at > 30_000 ||
    quote.fingerprint !== state?.fingerprint;
  const locked =
    state && !["void", "settledYes", "settledNo"].includes(state.status);
  const closed =
    state &&
    (now / 1000 >= state.target.closeTs.toNumber() ||
      (!("yes" in state.parent.outcome) &&
        now / 1000 >= state.parent.closeTs.toNumber()));
  const tradable =
    !!state && ["pending", "active"].includes(state.status) && !closed;
  if (!client || !wallet.publicKey || !signer)
    return (
      <p className="mt-3 text-ink-3">
        Connect a Solana wallet using the original wallet button at the top
        right. Select the configured local network in your wallet.
      </p>
    );
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="trading">
      <p className="text-[10px] text-ink-3">
        Wallet {short(wallet.publicKey.toBase58())} · localnet · mock USDC
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-ink">
          {state?.status ?? "Loading chain…"}
          {closed && locked ? " · trading closed" : ""}
        </span>
        <button
          className="ibtn !h-6"
          aria-label="Refresh chain state"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api("refresh", { market: market.address });
            })
          }
        >
          <RefreshCw size={11} />
        </button>
      </div>
      {state && (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px]">
            {[
              [
                "Wallet collateral",
                state.walletCollateral,
                "wallet-collateral",
              ],
              ["Deposited collateral", state.trader?.principal, "principal"],
              ["Conditional cash", state.trader?.cash, "cash"],
              ["YES holdings", state.trader?.yes, "yes"],
              ["NO holdings", state.trader?.no, "no"],
              ["Withdrawable", state.withdrawable, "withdrawable"],
            ].map(([label, value, id]) => (
              <div key={String(id)} className="contents">
                <dt className="text-ink-3">{String(label)}</dt>
                <dd
                  className="num text-right text-ink"
                  data-testid={`balance-${id}`}
                >
                  {formatUnits(value as bigint | undefined)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
            {state.trader?.claimed
              ? "This position has been redeemed."
              : locked
                ? "All trading cash and gains remain conditional and locked. A=NO or supported invalidation refunds original deposits."
                : state.status === "void"
                  ? "VOID: redeem your original deposit; conditional gains do not pay out."
                  : "Final settlement: conditional cash plus winning shares can be redeemed."}
          </p>
          <details
            className="mt-3 text-[10px] text-ink-3"
            data-testid="liquidity"
          >
            <summary className="cursor-pointer">
              Liquidity providers · fee {(state.market.feeBps / 100).toFixed(2)}
              %
            </summary>
            <dl className="mt-2 grid grid-cols-2 gap-1">
              {[
                ["Market funding", state.market.lpDeposits],
                ["Required funding", state.liquidity.required],
                ["Funding shortfall", state.liquidity.shortfall],
                ["LMSR depth (b)", state.market.b],
                ["Your contribution", state.liquidity.contribution],
                ["Your allocated fees", state.liquidity.conditionalFees],
                ["Equity if B=YES", state.liquidity.yesEquity],
                ["Equity if B=NO", state.liquidity.noEquity],
                ["Maximum capital at risk", state.liquidity.maxLoss],
                ["LP withdrawable", state.liquidity.withdrawable],
                ["LP already paid", state.liquidity.paid],
              ].map(([label, value]) => (
                <div className="contents" key={String(label)}>
                  <dt>{String(label)}</dt>
                  <dd
                    className="num text-right"
                    data-testid={`lp-${String(label)}`}
                  >
                    {formatUnits(value as bigint)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2">
              Your share: {(state.liquidity.ownershipBps / 100).toFixed(2)}%.
              Fees are included in LP equity and cancel on VOID. Outcome
              estimates use current holdings. Trading losses can exceed fees;
              profitability is not guaranteed.
            </p>
            <p className="mt-1">
              {state.lp?.claimed
                ? "LP claim paid."
                : state.liquidity.canWithdraw
                  ? "Withdraw your contribution during Funding, or claim final equity after settlement."
                  : "LP capital and fees stay locked until final settlement. No new LP shares after trading starts."}
            </p>
            {!state.market.started && !state.liquidity.terminal && (
              <input
                aria-label="LP amount"
                className={`${field} mt-2`}
                value={lpAmount}
                onChange={(e) => setLpAmount(e.target.value)}
                inputMode="decimal"
              />
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className={button}
                disabled={busy || closed || !state.liquidity.canFund}
                onClick={() =>
                  void run(() =>
                    client.liquidity("fund", lpAmount, signer, setMessage),
                  )
                }
              >
                Fund liquidity
              </button>
              <button
                className={button}
                disabled={busy || !state.liquidity.canWithdraw}
                onClick={() =>
                  void run(() =>
                    client.liquidity("withdraw", lpAmount, signer, setMessage),
                  )
                }
              >
                {state.liquidity.terminal
                  ? "Claim LP equity"
                  : "Withdraw LP funding"}
              </button>
              {!state.market.started && (
                <button
                  className={button}
                  disabled={
                    busy ||
                    closed ||
                    !state.liquidity.canFund ||
                    state.liquidity.shortfall > 0n
                  }
                  onClick={() =>
                    void run(() =>
                      client.liquidity("start", "0", signer, setMessage),
                    )
                  }
                >
                  Start funded market
                </button>
              )}
            </div>
          </details>
          <details className="mt-2 text-[10px] text-ink-3">
            <summary className="cursor-pointer">
              Confirmed chain details
            </summary>
            <div className="num mt-1 break-all">
              Market {market.address}
              <br />
              Confirmed slot {state.slot}
              <br />
              Vault {formatUnits(state.vaultCollateral)} mock USDC
            </div>
            {[
              ["A", state.parent],
              ["B", state.target],
            ].map(([role, value]) => {
              const e = value as ChainState["parent"];
              return (
                <div key={String(role)} className="mt-2">
                  {String(role)}: {Object.keys(e.outcome)[0]}
                  <br />
                  Trading close:{" "}
                  {new Date(e.closeTs.toNumber() * 1000).toISOString()}
                  <br />
                  Observation:{" "}
                  {new Date(e.observationTs.toNumber() * 1000).toISOString()}
                  <br />
                  Source publication:{" "}
                  {e.sourceTs.isZero()
                    ? "not reported"
                    : new Date(e.sourceTs.toNumber() * 1000).toISOString()}
                  <br />
                  On-chain submission:{" "}
                  {e.submittedTs.isZero()
                    ? "not reported"
                    : new Date(e.submittedTs.toNumber() * 1000).toISOString()}
                </div>
              );
            })}
          </details>
        </>
      )}
      <button
        className={`${button} mt-3`}
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await api("faucet", { owner: wallet.publicKey!.toBase58() });
          })
        }
      >
        Get mock collateral + SOL
      </button>
      <div className="mt-2 flex gap-2">
        <input
          aria-label="Deposit amount"
          className={field}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
        />
        <button
          className={button}
          disabled={busy || !tradable}
          onClick={() =>
            void run(() => client.deposit(amount, signer, setMessage))
          }
        >
          Deposit
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <select
          aria-label="Trade direction"
          className={field}
          value={buy ? "buy" : "sell"}
          onChange={(e) => {
            setBuy(e.target.value === "buy");
            setQuote(null);
          }}
        >
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
        <select
          aria-label="Trade outcome"
          className={field}
          value={yes ? "yes" : "no"}
          onChange={(e) => {
            setYes(e.target.value === "yes");
            setQuote(null);
          }}
        >
          <option value="yes">YES</option>
          <option value="no">NO</option>
        </select>
      </div>
      <label className="mt-2 block text-[10px] text-ink-3">
        Shares
        <input
          aria-label="Trade shares"
          className={`${field} mt-1`}
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setQuote(null);
          }}
          inputMode="decimal"
        />
      </label>
      <label className="mt-2 block text-[10px] text-ink-3">
        Slippage limit
        <select
          aria-label="Slippage limit"
          className={`${field} mt-1`}
          value={slippage}
          onChange={(e) => setSlippage(Number(e.target.value))}
        >
          <option value={0}>Exact quote (0%)</option>
          <option value={50}>0.5%</option>
          <option value={100}>1%</option>
        </select>
      </label>
      <button
        className={`${button} mt-2`}
        disabled={busy || !tradable || !state?.trader}
        onClick={() =>
          void run(async () => {
            setQuote(await client.quote(yes, buy, quantity));
          })
        }
      >
        Request on-chain quote
      </button>
      {quote && (
        <div
          className="mt-2 rounded-md border border-line p-2 text-[10.5px]"
          data-testid="chain-quote"
        >
          <div className="num text-ink">
            {quote.buy ? "Cost" : "Conditional proceeds"}:{" "}
            {formatUnits(BigInt(quote.cost))} mock USDC
          </div>
          <div className="mt-1 text-ink-3">
            Includes LP fee: {formatUnits(BigInt(quote.fee))} mock USDC.
            Refunded on VOID.
          </div>
          {quote.probability !== null && (
            <div className="mt-1 text-ink-2">
              Solana LMSR YES: {(quote.probability * 100).toFixed(4)}%
            </div>
          )}
          <div className="mt-1 text-ink-3">
            {quote.buy ? "Maximum cost" : "Minimum proceeds"}:{" "}
            {formatUnits(
              executionLimit(BigInt(quote.cost), quote.buy, slippage),
            )}
            .{" "}
            {stale
              ? "Quote expired or state changed."
              : `Valid for ${Math.max(0, 30 - Math.floor((now - quote.at) / 1000))}s.`}
          </div>
          <button
            className={`${button} mt-2`}
            disabled={busy || stale || !tradable}
            onClick={() =>
              void run(() => client.trade(quote, slippage, signer, setMessage))
            }
          >
            Confirm {quote.buy ? "buy" : "sell"} {quote.yes ? "YES" : "NO"}
          </button>
        </div>
      )}
      <button
        className={`${button} mt-3`}
        disabled={busy || !state || state.withdrawable <= BigInt(0)}
        onClick={() => void run(() => client.redeem(signer, setMessage))}
      >
        Redeem eligible balance
      </button>
      {message && (
        <p className="mt-2 break-all text-[10px] text-ink-3" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 break-words text-[11px] text-down" role="alert">
          {error}
        </p>
      )}
      {signatures.length > 0 && (
        <details className="mt-2 text-[10px]">
          <summary className="cursor-pointer text-ink-2">
            Confirmed transactions ({signatures.length})
          </summary>
          {signatures.map((signature) => (
            <a
              key={signature}
              data-signature={signature}
              className="num mt-1 block break-all text-accent"
              href={explorerTx(signature)}
              target="_blank"
              rel="noreferrer"
            >
              {signature}
            </a>
          ))}
        </details>
      )}
    </div>
  );
}

function PositionsContent() {
  const { publicKey } = useWallet();
  const targetTicker = useUniverse(
    (s) => s.events[s.target.eventId]?.externalMarketId ?? "",
  );
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [markets, setMarkets] = useState<MarketDescriptor[]>([]);
  const [market, setMarket] = useState<MarketDescriptor | null>(null);
  const [parent, setParent] = useState<Selection | null>(null);
  const [target, setTarget] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [communityFunding, setCommunityFunding] = useState(false);
  const connect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const conf = await api<AppConfig>("config");
      validateConfig(conf);
      if (SOLANA_CLUSTER !== "localnet")
        throw new Error(
          "Set NEXT_PUBLIC_SOLANA_CLUSTER=localnet and the local RPC, then restart Fork.",
        );
      const all = await api<MarketDescriptor[]>("markets");
      setConfig(conf);
      setMarkets(all);
      const saved = localStorage.getItem(`fork-market:${conf.genesis}`);
      setMarket(all.find((m) => m.address === saved) ?? null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void connect();
  }, [connect]);
  const selectMarket = (m: MarketDescriptor | null) => {
    setMarket(m);
    if (m && config)
      localStorage.setItem(`fork-market:${config.genesis}`, m.address);
  };
  const prepare = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<MarketDescriptor>("markets", {
        parent,
        target,
        communityFunding,
      });
      selectMarket(result);
      setMarkets(await api<MarketDescriptor[]>("markets"));
      setCreating(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">
        Trade B conditional on exact A=YES with local mock funds. This pair is
        separate from the Verse’s full assumption basket. Gemini supplies
        metadata and outcomes; trades execute on Solana.
      </p>
      {error && (
        <p className="mt-2 text-down" role="alert">
          {error}
        </p>
      )}
      {!config ? (
        <button
          className={`${button} mt-2`}
          disabled={busy}
          onClick={() => void connect()}
        >
          {busy ? "Connecting…" : "Retry local service"}
        </button>
      ) : (
        <>
          {markets.length > 0 && (
            <label className="mt-2 block text-[10px] text-ink-3">
              Existing conditional market
              <select
                className={`${field} mt-1`}
                aria-label="Existing conditional market"
                value={market?.address ?? ""}
                onChange={(e) => {
                  selectMarket(
                    markets.find((m) => m.address === e.target.value) ?? null,
                  );
                  setCreating(false);
                }}
              >
                <option value="">Choose exact pair…</option>
                {markets.map((m) => (
                  <option key={m.address} value={m.address}>
                    {m.bindings[1].instrument} | {m.bindings[0].instrument}=YES
                  </option>
                ))}
              </select>
            </label>
          )}
          {market && !creating && (
            <div className="num mt-2 break-all text-[10px] text-ink-2">
              B: {market.bindings[1].ticker} / {market.bindings[1].instrument}
              <br />
              A=YES: {market.bindings[0].ticker} /{" "}
              {market.bindings[0].instrument}
            </div>
          )}
          {!market || creating ? (
            <fieldset disabled={busy}>
              <InstrumentPicker
                role="A"
                initialSearch=""
                selected={parent}
                onSelect={setParent}
              />
              <InstrumentPicker
                role="B"
                initialSearch={targetTicker}
                selected={target}
                onSelect={setTarget}
              />
              <label className="mt-3 flex items-center gap-2 text-[10px] text-ink-3">
                <input
                  type="checkbox"
                  checked={communityFunding}
                  onChange={(e) => setCommunityFunding(e.target.checked)}
                />
                Let wallets fund this market before trading
              </label>
              <button
                className={`${button} mt-3`}
                disabled={
                  busy ||
                  !parent?.reviewed ||
                  !target?.reviewed ||
                  !parent.close ||
                  !target.close
                }
                onClick={() => void prepare()}
              >
                {busy ? "Preparing on Solana…" : "Create or connect market"}
              </button>
              <p className="mt-2 text-[10px] text-ink-3">
                New markets start at 50% with depth sized for an 80 mock USDC
                funding budget. This is a neutral initialization, not P(B|A)
                inferred from Gemini prices.
              </p>
            </fieldset>
          ) : (
            <button
              className={`${button} mt-2`}
              disabled={busy}
              onClick={() => setCreating(true)}
            >
              Choose another pair
            </button>
          )}
          {market && !creating && (
            <Trading
              key={`${config.genesis}:${market.address}:${publicKey?.toBase58() ?? "disconnected"}`}
              config={config}
              market={market}
            />
          )}
        </>
      )}
    </>
  );
}

export function Positions() {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="mt-3 rounded-md border border-dashed border-line-2 p-2.5 text-[11px]"
      data-testid="positions"
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-ink-2">FORK Positions</span>
        <span className="tag tag-custom">
          {open ? "close" : "local Solana"}
        </span>
      </button>
      {open && <PositionsContent />}
    </div>
  );
}
