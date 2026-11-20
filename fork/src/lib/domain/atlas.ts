import type { ForkEvent, TargetRef } from "./types";

export type AtlasPremise = { event: ForkEvent; outcome: string };
export type AtlasScenario = {
  target: TargetRef;
  assumptions: TargetRef[];
  events: ForkEvent[];
};

export type MarketLink = { event: ForkEvent; reason: string };

const common = new Set("about above across again april august average become becomes below best bottom business close closes closing day december during early economics eight either end ends even event every february final first five for four friday from get gets going greater happen happens high highest hit how increase january july june last latest least level low lower march macro indicators market markets match may million monday month monthly months more next nine november number october occur over period political politics prediction predictions price reach reaches remaining september seven six since start sunday than that the their them then there these they this those three threshold thursday today tomorrow total tuesday under value week weekly weeks wednesday what when where which while will with without would year yearly years after before between could".split(" "));

function topics(event: ForkEvent): Set<string> {
  const text = `${event.title} ${(event.metadata.tags ?? []).join(" ")}`.toLowerCase()
    .replace(/\bs\s*&\s*p(?:\s*500)?\b/g, " sp500 ")
    .replace(/\bnasdaq[- ]?100\b/g, " nasdaq100 ");
  const words = text.match(/[\p{L}][\p{L}\p{N}]{2,}|\bai\b/gu) ?? [];
  const terms = new Set(words.filter((word) => !common.has(word)).map((word) => {
    if (word === "sp500") return "S&P 500";
    if (word === "nasdaq100") return "Nasdaq-100";
    if (word === "ai") return "artificial intelligence";
    if (["btc", "bitcoin"].includes(word)) return "bitcoin";
    if (["eth", "ethereum"].includes(word)) return "ethereum";
    if (["rates", "rate"].includes(word)) return "rate";
    if (["federal", "fed", "fomc"].includes(word)) return "fed";
    return word;
  }));
  if (/\b(?:interest rates?|rate (?:cut|hike)s?|monetary policy)\b/.test(text)) terms.add("monetary policy");
  return terms;
}

const impactRules = [
  { from: ["inflation", "cpi"], to: ["fed", "monetary policy"], reason: "Inflation readings can change interest-rate expectations." },
  { from: ["fed", "monetary policy"], to: ["recession", "unemployment"], reason: "Interest rates can influence borrowing, hiring, and growth." },
  { from: ["fed", "monetary policy"], to: ["bitcoin", "ethereum", "S&P 500", "Nasdaq-100"], reason: "Interest rates can change demand for risk assets." },
  { from: ["unemployment", "recession"], to: ["fed", "monetary policy"], reason: "Signs of a slowdown can influence rate decisions." },
  { from: ["oil", "hormuz"], to: ["inflation", "cpi"], reason: "Energy supply disruptions can raise consumer prices." },
] as const;

export function marketLinks(current: ForkEvent, catalog: ForkEvent[], visited: ReadonlySet<string>): MarketLink[] {
  const sourceTopics = topics(current);
  const candidates = [...new Map(catalog.map((event) => [event.id, event])).values()].filter((event) =>
    event.source === "gemini" && event.id !== current.id && !visited.has(event.id) && event.possibleOutcomes.length > 0);
  const matches = candidates.map((event) => {
    const nextTopics = topics(event);
    const impact = impactRules.find(({ from, to }) => from.some((term) => sourceTopics.has(term)) &&
      to.some((term) => nextTopics.has(term) && !sourceTopics.has(term)));
    return { event, impact, shared: [...nextTopics].filter((term) => sourceTopics.has(term)) };
  });
  const frequency = new Map<string, number>();
  for (const { shared } of matches) for (const term of shared) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  return matches.flatMap(({ event, impact, shared }) => {
    const series = current.metadata.series && current.metadata.series === event.metadata.series;
    if (!impact && !series && !shared.length) return [];
    const score = shared.reduce((sum, term) => sum + 1 / Math.sqrt(frequency.get(term) ?? 1), 0) + (series ? 2 : 0) + (impact ? 2.5 : 0);
    return [{ event, score, reason: impact ? `Possible impact · ${impact.reason}` : series ? "Same Gemini market series" : `Shared market topics · ${shared.slice(0, 3).join(", ")}` }];
  }).sort((a, b) => b.score - a.score || (b.event.metadata.volumeUsd ?? 0) - (a.event.metadata.volumeUsd ?? 0))
    .slice(0, 8).map(({ event, reason }) => ({ event, reason }));
}

export function chainScenario(assumption: AtlasPremise | undefined, target: AtlasPremise | undefined): AtlasScenario | null {
  if (!assumption || !target || assumption.event.id === target.event.id ||
    [assumption, target].some(({ event, outcome }) => event.source !== "gemini" || !event.possibleOutcomes.includes(outcome))) return null;
  return {
    target: { eventId: target.event.id, outcome: target.outcome },
    assumptions: [{ eventId: assumption.event.id, outcome: assumption.outcome }],
    events: [assumption.event, target.event],
  };
}

export function marketFreshness(fetchedAt: string | undefined, now = Date.now()) {
  const timestamp = fetchedAt ? Date.parse(fetchedAt) : NaN;
  if (!Number.isFinite(timestamp)) return "Timestamp unavailable";
  return now - timestamp > 120_000 ? "Stale snapshot" : "Recent snapshot";
}
