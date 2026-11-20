/** Real SPL/RPC integration. Synthetic reports only; never a Gemini attestation. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { makeClient, environmentClient, pda, BN } from "../client/anchor.js";
import { bindingHash, sha256 } from "../oracle/gemini.js";
import { requiredSubsidy, quote, tradeFee } from "../research/lmsr.js";

const c = process.env.SIGNER_PATH
  ? environmentClient()
  : makeClient(Keypair.generate());
const { payer, program, connection, send } = c;
const U = 1_000_000n;
const bn = (n: bigint | number) => new BN(n.toString());
const n = (x: { toString(): string }) => BigInt(x.toString());
if (c.local) {
  const sig = await connection.requestAirdrop(payer.publicKey, 10_000_000_000);
  assert.equal(
    (await connection.confirmTransaction(sig, "confirmed")).value.err,
    null,
  );
}
if (process.env.DEPLOY_LOCAL === "yes") {
  assert(c.local, "automatic deploy is local only");
  // Linux memfd lets the CLI reopen the ephemeral payer without storing a key on disk.
  // Secret bytes travel through stdin only, never argv or logs.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "python3",
      [
        "-c",
        `
import os, subprocess, sys
fd = os.memfd_create("fork-local-test-payer", 0)
os.write(fd, sys.stdin.buffer.read())
os.lseek(fd, 0, 0)
try:
    result = subprocess.run(["solana", "program", "deploy", "--url", sys.argv[1],
      "--keypair", f"/proc/self/fd/{fd}", "--program-id", "target/deploy/fork_contracts-keypair.json",
      "--use-rpc", "target/deploy/fork_contracts.so"], pass_fds=(fd,))
finally:
    os.close(fd)
sys.exit(result.returncode)
`,
        connection.rpcEndpoint,
      ],
      { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NO_DNA: "1" } },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stdin.end(JSON.stringify([...payer.secretKey]));
    child.on("error", reject);
    child.on("exit", (code) => {
      // CLI recovery output may contain an ephemeral buffer seed; never log it.
      for (const line of output.split("\n"))
        if (/^(Program Id:|Signature:|Error:)/.test(line)) console.log(line);
      if (code === 0) resolve();
      else reject(new Error(`local deployment exit ${code}`));
    });
  });
}
assert(
  (await connection.getAccountInfo(program.programId))?.executable,
  "deploy program first",
);
const signatures: string[] = [];
async function tx(ixs: TransactionInstruction[], signers: Keypair[] = []) {
  // Unique identity prevents an identical replay from being mistaken for a fresh claim attempt.
  const signature = await send(
    [
      ...ixs,
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
        data: Buffer.from(randomUUID()),
      }),
    ],
    signers,
  );
  signatures.push(signature);
  return signature;
}
async function reject(
  ix: TransactionInstruction,
  signers: Keypair[],
  code: string,
) {
  await assert.rejects(() => tx([ix], signers), new RegExp(code));
}
// Fresh namespace on every run, including devnet; no persistent test keys.
const admin = Keypair.generate();
await tx([
  SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: admin.publicKey,
    lamports: 100_000_000,
  }),
]);
const mint = await createMint(connection, payer, payer.publicKey, null, 6);
const config = pda("config", admin.publicKey);
await tx(
  [
    await program.methods
      .initializeConfig(
        payer.publicKey,
        payer.publicKey,
        bn(1000n * U),
        bn(1_000_000n * U),
      )
      .accountsStrict({
        admin: admin.publicKey,
        config,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  ],
  [admin],
);
await tx(
  [
    await program.methods
      .setFee(100)
      .accountsStrict({ authority: admin.publicKey, config })
      .instruction(),
  ],
  [admin],
);
const users = Array.from({ length: 5 }, () => Keypair.generate());
const tokens: PublicKey[] = [];
for (const user of users) {
  await tx([
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: user.publicKey,
      lamports: 15_000_000,
    }),
  ]);
  const token = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      user.publicKey,
    )
  ).address;
  await mintTo(connection, payer, mint, token, payer, 10_000n * U);
  tokens.push(token);
}
const modes = [
  "yes",
  "no",
  "parent-no",
  "parent-invalid",
  "target-invalid",
] as const;
const markets: {
  market: PublicKey;
  vault: PublicKey;
  parent: PublicKey;
  target: PublicKey;
  mode: (typeof modes)[number];
  binding: number[][];
  terms: number[];
  close: number;
}[] = [];
const now = (await connection.getBlockTime(await connection.getSlot()))!;
// Ample real time for devnet confirmation. Reports wait for actual validator time.
const close =
  now + Number(process.env.SMOKE_CLOSE_SECONDS ?? (c.local ? "180" : "600"));
for (const mode of modes) {
  const terms = [
    ...Buffer.from(sha256(`synthetic liquidity fixture ${mode}`), "hex"),
  ];
  const binding = ["A", "B"].map((role) =>
    bindingHash(`${mode}-${role}`, `SYNTHETIC-${role}`),
  );
  const [parent, target] = binding.map((b) =>
    pda("event", config, Uint8Array.from(b)),
  ) as [PublicKey, PublicKey];
  for (const [i, event] of [parent, target].entries()) {
    await tx(
      [
        await program.methods
          .registerEvent(
            binding[i]!,
            `${mode}-${i === 0 ? "A" : "B"}`,
            `SYNTHETIC-${i === 0 ? "A" : "B"}`,
            terms,
            bn(close),
            bn(close),
          )
          .accountsStrict({
            admin: admin.publicKey,
            config,
            event,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      ],
      [admin],
    );
  }
  const market = pda("market", config, parent, target),
    vault = pda("vault", market);
  await tx(
    [
      await program.methods
        .createMarketForBudget(bn(80n * U), bn(0))
        .accountsStrict({
          admin: admin.publicKey,
          config,
          parent,
          target,
          mint,
          market,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    [admin],
  );
  markets.push({ market, vault, parent, target, mode, binding, terms, close });
}
// A changed default must not reprice existing markets.
await tx(
  [
    await program.methods
      .setFee(200)
      .accountsStrict({ authority: admin.publicKey, config })
      .instruction(),
  ],
  [admin],
);
const funds = (m: (typeof markets)[number], i: number) => ({
  owner: users[i]!.publicKey,
  config,
  market: m.market,
  parent: m.parent,
  target: m.target,
  mint,
  vault: m.vault,
  userToken: tokens[i]!,
  tokenProgram: TOKEN_PROGRAM_ID,
});
const lp = (m: (typeof markets)[number], i: number) => ({
  ...funds(m, i),
  lp: pda("lp", m.market, users[i]!.publicKey),
});
const trader = (m: (typeof markets)[number], i: number) => ({
  ...funds(m, i),
  trader: pda("trader", m.market, users[i]!.publicKey),
});
const tradeAccounts = (m: (typeof markets)[number], i: number) => ({
  owner: users[i]!.publicKey,
  config,
  market: m.market,
  parent: m.parent,
  target: m.target,
  trader: pda("trader", m.market, users[i]!.publicKey),
});
async function invariant(m: (typeof markets)[number]) {
  const state = await program.account.market.fetch(m.market);
  const balance = (await getAccount(connection, m.vault)).amount;
  const terminal =
    "void" in state.status ||
    "settledYes" in state.status ||
    "settledNo" in state.status;
  assert.equal(state.feeBps, 100);
  if (terminal)
    assert(balance >= n(state.traderRemaining) + n(state.lpRemaining));
  else {
    assert.equal(balance, n(state.lpDeposits) + n(state.principal));
    assert(
      balance >=
        n(state.cash) +
          (n(state.yes) > n(state.no) ? n(state.yes) : n(state.no)),
    );
  }
}
for (const m of markets) {
  const state = await program.account.market.fetch(m.market);
  assert(n(state.b) > 115n * U);
  assert(
    requiredSubsidy({
      b: n(state.b),
      offsetYes: n(state.offsetYes),
      offsetNo: n(state.offsetNo),
    }) <=
      80n * U,
  );
  for (const i of [0, 1]) {
    await tx(
      [
        await program.methods
          .openLp()
          .accountsStrict({
            owner: users[i]!.publicKey,
            market: m.market,
            lp: lp(m, i).lp,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        await program.methods
          .fundLp(bn((i === 0 ? 20n : 60n) * U))
          .accountsStrict(lp(m, i))
          .instruction(),
      ],
      [users[i]!],
    );
  }
  await tx(
    [
      await program.methods
        .withdrawLp(bn(U))
        .accountsStrict(lp(m, 0))
        .instruction(),
      await program.methods
        .fundLp(bn(U))
        .accountsStrict(lp(m, 0))
        .instruction(),
    ],
    [users[0]!],
  );
  await reject(
    await program.methods
      .withdrawLp(bn(U))
      .accountsStrict({ ...lp(m, 0), owner: users[1]!.publicKey })
      .instruction(),
    [users[1]!],
    "ConstraintSeeds",
  );
  await tx([
    await program.methods
      .startMarket()
      .accountsStrict({
        config,
        market: m.market,
        parent: m.parent,
        target: m.target,
      })
      .instruction(),
  ]);
  await reject(
    await program.methods.fundLp(bn(U)).accountsStrict(lp(m, 0)).instruction(),
    [users[0]!],
    "Lifecycle",
  );
  await reject(
    await program.methods
      .withdrawLp(bn(U))
      .accountsStrict(lp(m, 0))
      .instruction(),
    [users[0]!],
    "Locked",
  );
  for (const i of [2, 3, 4]) {
    await tx(
      [
        await program.methods
          .openTrader()
          .accountsStrict({
            owner: users[i]!.publicKey,
            market: m.market,
            trader: trader(m, i).trader,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
        await program.methods
          .deposit(bn(1000n * U))
          .accountsStrict(trader(m, i))
          .instruction(),
      ],
      [users[i]!],
    );
  }
  for (const [i, yes, buy, amount] of [
    [2, true, true, 100n * U],
    [3, true, true, 600n * U],
    [2, true, false, 100n * U],
    [4, false, true, 5n * U],
    [4, false, false, 2n * U],
  ] as const) {
    const before = await program.account.market.fetch(m.market);
    const gross = quote(
      {
        b: n(before.b),
        yes: n(before.yes),
        no: n(before.no),
        offsetYes: n(before.offsetYes),
        offsetNo: n(before.offsetNo),
      },
      yes,
      buy,
      amount,
    );
    const fee = tradeFee(gross, before.feeBps),
      net = buy ? gross + fee : gross - fee;
    // Use a signed simulation with return data; view() defaults to the provider payer.
    const ix = await program.methods
      .trade(yes, buy, bn(amount), bn(net))
      .accountsStrict(tradeAccounts(m, i))
      .instruction();
    await reject(
      await program.methods
        .trade(yes, buy, bn(amount), bn(buy ? net - 1n : net + 1n))
        .accountsStrict(tradeAccounts(m, i))
        .instruction(),
      [users[i]!],
      "Slippage",
    );
    await tx([ix], [users[i]!]);
    assert.equal(
      n((await program.account.market.fetch(m.market)).feesAccrued),
      n(before.feesAccrued) + fee,
    );
    await invariant(m);
  }
  assert(
    n((await program.account.trader.fetch(trader(m, 2).trader)).cash) >
      1000n * U,
    "profitable exit fixture",
  );
  console.log(
    JSON.stringify({
      phase: "traded",
      mode: m.mode,
      market: m.market.toBase58(),
    }),
  );
}
console.log(
  `Waiting for actual chain close ${close}; no fabricated clock or oracle result.`,
);
while (
  ((await connection.getBlockTime(await connection.getSlot())) ?? 0) < close
)
  await new Promise((r) => setTimeout(r, c.local ? 500 : 5000));
const evidence: unknown[] = [];
for (const [index, m] of markets.entries()) {
  const isVoid = !["yes", "no"].includes(m.mode);
  const outcomes = [
    m.mode === "parent-no"
      ? { no: {} }
      : m.mode === "parent-invalid"
        ? { invalid: {} }
        : { yes: {} },
    m.mode === "target-invalid"
      ? { invalid: {} }
      : m.mode === "no"
        ? { no: {} }
        : { yes: {} },
  ];
  for (const i of [0, 1])
    await tx([
      await program.methods
        .report(m.binding[i]!, m.terms, outcomes[i]!, bn(close))
        .accountsStrict({
          reporter: payer.publicKey,
          config,
          event: i === 0 ? m.parent : m.target,
        })
        .instruction(),
    ]);
  await tx([
    await program.methods
      .syncMarket()
      .accountsStrict({
        config,
        market: m.market,
        parent: m.parent,
        target: m.target,
      })
      .instruction(),
  ]);
  const final = await program.account.market.fetch(m.market);
  if (isVoid) assert.equal(n(final.lpPool), 80n * U);
  if (m.mode === "yes")
    assert(n(final.lpPool) < 30n * U, "LP loss despite fees");
  const expected = new Map<number, bigint>();
  for (const i of [0, 1, 2, 3, 4]) {
    if (i < 2)
      expected.set(
        i,
        isVoid
          ? (i === 0 ? 20n : 60n) * U
          : (n(final.lpPool) * (i === 0 ? 20n : 60n)) / 80n,
      );
    else {
      const t = await program.account.trader.fetch(trader(m, i).trader);
      expected.set(
        i,
        isVoid
          ? n(t.principal)
          : n(t.cash) + n(m.mode === "yes" ? t.yes : t.no),
      );
    }
  }
  for (const i of index % 2 ? [2, 4, 0, 3, 1] : [0, 1, 4, 3, 2]) {
    const before = (await getAccount(connection, tokens[i]!)).amount;
    const instruction =
      i < 2
        ? await program.methods
            .withdrawLp(bn(expected.get(i)!))
            .accountsStrict(lp(m, i))
            .instruction()
        : await program.methods
            .redeem()
            .accountsStrict(trader(m, i))
            .instruction();
    await tx([instruction], [users[i]!]);
    assert.equal(
      (await getAccount(connection, tokens[i]!)).amount - before,
      expected.get(i),
    );
    await reject(instruction, [users[i]!], "Claimed");
    await invariant(m);
  }
  const dust = (await getAccount(connection, m.vault)).amount;
  assert(dust <= 1n);
  assert.equal(
    [...expected.values()].reduce((a, b) => a + b, 0n) + dust,
    3080n * U,
  );
  evidence.push({
    mode: m.mode,
    market: m.market.toBase58(),
    feesAccrued: final.feesAccrued.toString(),
    lpPool: final.lpPool.toString(),
    dust: dust.toString(),
  });
  // Settling one market cannot borrow another market's collateral.
  for (const other of markets) await invariant(other);
}
for (const signature of signatures) {
  const status = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  assert(status.value[0], `missing ${signature}`);
  assert.equal(status.value[0].err, null);
}
console.log(
  JSON.stringify(
    {
      cluster: c.local ? "localnet" : "devnet",
      program: program.programId.toBase58(),
      config: config.toBase58(),
      markets: evidence,
      confirmedTransactions: signatures.length,
      signatures,
    },
    null,
    2,
  ),
);
