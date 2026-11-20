import { expect, test } from "@playwright/test";
import { chainScenario, classifyRelationship, diverseMarketLinks, marketFreshness, marketLinks } from "../../src/lib/domain/atlas";
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

test("changing a categorical outcome reranks the suggested branches", () => {
  const event = { ...market("RESULT", "Who will win?"), eventType: "categorical" as const, possibleOutcomes: ["Alice", "Bob"] };
  const alice = market("ALICE", "Will Alice win a majority?");
  const bob = market("BOB", "Will Bob win a majority?");
  expect(marketLinks(event, [alice, bob], new Set(), "Alice")[0]).toMatchObject({ event: alice, reason: "Matches selected outcome · alice" });
  expect(marketLinks(event, [alice, bob], new Set(), "Bob")[0]).toMatchObject({ event: bob, reason: "Matches selected outcome · bob" });
});

test("related markets can resolve on different dates in either order", () => {
  const later = { ...market("LATER", "Bitcoin above $150,000?"), resolutionDate: "2031-12-31" };
  const earlier = { ...market("EARLIER", "BTC volatility this month"), resolutionDate: "2030-11-20" };
  expect(marketLinks(later, [earlier], new Set())[0]).toMatchObject({ event: earlier, type: "Thematic" });
  expect(classifyRelationship(later, earlier, "Potentially causal")).toBe("Thematic");
});

test("a U.S. crypto bill surfaces presidential nomination and chamber control markets", () => {
  const bill = market("BILL", "Will crypto market structure legislation become law?");
  const democrat = market("DEM", "2028 Democratic Nominee for President?");
  const senate = market("SENATE", "Which party will control the U.S. Senate after the midterms?");
  const irrelevant = market("FOREIGN", "When will the French presidential election occur?");
  const prices = Array.from({ length: 20 }, (_, i) => market(`PRICE${i}`, `Crypto price today at ${i % 12 + 1}:00 EST`));
  const matches = diverseMarketLinks(marketLinks(bill, [...prices, democrat, senate, irrelevant], new Set(), undefined, 30), 5);
  expect(matches.find(({ event }) => event.id === democrat.id)?.type).toBe("Political");
  expect(matches.find(({ event }) => event.id === senate.id)?.type).toBe("Political");
  expect(matches.some(({ event }) => event.id === irrelevant.id)).toBe(false);
});

test("a bare 'federal' is not the Fed: federal-crime markets do not link to rate decisions", () => {
  const crime = market("FEDCRIME", "Who will be charged with a federal crime in 2026?");
  const fed = market("FEDDEC", "Fed decision in December?");
  const reserve = market("FOMC", "Will the Federal Reserve cut rates?");
  const recession = market("REC", "Recession this year?");
  const titles = (from: typeof recession) => marketLinks(from, [crime, fed, reserve], new Set()).map((l) => l.event.title);
  expect(titles(recession)).not.toContain(crime.title);
  expect(titles(recession)).toEqual(expect.arrayContaining([fed.title, reserve.title]));
});
