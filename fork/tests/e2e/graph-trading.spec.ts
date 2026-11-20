import { test, expect } from "@playwright/test";
import idl from "../../src/lib/contracts/generated/idl.json";
import build from "../../src/lib/contracts/generated/build.json";
import { DEVNET_GENESIS } from "../../src/lib/contracts/generated/network";
import { makeOrigin } from "../../src/lib/domain/verse";
import { mockMarketEvents, openTradeMarket } from "../helpers/trade-market";
import type { MarketDescriptor } from "../../src/lib/contracts/generated/app-types";

const expiry = Math.floor(Date.now() / 1000) + 86400;
const market: MarketDescriptor = {
  address: "fixture-market",
  parent: "fixture-parent",
  target: "fixture-target",
  vault: "fixture-vault",
  bindings: [
    {
      ticker: "OIL",
      instrument: "GEMI-OIL-HI90",
      closeTs: expiry - 600,
      observationTs: expiry,
      termsHash: "a",
    },
    {
      ticker: "COPPER",
      instrument: "GEMI-COPPER-HI5",
      closeTs: expiry - 600,
      observationTs: expiry,
      termsHash: "b",
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/solana/config", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          program: idl.address,
          idlHash: build.idlHash,
          cluster: "devnet",
          rpc: "https://api.devnet.solana.com",
          genesis: DEVNET_GENESIS,
          config: "fixture-config",
          mint: "fixture-mint",
        },
      },
    }),
  );
  await mockMarketEvents(page, market);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "fork-universe-v1",
      JSON.stringify({ state: { engine: "demo" }, version: 1 }),
    );
  });
});

test("opening an existing market selects its exact graph world without bot controls", async ({
  page,
}) => {
  await page.route("**/api/solana/markets", (route) =>
    route.fulfill({ json: { ok: true, data: [market] } }),
  );
  await page.goto("/");
  await page.getByTestId("example-demo-btc-150k-2027").click();
  await openTradeMarket(page);
  await expect(page.getByTestId("graph-market-context")).toContainText(
    "Fixture condition · YES",
  );
  await expect(page.getByTestId("graph-market-context")).toContainText(
    "Fixture target",
  );
  await expect(
    page.getByText("Connect your wallet to deposit and trade on devnet."),
  ).toBeVisible();
  const state = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fork-universe-v1")!).state,
  );
  expect(state.target.eventId).toBe("gemini:COPPER");
  expect(state.verses[state.currentVerseId].newAssumptions[0]).toMatchObject({
    eventId: "gemini:OIL",
    selectedOutcome: "YES",
  });
  await expect(page.getByTestId("strategy-bot")).toHaveCount(0);
  await expect(page.getByTestId("if-then-buy")).toHaveCount(0);
  await expect(page.getByTestId("open-rules")).toHaveCount(0);
  await page.screenshot({ path: "test-results/graph-trade-desktop.png" });
});

test("build reviews the exact graph pair before creating a standard market", async ({
  page,
}) => {
  let created = false;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/solana/markets", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      created = true;
      await route.fulfill({ json: { ok: true, data: market } });
    } else
      await route.fulfill({
        json: { ok: true, data: created ? [market] : [] },
      });
  });
  for (const binding of market.bindings) {
    await page.route(
      `**/api/solana/instrument?ticker=${binding.ticker}&*`,
      (route) =>
        route.fulfill({
          json: {
            ok: true,
            data: {
              ...binding,
              title: binding.ticker,
              label: "YES",
              status: "active",
              expiry: new Date(expiry * 1000).toISOString(),
              rulesUrl: "https://example.com/rules",
              description: "Fixture resolution criteria",
            },
          },
        }),
    );
  }
  const events = Object.fromEntries(
    market.bindings.map((b, i) => [
      `gemini:${b.ticker}`,
      {
        id: `gemini:${b.ticker}`,
        title: i ? "Fixture target" : "Fixture condition",
        source: "gemini",
        externalMarketId: b.ticker,
        eventType: "binary",
        possibleOutcomes: ["YES", "NO"],
        category: "other",
        metadata: { instrumentSymbols: { YES: b.instrument } },
      },
    ]),
  );
  const origin = makeOrigin();
  await page.addInitScript(
    ({ events, origin }) => {
      localStorage.setItem(
        "fork-universe-v1",
        JSON.stringify({
          state: {
            started: true,
            engine: "demo",
            events,
            target: { eventId: "gemini:COPPER", outcome: "YES" },
            currentVerseId: "world",
            verses: {
              origin,
              world: {
                ...origin,
                id: "world",
                name: "Oil up",
                parentId: "origin",
                depth: 1,
                newAssumptions: [
                  {
                    eventId: "gemini:OIL",
                    selectedOutcome: "YES",
                    addedAtVerseId: "world",
                    sourceReference: "OIL",
                  },
                ],
              },
            },
          },
          version: 1,
        }),
      );
    },
    { events, origin },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Trade markets" }).click();
  await page.getByRole("button", { name: "Build this market" }).click();
  await expect(
    page.getByRole("button", { name: "Create market", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Reviewed A rules").check();
  await page.getByLabel("Reviewed B rules").check();
  await page
    .getByRole("button", { name: "Create market", exact: true })
    .click();
  await expect(
    page.getByText("Connect your wallet to deposit and trade on devnet."),
  ).toBeVisible();
  expect(submitted).toMatchObject({
    communityFunding: false,
    parent: { instrument: "GEMI-OIL-HI90", reviewed: true },
    target: { instrument: "GEMI-COPPER-HI5", reviewed: true },
  });
});

test("mobile Trade shortcut opens the panel and demo events cannot be traded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/solana/markets", (route) =>
    route.fulfill({ json: { ok: true, data: [] } }),
  );
  await page.goto("/");
  await page.getByTestId("example-demo-btc-150k-2027").click();
  await page.getByRole("button", { name: "Trade markets" }).click();
  await expect(page.getByTestId("market-unavailable")).toContainText(
    "Demo and custom events",
  );
  await expect(
    page.getByRole("button", { name: "Build this market" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "test-results/graph-trade-mobile.png" });
});
