import { serviceProxy } from "@/lib/server/service-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mock-collateral service: "If this happens, buy" rules (+ its markets and faucet).
const proxy = serviceProxy(process.env.FORK_LOCAL_SERVICE, [
  "config",
  "catalog",
  "instrument",
  "markets",
  "refresh",
  "faucet",
  "rules",
]);
export const GET = proxy;
export const POST = proxy;
