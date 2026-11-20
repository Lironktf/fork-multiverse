import { spawnSync } from "node:child_process";
const files = [
  "src/app/api/solana/**/*.ts",
  "src/components/solana/*.tsx",
  "src/lib/contracts/*.ts",
  "src/lib/server/gemini.ts",
  "tests/helpers/local-wallet.ts",
  "tests/e2e/solana.spec.ts",
  "tests/e2e/redemption.spec.ts",
  "tests/e2e/liquidity.spec.ts",
  "tests/e2e/wallet-balance.spec.ts",
  "tests/unit/contracts.spec.ts",
  "scripts/format-integration.mjs",
  "package.json",
  "tsconfig.json",
  "playwright.config.ts",
  "eslint.config.mjs",
  "README.md",
  "../README.md",
  "contracts/README.md",
  "docs/*.md",
];
const result = spawnSync(
  "node_modules/.bin/prettier",
  [process.argv.includes("--write") ? "--write" : "--check", ...files],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
