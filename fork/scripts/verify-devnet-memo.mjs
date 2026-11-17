// Verifies the Verse-attestation transaction shape end-to-end on Solana devnet
// with a throwaway keypair (the browser flow uses the user's wallet instead).
// Usage: node scripts/verify-devnet-memo.mjs
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, clusterApiUrl, sendAndConfirmTransaction } from "@solana/web3.js";
import { createHash } from "node:crypto";

const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const conn = new Connection(process.env.SOLANA_RPC ?? clusterApiUrl("devnet"), "confirmed");
const kp = Keypair.generate();
console.log("throwaway payer", kp.publicKey.toBase58());
try {
  const sig = await conn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL / 10);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
} catch (e) {
  console.error("AIRDROP FAILED (devnet faucet is rate-limited):", e.message);
  process.exit(2);
}
const canonical = JSON.stringify({ v: 1, verse: "verify-script", parent: "origin", assumptions: [["demo-fed-cuts-100", "YES"]], forecast: null });
const hash = createHash("sha256").update(canonical).digest("hex");
const tx = new Transaction().add(new TransactionInstruction({ keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: false }], programId: MEMO, data: Buffer.from(`FORK1|verify-script|${hash}`, "utf8") }));
const sig = await sendAndConfirmTransaction(conn, tx, [kp]);
const got = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
console.log("signature", sig);
console.log("explorer  https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
console.log("log", got?.meta?.logMessages?.find((l) => l.includes("Memo")) ?? got?.meta?.logMessages);
