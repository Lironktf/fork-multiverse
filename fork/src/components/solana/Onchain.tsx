"use client";
import { useState } from "react";
import { Anchor, ExternalLink, Loader2 } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useShallow } from "zustand/react/shallow";
import { useUniverse, forecastFor } from "@/store/universe";
import { useUI } from "@/store/ui";
import { buildMemoTx, confirm, verseFingerprint } from "@/lib/client/attest";
import { SOLANA_CLUSTER, explorerTx } from "./SolanaProvider";
import { short } from "./WalletButton";
import { ORIGIN_ID } from "@/lib/domain/verse";

/**
 * Onchain section for the current Verse.
 *  - Verse attestation: a REAL devnet transaction (SPL Memo) signed by the
 *    user's wallet, anchoring the Verse fingerprint. Status shown only after
 *    confirmation; signature links to Solana Explorer.
 *  Trading: "If this happens, buy" (IfThenBuy, mock USDC) below the forecast, and the
 *  graph-linked Trade tab (Positions, native devnet SOL).
 */
const NONE: never[] = [];

export function Onchain() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { verse, target, forecasts, forecastIndex, attestations } = useUniverse(
    useShallow((s) => ({
      verse: s.verses[s.currentVerseId],
      target: s.target,
      forecasts: s.forecasts,
      forecastIndex: s.forecastIndex,
      attestations: s.attestations[s.currentVerseId] ?? NONE,
    })),
  );
  const [state, setState] = useState<"idle" | "signing" | "confirming">("idle");
  // the Origin world has no assumptions to anchor
  if (verse.id === ORIGIN_ID) return null;
  const f = forecastFor({ forecasts, forecastIndex }, verse.id, target);

  const attest = async () => {
    const ui = useUI.getState();
    if (!connected || !publicKey) {
      ui.toast(
        "Connect a Solana wallet (top right) to anchor this Verse on the configured network.",
        "warn",
      );
      return;
    }
    try {
      setState("signing");
      const { hash } = await verseFingerprint(
        verse,
        f && f.ensembleProbability != null ? f : null,
      );
      const memo = `FORK1|${verse.id}|${hash}`;
      const tx = buildMemoTx(publicKey, memo);
      const sig = await sendTransaction(tx, connection);
      setState("confirming");
      await confirm(connection, sig);
      useUniverse.getState().addAttestation(verse.id, {
        signature: sig,
        hash,
        at: new Date().toISOString(),
        cluster: SOLANA_CLUSTER,
        wallet: publicKey.toBase58(),
      });
      ui.toast(`Verse fingerprint confirmed on Solana ${SOLANA_CLUSTER}.`);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      const rejected =
        /reject|denied|cancel/i.test(msg) ||
        (e as Error).name === "WalletSignTransactionError";
      ui.toast(
        rejected
          ? "Transaction rejected in the wallet. Nothing was sent."
          : `Solana transaction failed: ${msg.slice(0, 140)}`,
        rejected ? "info" : "error",
      );
    } finally {
      setState("idle");
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="onchain">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
          <Anchor size={12} className="text-accent" aria-hidden /> Onchain
        </span>
        <span className="tag tag-custom">solana {SOLANA_CLUSTER}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
        Anchor a SHA-256 fingerprint of this world’s assumptions
        {f?.ensembleProbability != null ? " and forecast" : ""} in a Solana memo
        signed by your wallet. Proof of what was assumed, when — not a position.
      </p>
      <button
        className="btn mt-2 !h-7 !text-[11px]"
        onClick={attest}
        disabled={state !== "idle"}
        data-testid="attest"
      >
        {state !== "idle" ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Anchor size={11} />
        )}
        {state === "signing"
          ? "Waiting for wallet…"
          : state === "confirming"
            ? "Confirming…"
            : connected
              ? "Anchor this Verse"
              : "Connect wallet to anchor"}
      </button>
      {attestations.map((a) => (
        <a
          key={a.signature}
          href={explorerTx(a.signature)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-1.5 text-[10.5px] text-ink-2 hover:text-accent"
        >
          <ExternalLink size={10} />
          <span className="num">{short(a.signature)}</span>
          <span className="text-ink-3">
            · {short(a.wallet)} · {new Date(a.at).toLocaleString()}
          </span>
        </a>
      ))}
    </div>
  );
}
