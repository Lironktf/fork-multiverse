import { parseEvent } from "../oracle/gemini.js";

export function catalogSearch(input: string): string {
  const aliases: Record<string, string> = {
    bitcoin: "BTC",
    ethereum: "ETH",
    ether: "ETH",
    solana: "SOL",
  };
  return input
    .trim()
    .replace(
      /\b(bitcoin|ethereum|ether|solana)\b/gi,
      (word) => aliases[word.toLowerCase()]!,
    );
}

export async function catalogPage(
  search: string,
  offset: number,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL("https://api.gemini.com/v1/prediction-markets/events");
  url.search = new URLSearchParams({
    status: "active",
    limit: "20",
    offset: String(offset),
  }).toString();
  const query = catalogSearch(search);
  if (query) url.searchParams.set("search", query);
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Gemini catalog HTTP ${response.status}`);
  const raw = (await response.json()) as {
    data: unknown[];
    pagination?: { total?: number };
  };
  if (!Array.isArray(raw.data))
    throw new Error("Gemini returned an invalid catalog.");
  const events = raw.data.map(parseEvent);
  const titles = raw.data.map((e) => (e as { title?: string }).title ?? "");
  const total = raw.pagination?.total;
  const hasNext =
    typeof total === "number"
      ? offset + events.length < total
      : events.length === 20;
  return { events, titles, hasNext, query };
}
