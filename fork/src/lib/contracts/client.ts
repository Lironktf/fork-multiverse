"use client";
// Browser-only legacy boundary: Anchor 1.1.2 and the existing wallet adapter use web3.js 1.x.
import { BN, Program, EventParser, type IdlAccounts } from "@anchor-lang/core";
import { Buffer } from "buffer";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import idl from "./generated/idl.json";
import build from "./generated/build.json";
import type { ForkContracts } from "./generated/fork_contracts";
import type { AppConfig, MarketDescriptor } from "./generated/app-types";
import { claimable, executionLimit, parseUnits } from "./amounts";
import { liquidityMetrics } from "./liquidity";
import { validateNetwork } from "./generated/network";

export type Accounts = IdlAccounts<ForkContracts>;
export const PROGRAM_ID = new PublicKey(idl.address);
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/solana/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result.error ?? "Solana service unavailable.");
  return result.data as T;
}
export function validateConfig(config: AppConfig) {
  if (
    config.program !== PROGRAM_ID.toBase58() ||
    config.idlHash !== build.idlHash
  )
    throw new Error(
      "Incompatible program or IDL. Run npm run app:sync in contracts and rebuild Fork.",
    );
  validateNetwork(config.cluster, config.rpc, config.genesis);
}
export function pda(...seeds: (string | PublicKey)[]) {
  return PublicKey.findProgramAddressSync(
    seeds.map((s) => (typeof s === "string" ? Buffer.from(s) : s.toBuffer())),
    PROGRAM_ID,
  )[0];
}
export function marketClient(
  connection: Connection,
  config: AppConfig,
  market: MarketDescriptor,
  owner: PublicKey,
) {
  validateConfig(config);
  const program = new Program<ForkContracts>(idl as ForkContracts, {
    connection,
  });
  const accounts = {
    config: new PublicKey(config.config),
    market: new PublicKey(market.address),
    parent: new PublicKey(market.parent),
    target: new PublicKey(market.target),
    owner,
    trader: pda("trader", new PublicKey(market.address), owner),
  };
  const mint = new PublicKey(config.mint),
    vault = new PublicKey(market.vault);
  const userToken = getAssociatedTokenAddressSync(mint, owner);
  const lpAddress = pda("lp", accounts.market, owner);
  const funds = {
    ...accounts,
    mint,
    vault,
    userToken,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
  let minimumSlot = 0;
  async function network() {
    const fresh = await api<AppConfig>("config");
    validateConfig(fresh);
    if (
      fresh.genesis !== config.genesis ||
      fresh.config !== config.config ||
      fresh.mint !== config.mint ||
      (await connection.getGenesisHash()) !== config.genesis
    )
      throw new Error(
        "Wallet RPC or deployment changed. Reconnect to the configured Solana network.",
      );
  }
  async function read() {
    const keys = [
      accounts.config,
      accounts.market,
      accounts.parent,
      accounts.target,
      accounts.trader,
      userToken,
      vault,
      lpAddress,
    ];
    const response = await connection.getMultipleAccountsInfoAndContext(keys, {
      commitment: "confirmed",
      minContextSlot: minimumSlot,
    });
    const decode = <K extends keyof Accounts>(
      name: K,
      index: number,
    ): Accounts[K] => {
      const data = response.value[index];
      if (!data || !data.owner.equals(PROGRAM_ID))
        throw new Error(
          `Missing or incompatible ${name} account. Check the deployment.`,
        );
      return program.coder.accounts.decode(name, data.data) as Accounts[K];
    };
    const c = decode("config", 0),
      m = decode("market", 1),
      a = decode("externalEvent", 2),
      b = decode("externalEvent", 3);
    const trader = response.value[4] ? decode("trader", 4) : null;
    const lp = response.value[7] ? decode("lp", 7) : null;
    if (lp && (!lp.owner.equals(owner) || !lp.market.equals(accounts.market)))
      throw new Error("LP account does not belong to this wallet/market.");
    if (
      !m.config.equals(accounts.config) ||
      !m.parent.equals(accounts.parent) ||
      !m.target.equals(accounts.target) ||
      !m.mint.equals(mint) ||
      !m.vault.equals(vault) ||
      !c.mint.equals(mint) ||
      !a.config.equals(accounts.config) ||
      !b.config.equals(accounts.config)
    )
      throw new Error("Market binding/configuration mismatch.");
    for (const [index, event] of [a, b].entries()) {
      const binding = market.bindings[index];
      if (
        event.ticker !== binding.ticker ||
        event.instrument !== binding.instrument ||
        event.closeTs.toNumber() !== binding.closeTs ||
        event.observationTs.toNumber() !== binding.observationTs ||
        Buffer.from(event.termsHash).toString("hex") !== binding.termsHash
      )
        throw new Error("Immutable source binding mismatch.");
    }
    if (
      trader &&
      (!trader.owner.equals(owner) || !trader.market.equals(accounts.market))
    )
      throw new Error("Trader account does not belong to this wallet/market.");
    const walletToken = response.value[5]
      ? unpackAccount(userToken, response.value[5], TOKEN_PROGRAM_ID)
      : null;
    const vaultToken = unpackAccount(
      vault,
      response.value[6],
      TOKEN_PROGRAM_ID,
    );
    if (
      !vaultToken.mint.equals(mint) ||
      !vaultToken.owner.equals(accounts.market) ||
      (walletToken &&
        (!walletToken.mint.equals(mint) || !walletToken.owner.equals(owner)))
    )
      throw new Error("Collateral account mismatch.");
    const status = Object.keys(m.status)[0];
    const fingerprint = [
      m.yes,
      m.no,
      trader?.cash,
      trader?.yes,
      trader?.no,
      status,
      a.outcome,
      b.outcome,
      a.halted,
      b.halted,
      c.paused,
    ]
      .map((x) => JSON.stringify(x))
      .join(":");
    return {
      slot: response.context.slot,
      paused: c.paused,
      market: m,
      parent: a,
      target: b,
      trader,
      lp,
      liquidity: liquidityMetrics(m, lp, status),
      status,
      fingerprint,
      walletCollateral: walletToken?.amount ?? BigInt(0),
      vaultCollateral: vaultToken.amount,
      withdrawable: claimable(status, trader),
    };
  }
  async function transaction(instructions: TransactionInstruction[]) {
    const lifetime = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: owner, ...lifetime }).add(
      ...instructions,
    );
    return { tx, lifetime };
  }
  async function simulate(tx: Transaction) {
    const result = await connection.simulateTransaction(
      new VersionedTransaction(tx.compileMessage()),
      {
        sigVerify: false,
        commitment: "confirmed",
        minContextSlot: minimumSlot,
      },
    );
    if (result.value.err) {
      const reason =
        result.value.logs?.find((line) => line.includes("Error Message:")) ??
        JSON.stringify(result.value.err);
      throw new Error(`Simulation failed: ${reason}`);
    }
    return result;
  }
  async function send(
    instructions: TransactionInstruction[],
    sign: (tx: Transaction) => Promise<Transaction>,
    progress: (message: string) => void,
    beforeBroadcast?: () => Promise<void>,
  ) {
    await network();
    const { tx, lifetime } = await transaction(instructions);
    await simulate(tx);
    progress("Simulation passed. Confirm in your wallet…");
    const signed = await sign(tx);
    await beforeBroadcast?.();
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    progress(`Confirming ${signature}…`);
    try {
      const result = await connection.confirmTransaction(
        { signature, ...lifetime },
        "confirmed",
      );
      if (result.value.err) throw new Error(JSON.stringify(result.value.err));
      minimumSlot = Math.max(minimumSlot, result.context.slot);
    } catch (error) {
      throw new Error(
        `Transaction ${signature}: confirmation failed or is unknown. Check its status before retrying. ${String(error)}`,
      );
    }
    return signature;
  }
  async function deposit(
    value: string,
    sign: (tx: Transaction) => Promise<Transaction>,
    progress: (message: string) => void,
  ) {
    await api("refresh", { market: market.address });
    const state = await read(),
      amount = parseUnits(value);
    if (state.walletCollateral < amount)
      throw new Error(
        "Insufficient mock collateral. Use Get mock collateral first.",
      );
    const instructions: TransactionInstruction[] = [];
    if (!state.trader)
      instructions.push(
        await program.methods
          .openTrader()
          .accountsStrict({
            owner,
            market: accounts.market,
            trader: accounts.trader,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      );
    instructions.push(
      await program.methods
        .deposit(new BN(amount.toString()))
        .accountsStrict(funds)
        .instruction(),
    );
    return send(instructions, sign, progress);
  }
  async function quote(yes: boolean, buy: boolean, quantity: string) {
    await network();
    await api("refresh", { market: market.address });
    const before = await read();
    if (!before.trader)
      throw new Error("Deposit collateral before requesting a quote.");
    const amount = parseUnits(quantity);
    const { tx } = await transaction([
      await program.methods
        .quote(yes, buy, new BN(amount.toString()))
        .accountsStrict(accounts)
        .instruction(),
    ]);
    const result = await simulate(tx);
    const data = result.value.returnData;
    if (
      !data ||
      data.programId !== PROGRAM_ID.toBase58() ||
      data.data[1] !== "base64"
    )
      throw new Error("Missing authoritative on-chain quote.");
    const bytes = Buffer.from(data.data[0], "base64");
    if (bytes.length !== 8) throw new Error("Incompatible quote return data.");
    const cost = bytes.readBigUInt64LE();
    if (buy && cost > BigInt(before.trader.cash.toString()))
      throw new Error("Insufficient conditional cash for this trade.");
    let probability: number | null = null;
    let fee = "0";
    for (const event of new EventParser(PROGRAM_ID, program.coder).parseLogs(
      result.value.logs ?? [],
    )) {
      if (event.name === "quoteEvent") {
        probability = Number(event.data.yesPriceE18.toString()) / 1e18;
        fee = event.data.fee.toString();
      }
    }
    if ((await read()).fingerprint !== before.fingerprint)
      throw new Error("Market changed during quote. Request a fresh quote.");
    return {
      yes,
      buy,
      amount: amount.toString(),
      cost: cost.toString(),
      fee,
      probability,
      at: Date.now(),
      fingerprint: before.fingerprint,
      owner: owner.toBase58(),
      market: market.address,
    };
  }
  async function trade(
    q: Quote,
    slippageBps: number,
    sign: (tx: Transaction) => Promise<Transaction>,
    progress: (message: string) => void,
  ) {
    if (
      q.owner !== owner.toBase58() ||
      q.market !== market.address ||
      Date.now() - q.at > 30_000
    )
      throw new Error(
        "Quote expired or wallet changed. Request a fresh quote.",
      );
    await api("refresh", { market: market.address });
    if (
      (await read()).fingerprint !== q.fingerprint ||
      Date.now() - q.at > 30_000
    )
      throw new Error("Quote is stale. Request a fresh quote.");
    const limit = executionLimit(BigInt(q.cost), q.buy, slippageBps);
    return send(
      [
        await program.methods
          .trade(q.yes, q.buy, new BN(q.amount), new BN(limit.toString()))
          .accountsStrict(accounts)
          .instruction(),
      ],
      sign,
      progress,
      async () => {
        if (
          Date.now() - q.at > 30_000 ||
          (await read()).fingerprint !== q.fingerprint
        )
          throw new Error(
            "Quote expired or state changed while awaiting the wallet. Request a fresh quote.",
          );
      },
    );
  }
  async function redeem(
    sign: (tx: Transaction) => Promise<Transaction>,
    progress: (message: string) => void,
  ) {
    // Redemptions remain possible during a Gemini outage once finality is already on chain.
    const state = await read();
    if (state.withdrawable <= BigInt(0))
      throw new Error(
        "No withdrawable balance. Conditional gains remain locked until final settlement.",
      );
    return send(
      [await program.methods.redeem().accountsStrict(funds).instruction()],
      sign,
      progress,
    );
  }
  async function liquidity(
    action: "fund" | "withdraw" | "start",
    value: string,
    sign: (tx: Transaction) => Promise<Transaction>,
    progress: (message: string) => void,
  ) {
    const state = await read();
    const instructions: TransactionInstruction[] = [];
    const lpFunds = {
      owner,
      config: accounts.config,
      market: accounts.market,
      parent: accounts.parent,
      target: accounts.target,
      lp: lpAddress,
      mint,
      vault,
      userToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
    if (action === "fund") {
      const amount = parseUnits(value);
      if (!state.liquidity.canFund)
        throw new Error("Funding closes when trading starts.");
      if (amount > state.walletCollateral)
        throw new Error("Insufficient mock collateral.");
      if (!state.lp)
        instructions.push(
          await program.methods
            .openLp()
            .accountsStrict({
              owner,
              market: accounts.market,
              lp: lpAddress,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
        );
      instructions.push(
        await program.methods
          .fundLp(new BN(amount.toString()))
          .accountsStrict(lpFunds)
          .instruction(),
      );
    } else if (action === "withdraw") {
      if (!state.liquidity.canWithdraw)
        throw new Error("LP capital is locked until terminal settlement.");
      const amount = state.liquidity.terminal
        ? state.liquidity.withdrawable
        : parseUnits(value);
      instructions.push(
        await program.methods
          .withdrawLp(new BN(amount.toString()))
          .accountsStrict(lpFunds)
          .instruction(),
      );
    } else {
      instructions.push(
        await program.methods
          .startMarket()
          .accountsStrict({
            config: accounts.config,
            market: accounts.market,
            parent: accounts.parent,
            target: accounts.target,
          })
          .instruction(),
      );
    }
    return send(instructions, sign, progress);
  }
  return { read, network, deposit, quote, trade, redeem, liquidity };
}
export type MarketClient = ReturnType<typeof marketClient>;
export type ChainState = Awaited<ReturnType<MarketClient["read"]>>;
export type Quote = Awaited<ReturnType<MarketClient["quote"]>>;
