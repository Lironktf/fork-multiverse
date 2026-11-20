import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // lets a production build coexist with a running dev server
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack(config, { dev }) {
    // The Solana services and local validator write logs/ledgers under contracts/.local every
    // few seconds; watching them made `next dev` recompile continuously (207 rebuilds in
    // ~10 min, measured 2026-11-20). The app only imports src/lib/contracts/generated.
    if (dev)
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/contracts/**", "**/test-results/**"],
      };
    return config;
  },
};

export default nextConfig;
