import { expect, test } from "@playwright/test";
import { normalizeEvent } from "../../src/lib/domain/gemini-normalize";

const markets = [
  normalizeEvent({ id: "btc", ticker: "BTC", title: "Bitcoin reaches $150,000", type: "binary", category: "Crypto", status: "active" }, Date.now()),
  normalizeEvent({ id: "vol", ticker: "VOL", title: "BTC volatility this month", type: "binary", category: "Crypto", status: "active",
    contracts: [{ id: "vol-yes", label: "BTC volatility", prices: { lastTradePrice: "0.4" } }] }, Date.now()),
  normalizeEvent({ id: "tech", ticker: "TECH", title: "Technology stock volatility", type: "binary", category: "Tech", status: "active",
    contracts: [{ id: "tech-yes", label: "Technology stock volatility", prices: { lastTradePrice: "0.3" } }] }, Date.now()),
];

test("a focused outcome on the last market can fork the existing chain directly into Verse", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const obsoleteRequests: string[] = [];
  await page.route("**/api/atlas", (route) => {
    obsoleteRequests.push(route.request().method());
    return route.fulfill({ status: 404, body: "<html>Not Found</html>" });
  });
  await page.route("**/api/events?*", (route) => route.fulfill({ json: { ok: true, events: markets } }));
  await page.route("**/api/forecast", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, forecast: {
      id: body.forecastId, verseId: body.verseId, targetEventId: body.target.id, targetOutcome: body.targetOutcome,
      status: "complete", kind: "MODEL", engine: "claude-cli", modelOutputs: [], sources: [], assumptions: [],
      ensembleProbability: 0.42, disagreementSummary: null, baselineProbability: 0.7, baselineKind: "MARKET",
      baselineLabel: "Gemini last trade", aggregation: "Test estimate", generatedAt: new Date().toISOString(),
    } } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Atlas" }).click();
  const universe = page.getByRole("region", { name: "Gemini market universe" });
  await universe.getByRole("button", { name: "Crypto", exact: true }).click();
  const map = page.getByRole("region", { name: "Gemini market chain" });
  await expect(page.getByRole("button", { name: "Fork Reality" })).toBeEnabled();
  await expect(map.getByRole("button", { name: /BTC volatility/ })).toBeVisible();
  await map.getByRole("button", { name: /BTC volatility/ }).click();
  await map.getByRole("button", { name: /Technology stock volatility/ }).click();
  await page.getByLabel("Outcome for Technology stock volatility").selectOption("NO");
  await expect(page.getByRole("button", { name: "Fork Reality" })).toBeEnabled();

  const request = page.waitForRequest((req) => req.url().endsWith("/api/forecast") && req.postDataJSON().scenario.length === 1);
  await page.getByRole("button", { name: "Fork Reality" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    target: { id: "gemini:VOL" },
    targetOutcome: "YES",
    scenario: [{ event: { id: "gemini:TECH" }, outcome: "NO" }],
    engine: "auto",
  });
  expect(obsoleteRequests).toEqual([]);
  await expect(map).toBeHidden();
  await expect(page.getByTestId("verse-name-input")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("probability-display")).toContainText("42%");
});

test("a market route returning HTML provides an actionable error and retry", async ({ page }) => {
  await page.route("**/api/events?*", (route) => route.fulfill({ status: 404, body: "<html>Not Found</html>" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Atlas" }).click();
  const universe = page.getByRole("region", { name: "Gemini market universe" });
  await expect(universe.getByRole("alert")).toContainText("Gemini markets are temporarily unavailable.");
  await expect(universe.getByRole("button", { name: "Retry" })).toBeVisible();
});
