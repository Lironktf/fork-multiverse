import { NextResponse } from "next/server";
import { nextForks } from "@/lib/server/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

export async function POST(req: Request) {
  try {
    return NextResponse.json({ ok: true, ...(await nextForks(await req.json())) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 400) }, { status: 200 });
  }
}
