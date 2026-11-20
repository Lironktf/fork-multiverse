import { test, expect } from "@playwright/test";
import { installLocalWallet } from "../helpers/local-wallet";
import { openTradeMarket } from "../helpers/trade-market";

test("real devnet market opens in graph and reads wallet balances without sending", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_DEVNET_READ !== "1",
    "Requires the running devnet service; read-only.",
  );
  test.setTimeout(90000);
  await installLocalWallet(page);
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
  await openTradeMarket(page);
  const trading = page.getByTestId("trading");
  await expect(trading).toContainText("Open for trading", { timeout: 30000 });
  await expect(trading.getByTestId("balance-wallet-collateral")).toHaveText(
    "0.000000000",
  );
  await expect(
    trading.getByRole("link", { name: "Get devnet SOL", exact: true }),
  ).toBeVisible();
  await expect(
    trading.getByRole("button", { name: "Review trade", exact: true }),
  ).toHaveCount(0);
  await expect(trading.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: "test-results/devnet-graph-wallet.png" });
});
