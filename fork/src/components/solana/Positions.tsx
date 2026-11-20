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
import {
  executionLimit,
  formatUnits,
  parseUnits,
} from "@/lib/contracts/amounts";
import type {
  AppConfig,
  Instrument,
  MarketDescriptor,
} from "@/lib/contracts/generated/app-types";
import { explorerTx, SOLANA_CLUSTER } from "./SolanaProvider";
import { short, WalletButton } from "./WalletButton";
import { useShallow } from "zustand/react/shallow";
import { cumulativeAssumptions, ORIGIN_ID } from "@/lib/domain/verse";
import type { ForkEvent } from "@/lib/domain/types";
import {
  graphInstrument,
  graphMarketPair,
  bindingLabel,
} from "@/lib/contracts/graph-market";
import { navigateTo } from "@/lib/client/actions";

const field =
  "w-full min-w-0 rounded-md border border-line bg-black/20 px-3 py-2 text-sm text-ink outline-none focus:border-accent/50";
const button = "btn !h-9 !text-sm";
const errorText = (error: unknown) =>
  /reject|denied|cancel/i.test(String(error))
    ? "Transaction rejected in the wallet. No trade was submitted."
    : error instanceof Error
      ? error.message
      : String(error);
type Selection = Instrument & { close: string; reviewed: boolean };

function InstrumentReview({
  role,
  selected,
  onSelect,
}: {
  role: "A" | "B";
  selected: Selection | null;
  onSelect: (value: Selection) => void;
}) {
  if (!selected) return null;
  return (
    <div
      className="mt-3 rounded-lg border border-line p-3"
      data-testid={`instrument-${role}`}
    >
      <p className="text-xs text-ink-3">
        {role === "A" ? "Condition · must happen" : "Target · trade YES or NO"}
      </p>
      <p className="mt-1 font-medium text-ink">
        {selected.title} · {selected.label}
      </p>
      <p className="mt-2 text-xs text-ink-3">
        Observation: {new Date(selected.expiry).toLocaleString()}
      </p>
      <a
        href={selected.rulesUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-accent"
      >
        Read source rules <ExternalLink size={12} />
      </a>
      <details className="mt-2 text-sm text-ink-3">
        <summary className="cursor-pointer">Resolution criteria</summary>
        <p className="mt-2">
          {selected.description || "Read the linked source rules."}
        </p>
        <p className="mt-2 break-all text-xs">{selected.instrument}</p>
      </details>
      <label className="mt-3 block text-sm text-ink-2">
        FORK trading closes (UTC)
        <input
          aria-label={`${role} trading close UTC`}
          className={`${field} mt-1`}
          value={selected.close}
          readOnly={selected.closeTs !== undefined}
          onChange={(e) =>
            onSelect({ ...selected, close: e.target.value, reviewed: false })
          }
        />
      </label>
      {!selected.closeTs && (
        <p className="mt-1 text-xs text-ink-3">
          Proposed close: 10 minutes before observation. Check the source rules
          and adjust if needed.
        </p>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
        <input
          type="checkbox"
          aria-label={`Reviewed ${role} rules`}
          className="mt-1"
          checked={selected.reviewed}
          onChange={(e) =>
            onSelect({ ...selected, reviewed: e.target.checked })
          }
        />
        I reviewed the rules and trading close.
      </label>
    </div>
  );
}

function Trading({
  config,
  market,
  initialYes = true,
}: {
  config: AppConfig;
  market: MarketDescriptor;
  initialYes?: boolean;
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
  const [yes, setYes] = useState(initialYes);
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
        setMessage("Transaction confirmed.");
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
  let tradeProblem = "";
  try {
    const shares = parseUnits(quantity);
    if (
      !buy &&
      shares >
        BigInt(
          (yes ? state?.trader?.yes : state?.trader?.no)?.toString() ?? "0",
        )
    )
      tradeProblem = `You do not own enough ${yes ? "YES" : "NO"} shares to sell.`;
    if (buy && state?.trader?.cash.isZero())
      tradeProblem = "Add trading funds before buying shares.";
  } catch {
    tradeProblem = "Enter a positive share amount with up to six decimals.";
  }
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
    !!state &&
    ["pending", "active"].includes(state.status) &&
    !closed &&
    !state.paused &&
    !state.parent.halted &&
    !state.target.halted &&
    "unresolved" in state.target.outcome &&
    ("unresolved" in state.parent.outcome || "yes" in state.parent.outcome);
  if (!client || !wallet.publicKey || !signer)
    return (
      <div className="mt-4 rounded-lg border border-line p-4">
        <p className="mb-3 text-sm text-ink-2">
          Connect your wallet to deposit and trade on {config.cluster}.
        </p>
        <WalletButton showLabel />
      </div>
    );
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="trading">
      <p className="text-sm text-ink-3">
        Wallet {short(wallet.publicKey.toBase58())} · {config.cluster} · test
        USDC
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-ink">
          {!state
            ? "Loading market…"
            : closed && locked
              ? "Trading closed · awaiting results"
              : state.paused || state.parent.halted || state.target.halted
                ? "Trading paused"
                : ({
                    funding: "Awaiting liquidity",
                    halted: "Trading paused",
                    pending: "Open for trading",
                    active: "Condition met · trading open",
                    frozen: "Awaiting condition result",
                    void: "Cancelled · refund available",
                    settledYes: "Settled YES",
                    settledNo: "Settled NO",
                  }[state.status] ?? state.status)}
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
      {state?.status === "funding" && (
        <p className="mt-2 text-sm text-ink-3">
          This market needs liquidity before trading. Open Liquidity & contract
          details below to fund it.
        </p>
      )}
      {state && (
        <>
          {state.trader && (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-white/[0.03] p-3 text-center">
              <div>
                <p className="text-xs text-ink-3">Trading cash</p>
                <p className="num mt-1">
                  {Number(formatUnits(state.trader.cash)).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-3">YES shares</p>
                <p className="num mt-1">
                  {Number(formatUnits(state.trader.yes)).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-3">NO shares</p>
                <p className="num mt-1">
                  {Number(formatUnits(state.trader.no)).toFixed(2)}
                </p>
              </div>
            </div>
          )}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-3">
              {state.trader
                ? "Full balance details"
                : `Wallet balance · ${Number(formatUnits(state.walletCollateral)).toFixed(2)} test USDC`}
            </summary>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
              {[
                [
                  "Wallet collateral",
                  state.walletCollateral,
                  "wallet-collateral",
                ],
                ["Total deposited", state.trader?.principal, "principal"],
                ["Available to trade", state.trader?.cash, "cash"],
                ["YES holdings", state.trader?.yes, "yes"],
                ["NO holdings", state.trader?.no, "no"],
                ["Ready to withdraw", state.withdrawable, "withdrawable"],
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
          </details>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            {state.trader?.claimed
              ? "This position has been redeemed."
              : locked
                ? "Cash unlocks at settlement. A failed or invalid condition refunds your original deposit."
                : state.status === "void"
                  ? "This market was cancelled. Withdraw your original deposit."
                  : "Withdraw your remaining cash plus 1 test USDC for each winning share."}
          </p>
        </>
      )}
      <details
        className="mt-4 rounded-lg border border-line p-3"
        open={!!state && !state.trader}
      >
        <summary className="cursor-pointer font-medium text-ink">
          Add trading funds
        </summary>
        <p className="mt-2 text-sm text-ink-3">
          Get free test USDC, then deposit the amount you want to trade. SOL
          pays network fees.
        </p>
        <button
          className={`${button} mt-3`}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api("faucet", { owner: wallet.publicKey!.toBase58() });
            })
          }
        >
          {config.cluster === "localnet"
            ? "Get test USDC + SOL"
            : "Get test USDC"}
        </button>
        {config.cluster === "devnet" && (
          <p className="mt-1 text-sm text-ink-3">
            Devnet SOL pays network fees. Use the wallet’s Get devnet SOL
            button; test USDC is separate test collateral.
          </p>
        )}
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
      </details>
      {tradable && state?.trader && (
        <>
          <h3 className="mt-4 font-medium text-ink">Trade shares</h3>
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
          <label className="mt-2 block text-sm text-ink-3">
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
          <details className="mt-2 text-sm text-ink-3">
            <summary className="cursor-pointer">
              Price protection · {slippage / 100}%
            </summary>
            <label className="mt-2 block">
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
          </details>
          <button
            className={`${button} mt-3 w-full`}
            disabled={busy || !tradable || !state?.trader || !!tradeProblem}
            onClick={() =>
              void run(async () => {
                setQuote(await client.quote(yes, buy, quantity));
              })
            }
          >
            {busy ? "Checking transaction…" : "Review trade"}
          </button>
          {tradeProblem && (
            <p className="mt-2 text-sm text-ink-3">{tradeProblem}</p>
          )}
          {quote && (
            <div
              className="mt-2 rounded-md border border-line p-2 text-sm"
              data-testid="chain-quote"
            >
              <div className="num text-ink">
                {quote.buy ? "Cost" : "Conditional proceeds"}:{" "}
                {formatUnits(BigInt(quote.cost))} test USDC
              </div>
              <div className="mt-1 text-ink-3">
                Includes LP fee: {formatUnits(BigInt(quote.fee))} test USDC.
                Refunded on VOID.
              </div>
              {quote.probability !== null && (
                <div className="mt-1 text-ink-2">
                  Market YES price: {(quote.probability * 100).toFixed(4)}%
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
                  void run(() =>
                    client.trade(quote, slippage, signer, setMessage),
                  )
                }
              >
                Confirm {quote.buy ? "buy" : "sell"} {quote.yes ? "YES" : "NO"}
              </button>
            </div>
          )}
          <p className="mt-2 text-sm text-ink-3">
            {buy
              ? "Each winning share pays 1 test USDC if the condition is met."
              : "Selling returns cash to this market. You can withdraw after settlement."}
          </p>
        </>
      )}
      {state && !locked && !state.trader?.claimed && state.trader && (
        <button
          className={`${button} mt-3 w-full`}
          disabled={busy || state.withdrawable <= BigInt(0)}
          onClick={() => void run(() => client.redeem(signer, setMessage))}
        >
          Withdraw {state.status === "void" ? "refund" : "balance"}
        </button>
      )}
      {message && (
        <p className="mt-2 break-all text-sm text-ink-3" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 break-words text-sm text-down" role="alert">
          {error}
        </p>
      )}
      {state && (
        <details className="mt-4 border-t border-line pt-3 text-sm text-ink-3">
          <summary className="cursor-pointer">
            Liquidity & contract details
          </summary>{" "}
          <details className="mt-3 text-sm text-ink-3" data-testid="liquidity">
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
          <details className="mt-2 text-sm text-ink-3">
            <summary className="cursor-pointer">
              Confirmed chain details
            </summary>
            <div className="num mt-1 break-all">
              Market {market.address}
              <br />
              Confirmed slot {state.slot}
              <br />
              Vault {formatUnits(state.vaultCollateral)} test USDC
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
        </details>
      )}
      {signatures.length > 0 && (
        <details className="mt-2 text-sm">
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
  const { verse, targetRef, events } = useUniverse(
    useShallow((s) => ({
      verse: s.verses[s.currentVerseId],
      targetRef: s.target,
      events: s.events,
    })),
  );
  const assumptions = cumulativeAssumptions(verse);
  const [conditionId, setConditionId] = useState(assumptions[0]?.eventId ?? "");
  const condition = assumptions.find((a) => a.eventId === conditionId);
  const pair = graphMarketPair(events, targetRef, condition);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [markets, setMarkets] = useState<MarketDescriptor[]>([]);
  const [parent, setParent] = useState<Selection | null>(null);
  const [target, setTarget] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const market = pair
    ? markets.find(
        (m) =>
          m.bindings[0].instrument === pair.parent.instrument &&
          m.bindings[1].instrument === pair.target.instrument,
      )
    : undefined;

  const loadEvent = async (ticker: string) => {
    const response = await fetch(`/api/events/${encodeURIComponent(ticker)}`);
    const data = await response.json();
    if (!response.ok || !data.ok)
      throw new Error(data.error ?? "Could not load the graph event.");
    const event = data.event as ForkEvent;
    useUniverse.getState().registerEvents([event]);
    return event;
  };
  const connect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const conf = await api<AppConfig>("config");
      validateConfig(conf);
      if (SOLANA_CLUSTER !== conf.cluster)
        throw new Error(
          `App and service networks differ. Restart with matching ${conf.cluster} settings.`,
        );
      setConfig(conf);
      const all = await api<MarketDescriptor[]>("markets");
      setMarkets(all);
      // Hydrate exact instrument mappings for older saved graphs and market labels.
      const state = useUniverse.getState();
      const tickers = new Set([
        ...all.flatMap((m) => m.bindings.map((b) => b.ticker)),
        ...[
          state.target.eventId,
          ...cumulativeAssumptions(state.verses[state.currentVerseId]).map(
            (a) => a.eventId,
          ),
        ]
          .map((id) => state.events[id]?.externalMarketId)
          .filter((t): t is string => !!t),
      ]);
      await Promise.allSettled([...tickers].map(loadEvent));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void connect();
  }, [connect]);

  const review = async () => {
    if (!pair) return;
    setBusy(true);
    setError("");
    try {
      const selections = await Promise.all(
        [pair.parent, pair.target].map(async (b) => {
          const item = await api<Instrument>(
            `instrument?ticker=${encodeURIComponent(b.ticker)}&instrument=${encodeURIComponent(b.instrument)}`,
          );
          return {
            ...item,
            title: b.title,
            label: b.outcome,
            close: new Date(
              item.closeTs
                ? item.closeTs * 1000
                : Date.parse(item.expiry) - 600_000,
            ).toISOString(),
            reviewed: false,
          };
        }),
      );
      setParent(selections[0]);
      setTarget(selections[1]);
      setReviewing(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const prepare = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<MarketDescriptor>("markets", {
        parent,
        target,
        communityFunding: false,
      });
      setMarkets((previous) => [
        ...previous.filter((m) => m.address !== result.address),
        result,
      ]);
      setReviewing(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const openMarket = async (m: MarketDescriptor) => {
    setBusy(true);
    setError("");
    try {
      const [a, b] = await Promise.all(
        m.bindings.map((binding) => loadEvent(binding.ticker)),
      );
      const outcome = (event: ForkEvent, instrument: string) =>
        Object.entries(event.metadata.instrumentSymbols ?? {}).find(
          ([, symbol]) => symbol === instrument,
        )?.[0];
      const aOutcome = outcome(a, m.bindings[0].instrument),
        bOutcome = outcome(b, m.bindings[1].instrument);
      if (!aOutcome || !bOutcome)
        throw new Error(
          "The source no longer lists this exact instrument. The market cannot be mapped to the graph.",
        );
      const state = useUniverse.getState();
      state.setTarget({ eventId: b.id, outcome: bOutcome });
      const existing = Object.values(state.verses).find((v) => {
        const list = cumulativeAssumptions(v);
        return (
          list.length === 1 &&
          list[0].eventId === a.id &&
          list[0].selectedOutcome === aOutcome
        );
      });
      const next =
        existing ??
        state.createVerse({
          parentId: ORIGIN_ID,
          assumptions: [{ eventId: a.id, outcome: aOutcome }],
        });
      if (!existing) state.renameVerse(next.id, `If ${aOutcome} · ${a.title}`);
      navigateTo(next.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="text-sm leading-relaxed" data-testid="positions">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium text-ink">Trade this world</h2>
        <span className="rounded-full border border-accent/30 px-2 py-0.5 text-xs text-accent">
          {SOLANA_CLUSTER} · test funds
        </span>
      </div>
      <p className="mt-1 text-ink-3">
        Build a market from the graph, then trade YES or NO.
      </p>
      <div
        className="mt-4 rounded-lg border border-line bg-black/20 p-3"
        data-testid="graph-market-context"
      >
        <div className="text-xs text-ink-3">Target</div>
        <p className="mt-1 font-medium text-ink">
          {events[targetRef.eventId]?.title}
        </p>
        <p className="text-ink-2">{targetRef.outcome}</p>
        <div className="mt-3 text-xs text-ink-3">If this condition happens</div>
        {assumptions.length > 1 ? (
          <>
            <select
              aria-label="Graph condition"
              className={`${field} mt-1`}
              value={conditionId}
              disabled={busy}
              onChange={(e) => {
                setConditionId(e.target.value);
                setReviewing(false);
                setParent(null);
                setTarget(null);
              }}
            >
              {assumptions.map((a) => (
                <option key={a.eventId} value={a.eventId}>
                  {events[a.eventId]?.title} · {a.selectedOutcome}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-ink-3">
              Only this condition applies to the trade. The other assumptions
              remain part of the forecast.
            </p>
          </>
        ) : (
          <p className="mt-1 text-ink-2">
            {condition
              ? `${events[condition.eventId]?.title} · ${condition.selectedOutcome}`
              : "Add a live event as an assumption and fork the graph."}
          </p>
        )}
      </div>
      {!pair && (
        <p className="mt-3 text-ink-3" data-testid="market-unavailable">
          {!graphInstrument(events[targetRef.eventId], targetRef.outcome)
            ? "Choose a live Gemini target to trade. Demo and custom events are available for forecasts only."
            : !condition
              ? "Select a world with a live condition, or open an existing market below."
              : "This contract supports one live YES condition. Choose a YES assumption or a specific categorical outcome, different from the target."}
        </p>
      )}
      {error && (
        <p
          className="mt-3 rounded-lg border border-down/30 p-3 text-down"
          role="alert"
        >
          {error}
        </p>
      )}
      {!config ? (
        <button
          className={`${button} mt-3`}
          disabled={busy}
          onClick={() => void connect()}
        >
          {busy ? "Connecting to Solana…" : "Reconnect trading service"}
        </button>
      ) : (
        <>
          {pair && !market && !reviewing && (
            <>
              <button
                className={`${button} mt-4 w-full`}
                disabled={busy}
                onClick={() => void review()}
              >
                {busy ? "Loading contract terms…" : "Build this market"}
              </button>
              <p className="mt-2 text-xs text-ink-3">
                Review the source rules before creating. New markets start at
                50% with 80 test USDC of sponsored liquidity.
              </p>
            </>
          )}
          {reviewing && !market && (
            <fieldset disabled={busy} className="mt-3">
              <InstrumentReview
                role="A"
                selected={parent}
                onSelect={(value) => {
                  if (value) setParent(value);
                }}
              />
              <InstrumentReview
                role="B"
                selected={target}
                onSelect={(value) => {
                  if (value) setTarget(value);
                }}
              />
              <button
                className={`${button} mt-4 w-full`}
                disabled={
                  busy ||
                  !parent?.reviewed ||
                  !target?.reviewed ||
                  !parent.close ||
                  !target.close
                }
                onClick={() => void prepare()}
              >
                {busy ? "Creating market…" : "Create market"}
              </button>
              <button
                className={`${button} mt-2 w-full`}
                onClick={() => setReviewing(false)}
              >
                Cancel
              </button>
            </fieldset>
          )}
          {market && (
            <>
              <div className="mt-3 text-xs text-ink-3">
                YES means {bindingLabel(market.bindings[1], events)} happens. NO
                means it does not. If the condition fails, deposits are
                refunded.
              </div>
              <Trading
                key={`${config.genesis}:${market.address}:${publicKey?.toBase58() ?? "disconnected"}`}
                config={config}
                market={market}
                initialYes={
                  events[targetRef.eventId]?.eventType !== "binary" ||
                  targetRef.outcome !== "NO"
                }
              />
            </>
          )}
          {markets.length > 0 && (
            <details className="mt-5 border-t border-line pt-3" open={!market}>
              <summary className="cursor-pointer font-medium text-ink-2">
                Available markets ({markets.length})
              </summary>
              <div className="mt-2 space-y-2">
                {markets.map((m) => (
                  <button
                    key={m.address}
                    className="w-full rounded-lg border border-line p-3 text-left hover:border-accent/50 disabled:opacity-50"
                    disabled={busy || m.address === market?.address}
                    onClick={() => void openMarket(m)}
                    data-testid="open-graph-market"
                    data-market={m.address}
                  >
                    <span className="block text-ink">
                      {bindingLabel(m.bindings[1], events)}
                    </span>
                    <span className="mt-1 block text-xs text-ink-3">
                      If {bindingLabel(m.bindings[0], events)}
                    </span>
                    <span className="mt-2 block text-xs text-accent">
                      {m.address === market?.address
                        ? "Selected in graph"
                        : "Open in graph & trade"}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function Positions() {
  const key = useUniverse(
    (s) => `${s.currentVerseId}:${s.target.eventId}:${s.target.outcome}`,
  );
  return <PositionsContent key={key} />;
}
