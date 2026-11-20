import { NextResponse } from "next/server";

/** Older Atlas tabs may still request hypotheses before the new bundle loads. */
export function POST() {
  return NextResponse.json(
    { error: "Atlas now connects live Gemini markets and runs forecasts in Verse. Refresh this tab to load the new Atlas." },
    { status: 410 },
  );
}
