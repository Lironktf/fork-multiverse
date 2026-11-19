import { test, expect } from "@playwright/test";
import { searchEvents } from "../../src/lib/domain/event-search";
import type { RawEvent } from "../../src/lib/domain/gemini-normalize";

const ev = (ticker: string, title: string, outcomes: string[] = ["Yes"], description = ""): RawEvent => ({
  id: ticker,
  ticker,
  title,
  description,
  type: outcomes.length > 1 ? "categorical" : "binary",
  status: "active",
  category: "Politics",
  contracts: outcomes.map((label, i) => ({ id: `${ticker}-${i}`, label })),
});

const CATALOG = [
  ev("HORMUZ", "When will traffic at the Strait of Hormuz return to normal?"),
  ev("LEAVE", "Which world leaders will leave office in 2026?", ["Pedro Sánchez", "Benjamin Netanyahu"]),
  ev("FED", "Fed decision in December?", ["Cut 25bps", "Hold"]),
  ev("UNEMP", "How high will unemployment get?", ["5%"], "Resolves on the unemployment rate published by BLS."),
  ev("ETH", "ETH above $5k?", ["Yes"], "A method for settlement."),
];

test("matches outcome labels, accent-insensitively", () => {
  const hits = searchEvents(CATALOG, "pedro sanchez");
  expect(hits.map((h) => h.event.ticker)).toEqual(["LEAVE"]);
  expect(hits[0].match).toContain("Pedro Sánchez");
});

test("a topic with no direct market falls back to labelled related markets", () => {
  const hits = searchEvents(CATALOG, "iran");
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every((h) => h.related)).toBe(true);
  expect(hits.map((h) => h.event.ticker)).toEqual(expect.arrayContaining(["HORMUZ", "LEAVE"]));
});

test("title matches outrank everything and short terms need word boundaries", () => {
  expect(searchEvents(CATALOG, "fed")[0].event.ticker).toBe("FED");
  // "eth" must not match "method", but does match the ETH title
  expect(searchEvents(CATALOG, "eth").map((h) => h.event.ticker)).toEqual(["ETH"]);
});

test("related matches never come from rules text alone", () => {
  // UNEMP mentions "rate" only in its rules; it must not appear as related to "fed"
  expect(searchEvents(CATALOG, "fed").some((h) => h.event.ticker === "UNEMP")).toBe(false);
});
