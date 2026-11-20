// Anchor 1.1.2 requires web3.js 1.x. Keep that compatibility boundary in this module/scripts.
import anchor from "@anchor-lang/core";
import { devnetFetch } from "./devnet-fetch.js";
import { validateNetwork } from "./network.js";
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { ForkContracts } from "../target/types/fork_contracts.js";
import type { Payload } from "../oracle/gemini.js";
export const { BN } = anchor;
export const PROGRAM_ID = new PublicKey(
  JSON.parse(
    readFileSync(
      new URL("../target/idl/fork_contracts.json", import.meta.url),
      "utf8",
    ),
  ).address,
);
export function pda(...seeds: (string | PublicKey | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(
    seeds.map((s) =>
      typeof s === "string"
        ? Buffer.from(s)
        : s instanceof PublicKey
          ? s.toBuffer()
          : Buffer.from(s),
    ),
    PROGRAM_ID,
  )[0];
}
export function makeClient(
  payer: Keypair,
  rpc = process.env.RPC_URL ?? "http://127.0.0.1:8899",
) {
  const u = new URL(rpc);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (
    !local &&
    !(u.protocol === "https:" && u.hostname === "api.devnet.solana.com")
  )
    throw new Error("Only local validator or official devnet RPC supported");
  if (!local && process.env.ENABLE_DEVNET !== "yes")
    throw new Error("Set ENABLE_DEVNET=yes for explicit devnet execution");
  const connection = new Connection(rpc, {
    commitment: "confirmed",
    ...(local ? {} : { fetch: devnetFetch(), disableRetryOnRateLimit: true }),
  });
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  const idl = JSON.parse(
    readFileSync(
      new URL("../target/idl/fork_contracts.json", import.meta.url),
      "utf8",
    ),
  ) as ForkContracts;
  const program = new anchor.Program<ForkContracts>(idl, provider);
  async function send(
    instructions: TransactionInstruction[],
    signers: Keypair[] = [],
  ): Promise<string> {
    validateNetwork(
      local ? "localnet" : "devnet",
      rpc,
      await connection.getGenesisHash(),
    );
    const tx = new Transaction().add(...instructions);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(
      payer,
      ...signers.filter((s) => !s.publicKey.equals(payer.publicKey)),
    );
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.err) throw new Error(JSON.stringify(simulation.value));
    return provider.sendAndConfirm(tx, signers);
  }
  return { payer, connection, provider, program, send, local };
}
export function environmentClient() {
  const path = process.env.SIGNER_PATH;
  if (!path)
    throw new Error(
      "Set SIGNER_PATH to an existing local/devnet signer outside source control",
    );
  return makeClient(
    Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))),
    ),
  );
}
export function reportData(p: Payload) {
  const idl = JSON.parse(
    readFileSync(
      new URL("../target/idl/fork_contracts.json", import.meta.url),
      "utf8",
    ),
  );
  const coder = new anchor.BorshInstructionCoder(idl);
  return coder.encode("report", {
    binding: p.binding,
    terms_hash: p.termsHash,
    outcome: {
      [p.outcome === "unresolved"
        ? "Unresolved"
        : p.outcome[0]!.toUpperCase() + p.outcome.slice(1)]: {},
    },
    source_ts: new BN(p.sourceTs),
  });
}
