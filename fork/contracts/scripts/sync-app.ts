import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { sha256 } from "../oracle/gemini.js";
const target = new URL("../../src/lib/contracts/generated/", import.meta.url);
mkdirSync(target, { recursive: true });
const idl = readFileSync(
  new URL("../target/idl/fork_contracts.json", import.meta.url),
);
for (const [from, to] of [
  ["../target/idl/fork_contracts.json", "idl.json"],
  ["../target/types/fork_contracts.ts", "fork_contracts.ts"],
  ["../client/app-types.ts", "app-types.ts"],
  ["../research/lmsr.ts", "lmsr.ts"],
]) {
  writeFileSync(
    new URL(to!, target),
    readFileSync(new URL(from!, import.meta.url)),
  );
}
writeFileSync(
  new URL("build.json", target),
  JSON.stringify({ idlHash: sha256(idl) }, null, 2) + "\n",
);
console.log("Synced generated Anchor IDL, types and public DTOs to fork.");
