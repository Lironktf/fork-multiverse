import { PublicKey } from "@solana/web3.js";
import { environmentClient, pda, BN } from "../client/anchor.js";
import { strategyForWallet } from "../research/live-strategy.js";
const arg = process.argv[2];
if (!arg)
  throw new Error(
    "Usage: npm run bot -- MARKET_PDA [--execute-testnet]; default is paper proposal only",
  );
const execute = process.argv.includes("--execute-testnet");
if (execute && process.env.ENABLE_TESTNET_TRADING !== "yes")
  throw new Error(
    "Set ENABLE_TESTNET_TRADING=yes explicitly for testnet execution",
  );
const { program, payer, connection, send } = environmentClient(),
  market = new PublicKey(arg),
  m = await program.account.market.fetch(market);
const owner = payer.publicKey,
  trader = pda("trader", market, owner);
const { now, gate, model, proposal, reason } = await strategyForWallet(
  { program, connection },
  market,
  owner,
);
const log = (x: unknown) =>
  console.log(
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
log({
  mode: execute ? "testnet" : "paper",
  market: arg,
  now,
  gate,
  model,
  proposal,
  reason,
});
if (proposal) {
  const accounts = {
    owner,
    config: m.config,
    market,
    parent: m.parent,
    target: m.target,
    trader,
  };
  const authoritative = (await program.methods
    .quote(proposal.yes, proposal.buy, new BN(proposal.amount.toString()))
    .accountsStrict(accounts)
    .view()) as InstanceType<typeof BN>;
  if (BigInt(authoritative.toString()) !== proposal.quote)
    throw new Error("Quote changed: rerun strategy on fresh state");
  if (execute) {
    const signature = await send([
      await program.methods
        .trade(
          proposal.yes,
          proposal.buy,
          new BN(proposal.amount.toString()),
          new BN(proposal.limit.toString()),
        )
        .accountsStrict(accounts)
        .instruction(),
    ]);
    log({ kind: "testnet-trade", signature, proposal });
  } else
    log({
      kind: "paper-proposal",
      authoritativeQuote: authoritative.toString(),
    });
}
