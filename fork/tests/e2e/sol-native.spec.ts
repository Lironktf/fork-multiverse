import { test, expect } from "@playwright/test";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  getOrCreateAssociatedTokenAccount,
  createSyncNativeInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { installLocalWallet } from "../helpers/local-wallet";
import { openTradeMarket } from "../helpers/trade-market";
import type {
  AppConfig,
  MarketDescriptor,
} from "../../src/lib/contracts/generated/app-types";

test("SOL wallet deposits atomically, buys and sells without minting or touching existing WSOL", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_NATIVE_SOL !== "1",
    "Requires the dedicated local SOL service.",
  );
  test.setTimeout(180000);
  const config = (await (await request.get("/api/sol/config")).json())
    .data as AppConfig;
  expect(config.cluster).toBe("localnet");
  expect(config.mint).toBe(NATIVE_MINT.toBase58());
  const c = new Connection(config.rpc, "confirmed");
  const market = (await (await request.get("/api/sol/markets")).json())
    .data[0] as MarketDescriptor;
  const wallet = await installLocalWallet(page),
    signer = wallet.signers[0];
  await c.confirmTransaction(
    await c.requestAirdrop(signer.publicKey, 1_000_000_000),
    "confirmed",
  );
  const ata = await getOrCreateAssociatedTokenAccount(
    c,
    signer,
    NATIVE_MINT,
    signer.publicKey,
  );
  const life = await c.getLatestBlockhash();
  const tx = new Transaction({ feePayer: signer.publicKey, ...life }).add(
    SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: ata.address,
      lamports: 3_000_000,
    }),
    createSyncNativeInstruction(ata.address),
  );
  tx.sign(signer);
  const sig = await c.sendRawTransaction(tx.serialize());
  await c.confirmTransaction({ signature: sig, ...life }, "confirmed");
  const before = (await c.getAccountInfo(new PublicKey(market.vault)))!
    .lamports;
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "fork-universe-v1",
      JSON.stringify({ state: { engine: "demo" }, version: 1 }),
    );
  });
  await page.goto("/");
  await page.getByTestId("example-demo-btc-150k-2027").click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fork verification wallet", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await openTradeMarket(page, market.address);
  const trading = page.getByTestId("trading");
  await expect(trading).toContainText("Open for trading");
  await expect(trading).not.toContainText(/USDC|mock collateral/i);
  await trading.getByLabel("Deposit amount").fill("0.1");
  wallet.reject();
  await trading
    .getByRole("button", { name: "Deposit SOL", exact: true })
    .click();
  await expect(trading.getByRole("alert")).toContainText("rejected");
  expect((await c.getAccountInfo(new PublicKey(market.vault)))!.lamports).toBe(
    before,
  );
  await trading
    .getByRole("button", { name: "Deposit SOL", exact: true })
    .click();
  await expect(trading.getByTestId("balance-principal")).toHaveText(
    "0.100000000",
    { timeout: 30000 },
  );
  expect((await c.getAccountInfo(new PublicKey(market.vault)))!.lamports).toBe(
    before + 100_000_000,
  );
  await trading.getByLabel("Trade shares").fill("0.02");
  await trading
    .getByRole("button", { name: "Review trade", exact: true })
    .click();
  await expect(trading.getByTestId("chain-quote")).toContainText("SOL", {
    timeout: 30000,
  });
  await trading.getByRole("button", { name: "Confirm buy YES" }).click();
  await expect(trading.getByTestId("balance-yes")).toHaveText("0.020000000", {
    timeout: 30000,
  });
  await trading.getByLabel("Trade direction").selectOption("sell");
  await trading.getByLabel("Trade shares").fill("0.01");
  await trading
    .getByRole("button", { name: "Review trade", exact: true })
    .click();
  await expect(trading.getByTestId("chain-quote")).toBeVisible({
    timeout: 30000,
  });
  await trading.getByRole("button", { name: "Confirm sell YES" }).click();
  await expect(trading.getByTestId("balance-yes")).toHaveText("0.010000000", {
    timeout: 30000,
  });
  expect((await c.getAccountInfo(new PublicKey(market.vault)))!.lamports).toBe(
    before + 100_000_000,
  );
  expect((await getAccount(c, ata.address)).amount).toBe(3_000_000n);
  expect(
    (
      await c.getTokenAccountsByOwner(signer.publicKey, {
        programId: TOKEN_PROGRAM_ID,
      })
    ).value,
  ).toHaveLength(1);
  await expect(trading.getByRole("button", { name: /^Withdraw / })).toHaveCount(
    0,
  );
  await page.screenshot({ path: "test-results/sol-native-trading.png" });
});
