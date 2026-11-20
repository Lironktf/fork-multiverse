import { serviceProxy } from "@/lib/server/service-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Native-SOL service: the graph-linked Trade tab.
const proxy = serviceProxy(process.env.FORK_SOL_SERVICE, [
  "config",
  "catalog",
  "instrument",
  "markets",
  "refresh",
]);
export const GET = proxy;
export const POST = proxy;
