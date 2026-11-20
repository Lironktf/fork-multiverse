import { readFileSync } from "node:fs";
import { settlement, type Binding } from "../oracle/gemini.js";
import { reportData } from "../client/anchor.js";
const bindings = JSON.parse(
  readFileSync(
    new URL("../fixtures/registrations.json", import.meta.url),
    "utf8",
  ),
) as Binding[];
const b = bindings[0]!;
const raw = JSON.parse(
  readFileSync(new URL("../fixtures/A.json", import.meta.url), "utf8"),
);
const rules = readFileSync(new URL("../fixtures/A.rules.txt", import.meta.url));
const payload = settlement(raw, b, rules, 1_800_000_220)!;
console.log(JSON.stringify({ payload, instruction: [...reportData(payload)] }));
