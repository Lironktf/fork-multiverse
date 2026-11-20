import { PublicKey, SystemProgram, type Connection } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createInitializeAccount3Instruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";

/** One transaction-local account: never touch or close the wallet's existing WSOL. */
export async function nativeSolAccount(
  connection: Connection,
  owner: PublicKey,
  amount: bigint,
) {
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Invalid SOL amount.");
  const seed = crypto.randomUUID().replaceAll("-", "");
  const address = await PublicKey.createWithSeed(owner, seed, TOKEN_PROGRAM_ID);
  const rent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
  const lamports = BigInt(rent) + amount;
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("SOL amount exceeds the supported range.");
  return {
    address,
    open: [
      SystemProgram.createAccountWithSeed({
        fromPubkey: owner,
        basePubkey: owner,
        seed,
        newAccountPubkey: address,
        lamports: Number(lamports),
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(address, NATIVE_MINT, owner),
    ],
    close: createCloseAccountInstruction(address, owner, owner),
  };
}
