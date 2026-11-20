import { test, expect, type Page } from "@playwright/test";

/**
 * Full demonstration journey in DEMO engine mode (no credentials).
 * Numbers in comments map to the spec's testing checklist (§33).
 */

const errors: string[] = [];

async function boot(page: Page, opts: { fresh?: boolean } = {}) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon|WalletNotReady/i.test(m.text())) errors.push(m.text());
  });
  if (opts.fresh !== false) {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("fork-test-init")) {
        localStorage.clear();
        localStorage.setItem("fork-universe-v1", JSON.stringify({ state: { engine: "demo" }, version: 1 }));
        sessionStorage.setItem("fork-test-init", "1");
      }
    });
  }
  await page.goto("/");
}

async function addByClick(page: Page, query: string) {
  await page.fill('[data-testid="discovery-search"]', query);
  const row = page.locator('[data-testid="discovery"] [data-event]').filter({ hasText: query }).first();
  await row.locator('[data-testid="add-to-basket"]').click();
  await page.fill('[data-testid="discovery-search"]', "");
}

async function forkAndName(page: Page, name: string) {
  await page.click('[data-testid="fork-reality"]');
  const input = page.locator('[data-testid="verse-name-input"]');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(name);
  await input.press("Enter");
  await expect(page.locator('[data-testid="current-verse-name"]')).toHaveText(name);
}

test.describe.configure({ mode: "serial" });

test("1–2 · loads, welcome renders, target search finds events", async ({ page }) => {
  await boot(page);
  await expect(page.getByRole("heading", { name: "Every future begins with a question." })).toBeVisible();
  await page.click('[data-testid="welcome-search"]');
  await page.getByLabel("Search targets").fill("ethereum");
  await expect(page.locator('#target-list [data-event="demo-eth-8k-2027"]')).toBeVisible();
  await page.locator('#target-list [data-event="demo-eth-8k-2027"]').click();
  await expect(page.locator('[data-testid="target-selector"]')).toContainText("Ethereum above $8,000");
});

test("3–18 · basket, fork, name, branch, navigate, reload, inspect, compare, switch target", async ({ page }) => {
  await boot(page);
  await page.click('[data-testid="example-demo-btc-150k-2027"]');
  await expect(page.locator('[data-testid="basket"]')).toBeVisible();

  // 5 · click-to-add
  await addByClick(page, "Federal Reserve cuts rates");
  await addByClick(page, "Major new crypto ETF");
  await expect(page.locator('[data-testid="basket-item"]')).toHaveCount(2);

  // 4 · drag from discovery into the basket
  await page.fill('[data-testid="discovery-search"]', "United States enters recession");
  const row = page.locator('[data-testid="discovery"] [data-event="demo-us-recession"]');
  // live Gemini results load asynchronously above the library row; wait until it stops moving
  let from = (await row.boundingBox())!;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const next = (await row.boundingBox())!;
    if (next.y === from.y) break;
    from = next;
  }
  const to = (await page.locator('[data-testid="basket"]').boundingBox())!;
  await page.mouse.move(from.x + 40, from.y + 15);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(from.x + 40 + ((to.x + to.width / 2 - from.x - 40) * i) / 20, from.y + 15 + ((to.y + 80 - from.y - 15) * i) / 20);
  await page.mouse.up();
  await expect(page.locator('[data-testid="basket-item"]')).toHaveCount(3);
  await page.fill('[data-testid="discovery-search"]', "");

  // 6 · change a resolution
  const third = page.locator('[data-testid="basket-item"]').nth(2);
  await third.locator('[data-testid="outcome-NO"]').click();
  await expect(third.locator('[data-testid="outcome-NO"]')).toHaveAttribute("aria-checked", "true");

  // 7 · remove, then undo
  await page.locator('[data-testid="basket-item"]').nth(1).locator('[data-testid="basket-remove"]').click();
  await expect(page.locator('[data-testid="basket-item"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Undo basket change" }).click();
  await expect(page.locator('[data-testid="basket-item"]')).toHaveCount(3);

  // 8–11 · fork; rapid re-clicks must not start a second transition
  await page.click('[data-testid="fork-reality"]');
  await page.click('[data-testid="fork-reality"]', { force: true }).catch(() => {});
  const input = page.locator('[data-testid="verse-name-input"]');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill("ETF Euphoria");
  await input.press("Enter");
  await expect(page.locator('[data-testid="current-verse-name"]')).toHaveText("ETF Euphoria");
  const n = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("fork-universe-v1")!).state.verses).length);
  expect(n).toBe(2); // origin + exactly one child (no duplicate fork)

  // 15 · probability shows a conditional estimate and delta
  await expect(page.locator('[data-testid="probability-display"]')).toContainText("%");
  await expect(page.locator('[data-testid="delta"]')).toBeVisible();

  // 13 · deeper fork inherits
  await addByClick(page, "US crypto market-structure law");
  await expect(page.getByText("Builds on 3 assumptions of ETF Euphoria")).toBeVisible();
  await forkAndName(page, "Rulebook Written");
  await expect(page.getByRole("navigation", { name: "Verse ancestry" })).toContainText("ETF Euphoria");

  // 12 · parent navigation
  await page.click('[data-testid="bar-parent"]');
  await expect(page.locator('[data-testid="current-verse-name"]')).toHaveText("ETF Euphoria");
  await page.click('[data-testid="bar-origin"]');
  await expect(page.locator('[data-testid="current-verse-name"]')).toHaveText("Origin");

  // 18 · reload keeps the universe
  await page.reload();
  await expect(page.locator('[data-testid="current-verse-name"]')).toHaveText("Origin");
  await page.getByRole("navigation", { name: "Verse ancestry" }).waitFor();
  await page.click('[data-testid="open-saved"]');
  await page.locator('[data-testid="saved-verses"]').getByRole("button", { name: "Enter ETF Euphoria" }).click();
  await expect(page.locator('[data-testid="current-verse-name"]')).toHaveText("ETF Euphoria");

  // 16 · inspect analysts and the disagreement
  await page.click('[data-testid="analyst-skeptic"]');
  await expect(page.locator('[data-testid="model-inspector"]')).toContainText("Skeptic");
  await page.locator('[data-testid="model-inspector"]').getByRole("button", { name: "Forecast" }).click();
  await page.click('[data-testid="inspect-disagreement"]');
  await expect(page.locator('[data-testid="disagreement-view"]')).toContainText("Where the analysts split");
  await page.locator('[data-testid="disagreement-view"]').getByRole("button", { name: "Forecast" }).click();

  // 17 · compare
  await page.click('[data-testid="open-compare"]');
  const cmp = page.locator('[data-testid="compare-panel"]');
  await expect(cmp).toBeVisible();
  await cmp.getByLabel("Choose Verse").nth(0).selectOption({ label: "ETF Euphoria (G1)" });
  await cmp.getByLabel("Choose Verse").nth(1).selectOption({ label: "Rulebook Written (G2)" });
  await expect(cmp).toContainText("apart");
  await expect(cmp).toContainText("Only in Rulebook Written");
  await page.keyboard.press("Escape");
  await expect(cmp).toBeHidden();

  // 14 · switch target inside the same world — no forecast is transferred
  await page.click('[data-testid="target-selector"]');
  await page.getByLabel("Search targets").fill("S&P 500");
  await page.locator('#target-list [data-event="demo-spx-up-2027"]').click();
  await expect(page.locator('[data-testid="analyze-world"]')).toBeVisible();
  await page.click('[data-testid="analyze-world"]');
  await expect(page.locator('[data-testid="analyst-causal"]')).toBeVisible();
});

test("19–20 · demo engine without credentials, reduced motion fork", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page);
  const status = await (await page.request.get("/api/status")).json();
  expect(["cli", "demo"]).toContain(status.engine);
  await page.click('[data-testid="example-demo-btc-150k-2027"]');
  await addByClick(page, "Stablecoin supply");
  const t0 = Date.now();
  await page.click('[data-testid="fork-reality"]');
  await expect(page.locator('[data-testid="verse-name-input"]')).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(2500); // reduced motion skips the cinematic sequence
  await expect(page.locator('[data-testid="probability-display"]').getByText("DEMO").first()).toBeVisible();
});

for (const vp of [
  { w: 1280, h: 800 },
  { w: 820, h: 1180 },
  { w: 390, h: 844 },
]) {
  test(`21 · no horizontal overflow at ${vp.w}×${vp.h}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await boot(page);
    await page.click('[data-testid="example-demo-btc-150k-2027"]');
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const fork = page.locator('[data-testid="fork-reality"]');
    if (await fork.count()) {
      const b = await fork.boundingBox();
      if (b) expect(b.x + b.width).toBeLessThanOrEqual(vp.w);
    }
    await page.screenshot({ path: `test-results/viewport-${vp.w}x${vp.h}.png` });
  });
}

test("22 · no critical runtime errors were recorded", async () => {
  expect(errors, errors.join("\n")).toEqual([]);
});
