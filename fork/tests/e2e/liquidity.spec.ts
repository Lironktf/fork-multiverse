import { test, expect } from "@playwright/test";
import { BN, Program } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { createHash, randomUUID } from "node:crypto";
import { installLocalWallet } from "../helpers/local-wallet";
import { formatUnits } from "../../src/lib/contracts/amounts";
import idl from "../../src/lib/contracts/generated/idl.json";
import type { ForkContracts } from "../../src/lib/contracts/generated/fork_contracts";
import type {
  AppConfig,
  MarketDescriptor,
} from "../../src/lib/contracts/generated/app-types";

test("wallet funds, exits Funding, trades with fees and claims loss-making LP equity", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_SOLANA_FIXTURES !== "1",
    "Requires real local validator and local service",
  );
  test.setTimeout(240_000);
  const original = (await (await request.get("/api/solana/config")).json())
    .data as AppConfig;
  const connection = new Connection(original.rpc, "confirmed");
  const program = new Program<ForkContracts>(idl as ForkContracts, {
    connection,
  });
  const wallet = await installLocalWallet(page),
    admin = Keypair.generate();
  const pda = (...seeds: (string | PublicKey | Buffer)[]) =>
    PublicKey.findProgramAddressSync(
      seeds.map((s) =>
        typeof s === "string"
          ? Buffer.from(s)
          : s instanceof PublicKey
            ? s.toBuffer()
            : s,
      ),
      program.programId,
    )[0];
  const unit = (value: number) => new BN(value * 1_000_000);
  async function send(ix: TransactionInstruction) {
    const lifetime = await connection.getLatestBlockhash();
    const tx = new Transaction({ feePayer: admin.publicKey, ...lifetime }).add(
      ix,
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
        data: Buffer.from(randomUUID()),
      }),
    );
    tx.sign(admin);
    expect((await connection.simulateTransaction(tx)).value.err).toBeNull();
    const signature = await connection.sendRawTransaction(tx.serialize());
    expect(
      (
        await connection.confirmTransaction(
          { signature, ...lifetime },
          "confirmed",
        )
      ).value.err,
    ).toBeNull();
  }
  for (const key of [
    admin.publicKey,
    ...wallet.signers.map((s) => s.publicKey),
  ]) {
    const sig = await connection.requestAirdrop(key, 2_000_000_000);
    await connection.confirmTransaction(sig, "confirmed");
  }
  const mint = await createMint(connection, admin, admin.publicKey, null, 6),
    config = pda("config", admin.publicKey);
  await send(
    await program.methods
      .initializeConfig(
        admin.publicKey,
        admin.publicKey,
        unit(1000),
        unit(1_000_000),
      )
      .accountsStrict({
        admin: admin.publicKey,
        config,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  );
  await send(
    await program.methods
      .setFee(100)
      .accountsStrict({ authority: admin.publicKey, config })
      .instruction(),
  );
  const now = (await connection.getBlockTime(await connection.getSlot()))!;
  const bindings = ["A", "B"].map((role) => ({
    ticker: `LP-${role}`,
    instrument: `FIXTURE-${role}`,
    termsHash: createHash("sha256")
      .update("synthetic LP fixture")
      .digest("hex"),
    closeTs: now + 150,
    observationTs: now + 150,
  }));
  const hashes = bindings.map((b) =>
    createHash("sha256").update(`${b.ticker}\0${b.instrument}`).digest(),
  );
  const [parent, target] = hashes.map((h) => pda("event", config, h));
  for (const [i, event] of [parent, target].entries()) {
    const b = bindings[i];
    await send(
      await program.methods
        .registerEvent(
          [...hashes[i]],
          b.ticker,
          b.instrument,
          [...Buffer.from(b.termsHash, "hex")],
          new BN(b.closeTs),
          new BN(b.observationTs),
        )
        .accountsStrict({
          admin: admin.publicKey,
          config,
          event,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
  }
  const market = pda("market", config, parent, target),
    vault = pda("vault", market),
    lp = pda("lp", market, admin.publicKey);
  const common = { config, market, parent, target };
  await send(
    await program.methods
      .createMarketForBudget(unit(80), new BN(0))
      .accountsStrict({
        admin: admin.publicKey,
        ...common,
        mint,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  );
  const tokens: PublicKey[] = [];
  for (const owner of [
    admin.publicKey,
    ...wallet.signers.map((s) => s.publicKey),
  ]) {
    const token = (
      await getOrCreateAssociatedTokenAccount(connection, admin, mint, owner)
    ).address;
    await mintTo(connection, admin, mint, token, admin, 1_000_000_000n);
    tokens.push(token);
  }
  await send(
    await program.methods
      .openLp()
      .accountsStrict({
        owner: admin.publicKey,
        market,
        lp,
        systemProgram: SystemProgram.programId,
      })
      .instruction(),
  );
  await send(
    await program.methods
      .fundLp(unit(60))
      .accountsStrict({
        owner: admin.publicKey,
        ...common,
        lp,
        mint,
        vault,
        userToken: tokens[0],
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  );
  const fixtureConfig = {
    ...original,
    config: config.toBase58(),
    mint: mint.toBase58(),
  };
  const descriptor: MarketDescriptor = {
    address: market.toBase58(),
    parent: parent.toBase58(),
    target: target.toBase58(),
    vault: vault.toBase58(),
    bindings: bindings as MarketDescriptor["bindings"],
  };
  await page.route("**/api/solana/config", (r) =>
    r.fulfill({ json: { ok: true, data: fixtureConfig } }),
  );
  await page.route("**/api/solana/markets", (r) =>
    r.fulfill({ json: { ok: true, data: [descriptor] } }),
  );
  await page.route("**/api/solana/refresh", (r) =>
    r.fulfill({ json: { ok: true, data: {} } }),
  );
  await page.addInitScript(
    ({ genesis, address }) => {
      localStorage.clear();
      localStorage.setItem(
        "fork-universe-v1",
        JSON.stringify({ state: { engine: "demo" }, version: 1 }),
      );
      localStorage.setItem(`fork-market:${genesis}`, address);
    },
    { genesis: original.genesis, address: market.toBase58() },
  );
  await page.goto("/");
  await page.getByTestId("example-demo-btc-150k-2027").click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fork verification wallet", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByTestId("positions")
    .getByRole("button", { name: "FORK Positions" })
    .click();
  const trading = page.getByTestId("trading"),
    liquidity = page.getByTestId("liquidity");
  await liquidity.locator("summary").click();
  await expect(liquidity).toContainText("1.00%");
  await trading.getByLabel("LP amount").fill("20");
  wallet.reject();
  await liquidity
    .getByRole("button", { name: "Fund liquidity", exact: true })
    .click();
  await expect(trading.getByRole("alert")).toContainText("rejected");
  await liquidity
    .getByRole("button", { name: "Fund liquidity", exact: true })
    .click();
  await expect(liquidity.getByTestId("lp-Your contribution")).toHaveText(
    "20.000000",
  );
  await trading.getByLabel("LP amount").fill("5");
  await liquidity.getByRole("button", { name: "Withdraw LP funding" }).click();
  await expect(liquidity.getByTestId("lp-Your contribution")).toHaveText(
    "15.000000",
  );
  await expect(
    liquidity.getByRole("button", { name: "Start funded market" }),
  ).toBeDisabled();
  await liquidity
    .getByRole("button", { name: "Fund liquidity", exact: true })
    .click();
  await expect(liquidity.getByTestId("lp-Your contribution")).toHaveText(
    "20.000000",
  );
  await liquidity.getByRole("button", { name: "Start funded market" }).click();
  await expect(trading).toContainText("pending");
  await expect(
    liquidity.getByRole("button", { name: "Withdraw LP funding" }),
  ).toBeDisabled();
  await wallet.switchAccount(1);
  await trading.getByLabel("Deposit amount").fill("1000");
  await trading.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(trading.getByTestId("balance-principal")).toHaveText(
    "1000.000000",
  );
  await trading.getByLabel("Trade shares").fill("900");
  await trading.getByRole("button", { name: "Request on-chain quote" }).click();
  await expect(trading.getByTestId("chain-quote")).toContainText(
    "Includes LP fee:",
  );
  await trading.getByRole("button", { name: "Confirm buy YES" }).click();
  await expect(trading.getByTestId("balance-yes")).toHaveText("900.000000");
  while (
    (await connection.getBlockTime(await connection.getSlot()))! <
    now + 150
  )
    await new Promise((r) => setTimeout(r, 500));
  for (const [i, event] of [parent, target].entries())
    await send(
      await program.methods
        .report(
          [...hashes[i]],
          [...Buffer.from(bindings[i].termsHash, "hex")],
          { yes: {} },
          new BN(now + 150),
        )
        .accountsStrict({ reporter: admin.publicKey, config, event })
        .instruction(),
    );
  await send(
    await program.methods.syncMarket().accountsStrict(common).instruction(),
  );
  const final = await program.account.market.fetch(market),
    expected = final.lpPool.div(new BN(4));
  expect(final.feesAccrued.gt(new BN(0))).toBe(true);
  expect(expected.lt(unit(20))).toBe(true);
  await wallet.switchAccount(0);
  await liquidity.locator("summary").click();
  await expect(liquidity.getByTestId("lp-LP withdrawable")).toHaveText(
    formatUnits(expected),
  );
  await liquidity.getByRole("button", { name: "Claim LP equity" }).click();
  await expect(liquidity).toContainText("LP claim paid.");
  await expect(
    liquidity.getByRole("button", { name: "Claim LP equity" }),
  ).toBeDisabled();
  expect((await getAccount(connection, tokens[1])).amount).toBe(
    980_000_000n + BigInt(expected.toString()),
  );
});
