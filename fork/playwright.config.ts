import { defineConfig } from "@playwright/test";

/**
 * E2E runs against an already-running server (BASE_URL, default :3100) in the
 * DEMO engine, so it is deterministic and needs no credentials.
 * PW_CHROMIUM lets you point at an existing Chromium build.
 */
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
});
