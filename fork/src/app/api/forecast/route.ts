import { NextResponse } from "next/server";
import { startForecast } from "@/lib/server/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const f = startForecast(await req.json());
    return NextResponse.json({ ok: true, forecast: f });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 500) }, { status: 400 });
  }
}
