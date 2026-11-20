import { openTradeMarket } from "../helpers/trade-market";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { installLocalWallet } from "../helpers/local-wallet";
import type {
  AppConfig,
  MarketDescriptor,
} from "../../src/lib/contracts/generated/app-types";
import { DEVNET_GENESIS } from "../../src/lib/contracts/generated/network";

test("devnet wallet deposits, buys, sells through the graph-linked Trade tab", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_DEVNET_WALLET !== "1",
    "Explicit opt-in to public devnet transactions required",
  );
  test.setTimeout(300_000);
  const configResponse = await request.get("/api/solana/config");
  expect(configResponse.ok()).toBeTruthy();
  const config = (await configResponse.json()).data as AppConfig;
  expect(config.cluster).toBe("devnet");
  expect(config.genesis).toBe(DEVNET_GENESIS);
  const connection = new Connection(config.rpc, "confirmed");
  expect(await connection.getGenesisHash()).toBe(DEVNET_GENESIS);
  const markets = (await (await request.get("/api/solana/markets")).json())
    .data as MarketDescriptor[];
  const market =
    markets.find((m) => m.address === process.env.DEVNET_MARKET) ?? markets[0];
  expect(
    market,
    "Create a reviewed, funded live market before running this test",
  ).toBeTruthy();
  if (!process.env.SIGNER_PATH)
    throw new Error("SIGNER_PATH is required for the test fee payer");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(process.env.SIGNER_PATH, "utf8"))),
  );
  const wallet = await installLocalWallet(page);
  const owner = wallet.signers[0]!.publicKey;
  const lifetime = await connection.getLatestBlockhash();
  const funding = new Transaction({
    feePayer: payer.publicKey,
    ...lifetime,
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: owner,
      lamports: 30_000_000,
    }),
  );
  funding.sign(payer);
  expect((await connection.simulateTransaction(funding)).value.err).toBeNull();
  const fundingSignature = await connection.sendRawTransaction(
    funding.serialize(),
  );
  expect(
    (
      await connection.confirmTransaction(
        { signature: fundingSignature, ...lifetime },
        "confirmed",
      )
    ).value.err,
  ).toBeNull();
  const faucet = await request.post("/api/solana/faucet", {
    data: { owner: owner.toBase58() },
  });
  expect(faucet.ok(), await faucet.text()).toBeTruthy();
  await page.addInitScript(
    ({ genesis, address }) => {
      localStorage.clear();
      localStorage.setItem(
        "fork-universe-v1",
        JSON.stringify({ state: { engine: "demo" }, version: 1 }),
      );
      localStorage.setItem(`fork-market:${genesis}`, address);
    },
    { genesis: config.genesis, address: market!.address },
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
  await openTradeMarket(page);
  const trading = page.getByTestId("trading");
  await expect(trading).toContainText("devnet", { timeout: 30_000 });
  await trading.getByLabel("Deposit amount").fill("100");
  wallet.reject();
  await trading.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(trading.getByRole("alert")).toContainText("rejected", {
    timeout: 45_000,
  });
  await trading.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(trading.locator("a[data-signature]")).toHaveCount(1, {
    timeout: 60_000,
  });
  await trading.getByLabel("Trade shares").fill("2");
  await trading.getByRole("button", { name: "Review trade" }).click();
  await expect(trading.getByTestId("chain-quote")).toContainText(
    "Includes LP fee",
    { timeout: 45_000 },
  );
  await trading.getByRole("button", { name: "Confirm buy YES" }).click();
  await expect(trading.locator("a[data-signature]")).toHaveCount(2, {
    timeout: 60_000,
  });
  await trading.getByLabel("Trade direction").selectOption("sell");
  await trading.getByLabel("Trade shares").fill("1");
  await trading.getByRole("button", { name: "Review trade" }).click();
  await expect(trading.getByTestId("chain-quote")).toBeVisible({
    timeout: 45_000,
  });
  await trading.getByRole("button", { name: "Confirm sell YES" }).click();
  await expect(trading.locator("a[data-signature]")).toHaveCount(3, {
    timeout: 60_000,
  });
  await expect(
    trading.getByRole("button", { name: /^Withdraw (refund|balance)$/ }),
  ).toHaveCount(0);
  await expect(page.getByTestId("strategy-bot")).toHaveCount(0);
  const signatures = await trading
    .locator("a[data-signature]")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-signature")!),
    );
  const statuses = await connection.getSignatureStatuses(signatures, {
    searchTransactionHistory: true,
  });
  for (const status of statuses.value) {
    expect(status).not.toBeNull();
    expect(status!.err).toBeNull();
    expect(["confirmed", "finalized"]).toContain(status!.confirmationStatus);
  }
  console.log(
    JSON.stringify({
      cluster: "devnet",
      market: market!.address,
      owner: owner.toBase58(),
      fundingSignature,
      signatures,
    }),
  );
  await page.screenshot({
    path: "test-results/devnet-app.png",
    fullPage: true,
  });
});
