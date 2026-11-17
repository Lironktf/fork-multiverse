"use client";
import { Buffer } from "buffer";
import { PublicKey, Transaction, TransactionInstruction, type Connection } from "@solana/web3.js";
import type { Forecast, Verse } from "@/lib/domain/types";
import { cumulativeAssumptions } from "@/lib/domain/verse";

/** SPL Memo program v2 — https://spl.solana.com/memo */
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * Canonical fingerprint of a Verse and (optionally) its forecast for a target.
 * Anyone holding the Verse JSON can recompute the hash and match it to the
 * memo onchain. The memo proves *what was assumed and estimated, by which
 * wallet, when* — it is not a financial position and settles nothing.
 */
export async function verseFingerprint(v: Verse, f: Forecast | null): Promise<{ canonical: string; hash: string }> {
  const canonical = JSON.stringify({
    v: 1,
    verse: v.id,
    parent: v.parentId,
    assumptions: cumulativeAssumptions(v).map((a) => [a.eventId, a.selectedOutcome]),
    forecast: f ? { target: `${f.targetEventId}::${f.targetOutcome}`, p: f.ensembleProbability, kind: f.kind, id: f.id } : null,
  });
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { canonical, hash };
}

export function buildMemoTx(payer: PublicKey, memo: string) {
  return new Transaction().add(new TransactionInstruction({ keys: [{ pubkey: payer, isSigner: true, isWritable: false }], programId: MEMO_PROGRAM_ID, data: Buffer.from(memo, "utf8") }));
}

export async function confirm(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash();
  const res = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (res.value.err) throw new Error(`Transaction failed onchain: ${JSON.stringify(res.value.err)}`);
}
