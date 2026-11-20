/** Append zero-fee fields to V1 accounts without changing positions or terms. */
import assert from "node:assert/strict";
import { SystemProgram } from "@solana/web3.js";
import { environmentClient } from "../client/anchor.js";
const { program, connection, payer, send } = environmentClient();
const size = program.coder.accounts.size("market");
const discriminator = Buffer.from(
  program.idl.accounts!.find((a) => a.name === "market")!.discriminator,
);
for (const { pubkey, account } of await connection.getProgramAccounts(
  program.programId,
)) {
  if (!account.data.subarray(0, 8).equals(discriminator)) continue;
  if (account.data.length === size) continue;
  assert.equal(
    account.data.length,
    size - 10,
    `Unexpected market layout at ${pubkey}`,
  );
  const signature = await send([
    await program.methods
      .migrateMarket()
      .accountsStrict({
        payer: payer.publicKey,
        market: pubkey,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  ]);
  const migrated = (await connection.getAccountInfo(pubkey))!;
  assert(migrated.data.subarray(0, account.data.length).equals(account.data));
  assert.equal((await program.account.market.fetch(pubkey)).feeBps, 0);
  console.log(JSON.stringify({ market: pubkey.toBase58(), signature }));
}
