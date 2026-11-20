import { NextResponse } from "next/server";
import { prewarm, searchGeminiEvents } from "@/lib/server/gemini";

prewarm();

export const dynamic = "force-dynamic";

/** Live Gemini events. Demo + custom events are served client-side and never mixed into this response. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get("q")?.slice(0, 80) || undefined;
  const category = u.searchParams.get("category") || undefined;
  try {
    const atlas = u.searchParams.get("view") === "atlas";
    const r = await searchGeminiEvents({ q, category, allMarkets: atlas, curated: atlas && u.searchParams.get("catalog") !== "full" });
    return NextResponse.json({ ok: true, source: "gemini", ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, source: "gemini", error: `Gemini Prediction Markets unavailable: ${(e as Error).message}`, events: [] },
      { status: 200 },
    );
  }
}
