"use client";
import { useQuery } from "@tanstack/react-query";
import { ServiceNotConfigured, solApi } from "@/lib/contracts/client";

/**
 * Whether this deployment runs the native-SOL service (the Trade tab). `false` only when
 * it is explicitly not configured; a running-but-failing service still shows the tab so
 * its error is visible there.
 */
export function useSolTrading() {
  const q = useQuery({
    queryKey: ["sol-service"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        await solApi("config");
        return true;
      } catch (e) {
        return !(e instanceof ServiceNotConfigured);
      }
    },
  });
  return q.data === true;
}
