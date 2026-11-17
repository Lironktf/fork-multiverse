import { NextResponse } from "next/server";
import { engineStatus } from "@/lib/server/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, ...engineStatus(), solanaCluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet" });
}
