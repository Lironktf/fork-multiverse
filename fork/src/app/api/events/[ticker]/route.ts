import { NextResponse } from "next/server";
import { getGeminiEvent } from "@/lib/server/gemini";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  try {
    return NextResponse.json({ ok: true, event: await getGeminiEvent(ticker) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
