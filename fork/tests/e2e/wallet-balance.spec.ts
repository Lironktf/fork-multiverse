import { openTradeMarket } from "../helpers/trade-market";
import { test, expect } from "@playwright/test";
import { Connection } from "@solana/web3.js";
import { installLocalWallet } from "../helpers/local-wallet";
import type {
  AppConfig,
  MarketDescriptor,
} from "../../src/lib/contracts/generated/app-types";

test("wallet popover follows confirmed local SOL funding without reconnecting", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_SOLANA_E2E !== "1",
    "Requires the local mock service and an existing conditional market.",
  );
  const config = (await (await request.get("/api/solana/config")).json())
    .data as AppConfig;
  const markets = (await (await request.get("/api/solana/markets")).json())
    .data as MarketDescriptor[];
  expect(markets.length).toBeGreaterThan(0);
  const wallet = await installLocalWallet(page);
  await page.addInitScript(
    ({ genesis, market }) => {
      localStorage.clear();
      localStorage.setItem(
        "fork-universe-v1",
        JSON.stringify({ state: { engine: "demo" }, version: 1 }),
      );
      localStorage.setItem(`fork-market:${genesis}`, market);
    },
    { genesis: config.genesis, market: markets[0].address },
  );
  await page.goto("/");
  await page.getByTestId("example-demo-btc-150k-2027").click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fork verification wallet", exact: true })
    .click();
  await expect(page.getByText("0.000 SOL", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await openTradeMarket(page);
  await page.getByRole("button", { name: "Get test USDC + SOL" }).click();
  await expect(page.getByTestId("balance-wallet-collateral")).toHaveText(
    "1000.000000",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /^Wallet / }).click();
  await expect(page.getByText("1.000 SOL", { exact: true })).toBeVisible();
  expect(
    await new Connection(config.rpc, "confirmed").getBalance(
      wallet.signers[0].publicKey,
    ),
  ).toBe(1_000_000_000);
});
