import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const service =
      process.env.FORK_SERVICE_URL ?? process.env.FORK_LOCAL_SERVICE;
    if (!service)
      return NextResponse.json(
        {
          ok: false,
          code: "not_configured",
          error:
            "The Solana trading service is not running for this deployment. See docs/integration.md.",
        },
        { status: 503 },
      );
    const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
    // Next may normalize req.url to localhost even when the browser used 127.0.0.1.
    // Validate the actual HTTP Host and require an exact browser Origin match.
    const requestUrl = new URL(req.url);
    const browserUrl = new URL(
      `http://${req.headers.get("host") ?? requestUrl.host}`,
    );
    const backend = new URL(service);
    if (
      !local.has(browserUrl.hostname) ||
      !local.has(backend.hostname) ||
      backend.protocol !== "http:"
    )
      throw new Error("The trading service is available only on localhost.");
    const origin = req.headers.get("origin");
    if (origin && origin !== browserUrl.origin)
      throw new Error("Cross-origin local requests are not allowed.");
    const { path } = await context.params;
    if (
      path.length !== 1 ||
      !["config", "catalog", "instrument", "markets", "refresh"].includes(
        path[0],
      )
    )
      throw new Error("Unknown local endpoint.");
    const response = await fetch(
      new URL(`/${path[0]}${requestUrl.search}`, backend),
      {
        method: req.method,
        headers: { "x-fork-local": "1", "Content-Type": "application/json" },
        body: req.method === "POST" ? await req.text() : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      },
    );
    return NextResponse.json(await response.json(), {
      status: response.status,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
