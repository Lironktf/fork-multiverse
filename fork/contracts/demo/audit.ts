import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { makeClient, pda } from "../client/anchor.js";

// Read-only verification of a real saved demo; never signs or submits transactions.
const directory = resolve(".local", process.argv[2] ?? "live-demo");
const saved = JSON.parse(readFileSync(join(directory, "session.json"), "utf8"));
const entries = readFileSync(join(directory, "activity.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const latest = entries.filter((e) => e.kind === "balances").at(-1);
assert(latest, "Run status in the live demo first.");
const { connection, program } = makeClient(Keypair.generate(), saved.rpc);
const market = new PublicKey(latest.data.market);
const state = await program.account.market.fetch(market);
const traders = await program.account.trader.all([
  { memcmp: { offset: 8, bytes: market.toBase58() } },
]);
let cash = 0n,
  principal = 0n,
  yes = 0n,
  no = 0n;
for (const { account: t, publicKey } of traders) {
  assert(publicKey.equals(pda("trader", market, t.owner)));
  cash += BigInt(t.cash.toString());
  principal += BigInt(t.principal.toString());
  yes += BigInt(t.yes.toString());
  no += BigInt(t.no.toString());
}
assert.equal(cash, BigInt(state.cash.toString()));
assert.equal(principal, BigInt(state.principal.toString()));
assert.equal(yes, BigInt(state.yes.toString()));
assert.equal(no, BigInt(state.no.toString()));
const vault = await getAccount(connection, state.vault);
assert(vault.owner.equals(market));
assert(vault.mint.equals(state.mint));
const terminal = ["void", "settledYes", "settledNo"].includes(
  Object.keys(state.status)[0]!,
);
if (terminal) {
  assert(
    vault.amount >=
      BigInt(state.traderRemaining.toString()) +
        BigInt(state.lpRemaining.toString()),
  );
} else {
  assert.equal(vault.amount, principal + BigInt(state.lpDeposits.toString()));
  assert(vault.amount >= cash + (yes > no ? yes : no));
}
const transactions = entries.filter((e) => e.kind === "transaction");
for (let offset = 0; offset < transactions.length; offset += 100) {
  const batch = transactions.slice(offset, offset + 100);
  const statuses = await connection.getSignatureStatuses(
    batch.map(({ data }) => data.signature),
    { searchTransactionHistory: true },
  );
  for (const [index, status] of statuses.value.entries()) {
    assert(
      status &&
        !status.err &&
        ["confirmed", "finalized"].includes(status.confirmationStatus ?? ""),
      `Transaction status unavailable or unsuccessful: ${batch[index].data.signature}`,
    );
  }
}
console.log(
  JSON.stringify(
    {
      market: market.toBase58(),
      verifiedTransactions: transactions.length,
      traders: traders.length,
      vaultMicroUsdc: vault.amount.toString(),
      yesMicroShares: yes.toString(),
      noMicroShares: no.toString(),
      state: state.status,
      invariants: "passed",
    },
    null,
    2,
  ),
);
