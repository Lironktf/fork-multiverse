import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { makeClient, environmentClient, pda, BN } from "../client/anchor.js";
import { bindingHash, sha256 } from "../oracle/gemini.js";
const c = process.env.SIGNER_PATH
  ? environmentClient()
  : makeClient(Keypair.generate());
const { payer, connection, program, send } = c;
if (c.local) {
  const signature = await connection.requestAirdrop(
    payer.publicKey,
    5_000_000_000,
  );
  await connection.confirmTransaction(signature, "confirmed");
}
const mint = await createMint(connection, payer, payer.publicKey, null, 6);
const token = (
  await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  )
).address;
await mintTo(connection, payer, mint, token, payer, 10_000_000_000n);
const config = pda("config", payer.publicKey);
await send([
  await program.methods
    .initializeConfig(
      payer.publicKey,
      payer.publicKey,
      new BN(1_000_000_000),
      new BN(1_000_000_000_000),
    )
    .accountsStrict({
      admin: payer.publicKey,
      config,
      mint,
      systemProgram: SystemProgram.programId,
    })
    .instruction(),
]);
const slot = await connection.getSlot(),
  now = (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
const events: PublicKey[] = [],
  bindings: number[][] = [],
  hashes: number[][] = [];
for (let j = 0; j < 2; j++) {
  const ticker = `DEMO-${j}`,
    instrument = `GEMI-${ticker}`,
    binding = bindingHash(ticker, instrument),
    termsHash = [...Buffer.from(sha256(`DEMO RULES ${j}`), "hex")];
  const event = pda("event", config, Uint8Array.from(binding));
  events.push(event);
  bindings.push(binding);
  hashes.push(termsHash);
  await send([
    await program.methods
      .registerEvent(
        binding,
        ticker,
        instrument,
        termsHash,
        new BN(now + 30 + j * 10),
        new BN(now + 31 + j * 10),
      )
      .accountsStrict({
        admin: payer.publicKey,
        config,
        event,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  ]);
}
const parent = events[0]!,
  target = events[1]!,
  market = pda("market", config, parent, target),
  vault = pda("vault", market);
await send([
  await program.methods
    .createMarket(new BN(100_000_000), new BN(0))
    .accountsStrict({
      admin: payer.publicKey,
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
]);
const owner = payer.publicKey,
  lp = pda("lp", market, owner),
  trader = pda("trader", market, owner);
const common = {
  owner,
  config,
  market,
  parent,
  target,
  mint,
  vault,
  userToken: token,
  tokenProgram: TOKEN_PROGRAM_ID,
};
await send([
  await program.methods
    .openLp()
    .accountsStrict({
      owner,
      market,
      lp,
      systemProgram: SystemProgram.programId,
    })
    .instruction(),
  await program.methods
    .openTrader()
    .accountsStrict({
      owner,
      market,
      trader,
      systemProgram: SystemProgram.programId,
    })
    .instruction(),
]);
await send([
  await program.methods
    .fundLp(new BN(80_000_000))
    .accountsStrict({ ...common, lp })
    .instruction(),
  await program.methods
    .deposit(new BN(200_000_000))
    .accountsStrict({ ...common, trader })
    .instruction(),
]);
await send([
  await program.methods
    .startMarket()
    .accountsStrict({ config, market, parent, target })
    .instruction(),
]);
const tradeAccounts = { owner, config, market, parent, target, trader };
const quote = (await program.methods
  .quote(true, true, new BN(100_000_000))
  .accountsStrict(tradeAccounts)
  .view()) as InstanceType<typeof BN>;
await send([
  await program.methods
    .trade(true, true, new BN(100_000_000), quote)
    .accountsStrict(tradeAccounts)
    .instruction(),
]);
await send([
  await program.methods
    .trade(true, false, new BN(40_000_000), new BN(0))
    .accountsStrict(tradeAccounts)
    .instruction(),
]);
const mode = process.env.DEMO_OUTCOME ?? "void";
if (!["void", "yes", "no"].includes(mode))
  throw new Error("DEMO_OUTCOME must be void, yes or no");
async function until(ts: number) {
  for (;;) {
    const t = (await connection.getBlockTime(await connection.getSlot())) ?? 0;
    if (t >= ts) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}
await until(now + 31);
await send([
  await program.methods
    .report(
      bindings[0]!,
      hashes[0]!,
      mode === "void" ? { no: {} } : { yes: {} },
      new BN(now + 31),
    )
    .accountsStrict({ reporter: owner, config, event: parent })
    .instruction(),
]);
if (mode !== "void") {
  await until(now + 41);
  await send([
    await program.methods
      .report(
        bindings[1]!,
        hashes[1]!,
        mode === "yes" ? { yes: {} } : { no: {} },
        new BN(now + 41),
      )
      .accountsStrict({ reporter: owner, config, event: target })
      .instruction(),
  ]);
}
await send([
  await program.methods
    .syncMarket()
    .accountsStrict({ config, market, parent, target })
    .instruction(),
]);
const final = await program.account.market.fetch(market);
await send([
  await program.methods
    .redeem()
    .accountsStrict({ ...common, trader })
    .instruction(),
]);
await send([
  await program.methods
    .withdrawLp(final.lpPool)
    .accountsStrict({ ...common, lp })
    .instruction(),
]);
const balance = (await getAccount(connection, token)).amount;
if (balance !== 10_000_000_000n)
  throw new Error(`Conservation failure: ${balance}`);
console.log(
  JSON.stringify(
    {
      mode,
      market: market.toBase58(),
      mint: mint.toBase58(),
      buyQuoteMicro: quote.toString(),
      status: final.status,
      traderPayoutMicro: final.traderRemaining.toString(),
      lpPayoutMicro: final.lpPool.toString(),
      finalTokenBalance: balance.toString(),
      vaultBalance: (await getAccount(connection, vault)).amount.toString(),
    },
    null,
    2,
  ),
);
