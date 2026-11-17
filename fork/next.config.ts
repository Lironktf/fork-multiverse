import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // lets a production build coexist with a running dev server
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
