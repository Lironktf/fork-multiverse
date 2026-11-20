import { expect, type Page } from "@playwright/test";
import type { MarketDescriptor } from "../../src/lib/contracts/generated/app-types";

/** Synthetic settlement tests supply explicit source metadata, never live oracle reports. */
export async function mockMarketEvents(page: Page, market: MarketDescriptor) {
  for (const [index, binding] of market.bindings.entries()) {
    await page.route(`**/api/events/${binding.ticker}`, (route) =>
      route.fulfill({
        json: {
          ok: true,
          event: {
            id: `gemini:${binding.ticker}`,
            title: index ? "Fixture target" : "Fixture condition",
            description: "Synthetic test metadata",
            category: "other",
            source: "gemini",
            externalMarketId: binding.ticker,
            eventType: "binary",
            possibleOutcomes: ["YES", "NO"],
            resolutionCriteria: "Fixture only",
            resolutionDate: new Date(
              binding.observationTs * 1000,
            ).toISOString(),
            metadata: { instrumentSymbols: { YES: binding.instrument } },
          },
        },
      }),
    );
  }
}
export async function openTradeMarket(page: Page, address?: string) {
  await page
    .getByRole("button", { name: "Trade markets", exact: true })
    .click();
  const market = address
    ? page.locator(`[data-market="${address}"]`)
    : page.getByTestId("open-graph-market").first();
  await expect(market).toBeAttached();
  if ((await market.textContent())?.includes("Selected in graph")) return;
  await expect(market).toBeEnabled({ timeout: 30000 });
  await market.click();
}
