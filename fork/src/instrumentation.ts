/**
 * Server start-up: pre-load the Gemini catalog so the first search, the welcome
 * starters and the Atlas don't wait on ~8 sequential category requests (Gemini
 * calls are throttled to 1/s; measured ~8–10 s cold on 2026-11-20). Refreshed every
 * 5 minutes, inside the 10-minute stale-while-revalidate window of lib/server/gemini.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.FORK_PREWARM === "0") return;
  const { searchGeminiEvents } = await import("./lib/server/gemini");
  const warm = () =>
    Promise.allSettled([searchGeminiEvents({}), searchGeminiEvents({ allMarkets: true, curated: true })]);
  void warm();
  setInterval(() => void warm(), 5 * 60_000).unref?.();
}
