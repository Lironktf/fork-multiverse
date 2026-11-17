import { NextResponse } from "next/server";
import { loadUniverse, saveUniverse } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-side mirror of a browser's universe (Verses, events, forecast ids). Keyed by an anonymous local id. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, universe: loadUniverse(id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { id, universe } = await req.json();
    if (typeof id !== "string" || id.length > 80) throw new Error("bad id");
    const body = JSON.stringify(universe);
    if (body.length > 4_000_000) throw new Error("universe too large");
    saveUniverse(id, universe);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
