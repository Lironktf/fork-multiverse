import { NextResponse } from "next/server";
import { getForecast } from "@/lib/server/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = getForecast(id);
  if (!f) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, forecast: f });
}
