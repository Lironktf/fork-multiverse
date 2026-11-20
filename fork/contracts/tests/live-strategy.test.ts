import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { BN } from "../client/anchor.js";
import { strategyForWallet } from "../research/live-strategy.js";

test("wallet strategy is read-only and abstains on missing history or inventory", async () => {
  const market = Keypair.generate().publicKey,
    owner = Keypair.generate().publicKey;
  const parent = Keypair.generate().publicKey,
    target = Keypair.generate().publicKey;
  let hasTrader = false;
  const calls: string[] = [];
  const context = {
    connection: {
      getSlot: async () => 1,
      getBlockTime: async () => 1_800_000_000,
    },
    program: {
      account: {
        market: {
          fetch: async () => ({
            config: market,
            parent,
            target,
            yes: new BN(0),
            no: new BN(0),
            offsetYes: new BN(0),
            offsetNo: new BN(0),
            b: new BN(100_000_000),
            feeBps: 100,
            started: true,
          }),
        },
        config: {
          fetch: async () => ({
            maxTrade: new BN(20_000_000),
            paused: false,
            feeBps: 999,
          }),
        },
        externalEvent: {
          fetch: async (key: typeof parent) => ({
            ticker: key.equals(parent) ? "A" : "B",
            instrument: key.equals(parent) ? "GEMI-A" : "GEMI-B",
            termsHash: Array(32).fill(1),
            closeTs: new BN(1_800_001_000),
            observationTs: new BN(1_800_001_000),
            outcome: { unresolved: {} },
            halted: false,
          }),
        },
        trader: {
          fetchNullable: async () =>
            hasTrader
              ? { cash: new BN(100_000_000), yes: new BN(0), no: new BN(0) }
              : null,
        },
      },
    },
  } as unknown as Parameters<typeof strategyForWallet>[0];
  const fetcher: typeof fetch = async (input) => {
    calls.push(String(input));
    const ticker = String(input).endsWith("/A") ? "A" : "B";
    return new Response(
      JSON.stringify({
        ticker,
        status: "active",
        contracts: [
          {
            instrumentSymbol: `GEMI-${ticker}`,
            status: "active",
            prices: { bestBid: "0.49", bestAsk: "0.51" },
          },
        ],
      }),
    );
  };
  const empty = await strategyForWallet(context, market, owner, fetcher);
  assert.equal(empty.proposal, null);
  assert.match(empty.reason, /Deposit collateral/);
  hasTrader = true;
  const result = await strategyForWallet(context, market, owner, fetcher);
  assert.equal(result.owner, owner.toBase58());
  assert.equal(result.market, market.toBase58());
  assert.equal(result.proposal, null);
  assert.equal(result.model.probability, null);
  assert.equal(result.reason, result.model.reason);
  assert.equal(calls.length, 4);
});
