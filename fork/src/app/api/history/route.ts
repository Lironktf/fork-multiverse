import { NextResponse } from "next/server";
import { getOutcomeHistory, HISTORY_RANGES, type HistoryRange } from "@/lib/server/gemini";

export const dynamic = "force-dynamic";

/** GET /api/history?ticker=CRYPTOSTRUCT26&outcome=YES&range=1M — observed Gemini contract prices (MARKET data). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ticker = u.searchParams.get("ticker") ?? "";
  const outcome = u.searchParams.get("outcome") ?? "YES";
  const range = (u.searchParams.get("range") ?? "1M") as HistoryRange;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(ticker) || !(range in HISTORY_RANGES) || outcome.length > 200)
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await getOutcomeHistory(ticker, outcome, range)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
