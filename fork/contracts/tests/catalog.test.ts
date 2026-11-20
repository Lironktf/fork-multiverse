import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogPage, catalogSearch } from "../demo/catalog.js";

test("common asset names use Gemini ticker names", () => {
  assert.equal(catalogSearch(" Bitcoin "), "BTC");
  assert.equal(catalogSearch("Solana price"), "SOL price");
  assert.equal(catalogSearch("Ethereum"), "ETH");
  assert.equal(catalogSearch("election"), "election");
});
test("blank browsing omits search and an empty page is not pageable", async () => {
  const page = await catalogPage("", 0, async (input) => {
    assert.equal(new URL(String(input)).searchParams.has("search"), false);
    return new Response(JSON.stringify({ data: [], pagination: { total: 0 } }));
  });
  assert.equal(page.events.length, 0);
  assert.equal(page.hasNext, false);
});
test("Bitcoin query is normalized and final page is detected", async () => {
  const page = await catalogPage("Bitcoin", 0, async (input) => {
    assert.equal(new URL(String(input)).searchParams.get("search"), "BTC");
    return new Response(
      JSON.stringify({
        data: [{ ticker: "BTC", status: "active", contracts: [] }],
        pagination: { total: 1 },
      }),
    );
  });
  assert.equal(page.events[0]?.ticker, "BTC");
  assert.equal(page.hasNext, false);
});
