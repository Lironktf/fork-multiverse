import { Agent, request } from "node:https";

/** Public devnet has request and connection limits. Reuse one TLS connection
 * and serialize requests, including SPL helper calls through the same client. */
export function devnetFetch(): typeof fetch {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== "https://api.devnet.solana.com")
      return Promise.reject(
        new Error("Devnet transport only accepts the official RPC."),
      );
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        await new Promise((r) =>
          setTimeout(r, Math.max(0, last + 600 - Date.now())),
        );
        last = Date.now();
        const response = await new Promise<Response>((resolve, reject) => {
          const req = request(
            url,
            {
              method: "POST",
              agent,
              headers: Object.fromEntries(new Headers(init?.headers)),
              signal: init?.signal ?? undefined,
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
              res.on("error", reject);
              res.on("end", () =>
                resolve(
                  new Response(Buffer.concat(chunks).toString(), {
                    status: res.statusCode ?? 502,
                    headers: Object.fromEntries(
                      Object.entries(res.headers)
                        .filter(([, value]) => value !== undefined)
                        .map(([key, value]) => [
                          key,
                          Array.isArray(value)
                            ? value.join(",")
                            : String(value),
                        ]),
                    ),
                  }),
                ),
              );
            },
          );
          req.setTimeout(30_000, () =>
            req.destroy(new Error("Devnet RPC timed out")),
          );
          req.on("error", reject);
          req.end(init?.body);
        });
        if (response.status !== 429 || attempt >= 4) return response;
        await response.text();
        const retry = Number(response.headers.get("retry-after"));
        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(
              30_000,
              Math.max(
                2000 * 2 ** attempt,
                Number.isFinite(retry) ? retry * 1000 : 0,
              ),
            ),
          ),
        );
      }
    };
    const pending = queue.then(run, run);
    queue = pending.catch(() => {});
    return pending;
  };
}
