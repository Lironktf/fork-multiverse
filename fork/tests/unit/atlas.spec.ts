import { expect, test } from "@playwright/test";
import { chainScenario, marketFreshness, marketLinks } from "../../src/lib/domain/atlas";
import { normalizeEvent } from "../../src/lib/domain/gemini-normalize";
import { observedProbability } from "../../src/lib/domain/market";

function market(ticker: string, title: string, series?: string) {
  return normalizeEvent({ id: ticker, ticker, title, series, type: "binary", status: "active" }, 1000);
}

test("categorical markets keep actual outcomes and never invent missing odds", () => {
  const event = normalizeEvent({
    id: "rates", ticker: "RATES", title: "Rate decision", type: "categorical", status: "active",
    contracts: [{ id: "single", label: "Hold", prices: { lastTradePrice: "0.65" } }],
  }, 1000);
  expect(event.possibleOutcomes).toEqual(["Hold"]);
  expect(observedProbability(event, "Hold")?.value).toBe(0.65);
  expect(observedProbability(event, "NO")).toBeNull();
  expect(marketFreshness(event.fetchedAt, 122000)).toBe("Stale snapshot");
});

test("links use Gemini series or meaningful shared terms and avoid loops", () => {
  const start = market("START", "Bitcoin above $150,000 before December", "bitcoin-prices");
  const topic = market("TOPIC", "BTC volatility this month");
  const series = market("SERIES", "A monthly threshold", "bitcoin-prices");
  const unrelated = market("OTHER", "Snowfall before December");
  expect(marketLinks(start, [topic, series, topic, unrelated], new Set([start.id])).map(({ event }) => event.id)).toEqual([series.id, topic.id]);
  expect(marketLinks(start, [topic], new Set([topic.id]))).toEqual([]);
  expect(marketLinks(market("AI", "Best AI at the end of 2026?"),
    [market("SP", "S&P close price at the end of 2026?"), market("MODELS", "Open-source AI benchmark leader?")], new Set())
    .map(({ event }) => event.id)).toEqual(["gemini:MODELS"]);
  expect(marketLinks(market("SP_LOW", "How low will the S&P get this year?"),
    [market("SP_CLOSE", "S&P 500 close price end of 2026?"), market("JOBS", "How high will unemployment get in 2026?")], new Set())
    .map(({ event, reason }) => [event.id, reason])).toEqual([["gemini:SP_CLOSE", "Shared market topics · S&P 500"]]);
});

test("a possible impact can connect different market topics", () => {
  const inflation = market("CPI", "Will inflation rise?");
  const rates = market("RATES", "Will interest rates fall?");
  expect(marketLinks(inflation, [rates], new Set())[0]).toMatchObject({ event: rates, reason: expect.stringContaining("Possible impact") });
});

test("only the selected event outcome becomes a Verse assumption", () => {
  const first = market("FIRST", "First market");
  const last = market("LAST", "Last market");
  const assumption = { event: first, outcome: "NO" };
  const target = { event: last, outcome: "YES" };
  expect(chainScenario(assumption, target)).toMatchObject({
    target: { eventId: last.id, outcome: "YES" },
    assumptions: [{ eventId: first.id, outcome: "NO" }],
  });
  expect(chainScenario(assumption, assumption)).toBeNull();
  expect(chainScenario(assumption, { ...target, outcome: "invalid" })).toBeNull();
});
