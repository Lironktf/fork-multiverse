import { test, expect, type Page } from "@playwright/test";
import idl from "../../src/lib/contracts/generated/idl.json";
import build from "../../src/lib/contracts/generated/build.json";
import { DEVNET_GENESIS } from "../../src/lib/contracts/generated/network";

/**
 * Two services share the program: mock-USDC "If this happens, buy" rules (/api/solana)
 * and the native-SOL Trade tab (/api/sol). Neither may hide or replace the other.
 */
const rule = {
  id: "r1",
  market: "m1",
  trigger: {
    kind: "contract",
    ticker: "ETH",
    instrument: "GEMI-ETH-HI",
    op: ">=",
    value: 0.45,
  },
  action: { side: "yes", shares: 6, maxCost: 5 },
  status: "armed",
  createdAt: new Date().toISOString(),
  executor: "Exec111111111111111111111111111111111111111",
  labels: {
    condition: "ETH above $1,750 → YES",
    target: "BTC above $62,500 → YES",
  },
  last: { value: 0.41, source: "fixture", at: new Date().toISOString() },
};

async function setup(page: Page, sol: boolean) {
  await page.route("**/api/solana/rules", (r) =>
    r.fulfill({
      json: { ok: true, data: { executor: rule.executor, rules: [rule] } },
    }),
  );
  await page.route("**/api/sol/config", (r) =>
    sol
      ? r.fulfill({
          json: {
            ok: true,
            data: {
              program: idl.address,
              idlHash: build.idlHash,
              cluster: "devnet",
              rpc: "https://api.devnet.solana.com",
              genesis: DEVNET_GENESIS,
              config: "fixture-config",
              mint: "So11111111111111111111111111111111111111112",
            },
          },
        })
      : r.fulfill({
          status: 503,
          json: { ok: false, code: "not_configured", error: "off" },
        }),
  );
  await page.route("**/api/sol/markets", (r) =>
    r.fulfill({ json: { ok: true, data: [] } }),
  );
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "fork-universe-v1",
      JSON.stringify({ state: { engine: "demo" }, version: 1 }),
    );
  });
  const probe = page.waitForResponse("**/api/sol/config");
  await page.goto("/");
  await page.getByTestId("example-demo-btc-150k-2027").click();
  return probe;
}

test("if-then buys and the SOL Trade tab coexist", async ({ page }) => {
  await setup(page, true);
  // top bar: open if-then rules (⚡ with badge) and the Trade button
  await expect(page.getByTestId("open-rules")).toBeVisible();
  await expect(page.getByTestId("open-rules")).toHaveAccessibleName(
    "Auto-buys: 1 open",
  );
  await expect(
    page.getByRole("button", { name: "Trade markets", exact: true }),
  ).toBeVisible();
  // Forecast tab keeps the "If this happens, buy" card
  await expect(page.getByRole("tab", { name: "Forecast" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("if-then-buy")).toBeVisible();
  await page.getByTestId("open-rules").click();
  await expect(page.getByTestId("open-rule")).toContainText("ETH above $1,750");
  await page.keyboard.press("Escape");
  // Trade tab shows the SOL trading panel; switching back restores the card
  await page.getByRole("tab", { name: "Trade" }).click();
  await expect(page.getByTestId("positions")).toBeVisible();
  await expect(page.getByTestId("if-then-buy")).toHaveCount(0);
  await page.getByRole("tab", { name: "Forecast" }).click();
  await expect(page.getByTestId("if-then-buy")).toBeVisible();
});

test("without a SOL service the app looks exactly as before: no Trade tab, if-then intact", async ({
  page,
}) => {
  const probe = await setup(page, false);
  await expect(page.getByTestId("open-rules")).toBeVisible();
  await expect(page.getByTestId("if-then-buy")).toBeVisible();
  // let the SOL probe settle, then confirm nothing trade-related is shown
  await probe;
  await expect(
    page.getByRole("button", { name: "Trade markets", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "World view" })).toHaveCount(
    0,
  );
});
