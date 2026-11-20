import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  settlement,
  parseEvent,
  termsHash,
  relay,
  fetchEvent,
  type Binding,
} from "../oracle/gemini.js";
const b = (
  JSON.parse(
    readFileSync(
      new URL("../fixtures/registrations.json", import.meta.url),
      "utf8",
    ),
  ) as Binding[]
)[0]!;
const fixture = () =>
  JSON.parse(
    readFileSync(new URL("../fixtures/A.json", import.meta.url), "utf8"),
  );
const rules = readFileSync(new URL("../fixtures/A.rules.txt", import.meta.url));
test("exact contract YES/NO with immutable terms", () => {
  const raw = fixture();
  assert.equal(
    termsHash(parseEvent(raw), raw.contracts[0], rules),
    b.termsHash,
  );
  assert.equal(settlement(raw, b, rules, 1_800_000_220)?.outcome, "yes");
  raw.contracts[0].resolutionSide = "no";
  assert.equal(settlement(raw, b, rules, 1_800_000_220)?.outcome, "no");
});
test("unknown, active, review, delayed and invalid are never inferred NO", () => {
  const raw = fixture();
  raw.status = "active";
  raw.contracts[0].status = "active";
  raw.contracts[0].marketState = "open";
  assert.equal(settlement(raw, b, rules, 1_800_010_000), null);
  raw.contracts[0].status = "under_review";
  assert.equal(settlement(raw, b, rules, 1_800_010_000)?.outcome, "unresolved");
  raw.contracts[0].status = "invalid";
  assert.equal(settlement(raw, b, rules, 1_800_010_000)?.outcome, "invalid");
  delete raw.contracts[0].resolvedAt;
  assert.equal(settlement(raw, b, rules, 1_800_010_000)?.outcome, "unresolved");
  raw.contracts[0].status = "mystery";
  assert.throws(() => settlement(raw, b, rules, 1_800_010_000));
});
test("reject mismatches, missing sides, changed terms and source times", () => {
  for (const change of [
    (r: any) => (r.ticker = "OTHER"),
    (r: any) => (r.contracts[0].instrumentSymbol = "WRONG"),
    (r: any) => r.contracts.push(r.contracts[0]),
    (r: any) => (r.contracts[0].description = "changed"),
    (r: any) => delete r.contracts[0].resolutionSide,
    (r: any) => (r.contracts[0].resolvedAt = "2020-01-01T00:00:00Z"),
    (r: any) => (r.contracts[0].resolvedAt = "2040-01-01T00:00:00Z"),
  ]) {
    const raw = fixture();
    change(raw);
    assert.throws(() => settlement(raw, b, rules, 1_800_000_220));
  }
  assert.throws(() =>
    settlement(fixture(), b, Buffer.from("changed rules"), 1_800_000_220),
  );
});
test("HTTP adapter uses exact endpoint and propagates errors", async () => {
  const fake: typeof fetch = async (input) => {
    assert.match(String(input), /\/events\/A$/);
    return new Response(JSON.stringify(fixture()));
  };
  assert.deepEqual(await fetchEvent("A", fake), fixture());
  await assert.rejects(
    fetchEvent("A", async () => new Response("", { status: 503 })),
  );
});
test("relayer retries an ambiguous send idempotently and rejects conflicts", async () => {
  const payload = settlement(fixture(), b, rules, 1_800_000_220)!;
  let sent = 0,
    final = false;
  const transport = {
    async current() {
      return final
        ? { outcome: payload.outcome, sourceTs: payload.sourceTs }
        : { outcome: "unresolved" as const, sourceTs: 0 };
    },
    async submit() {
      sent++;
      final = true;
      throw new Error("timeout after accepted");
    },
  };
  assert.equal(await relay(payload, transport, () => {}), null);
  assert.equal(sent, 1);
  await assert.rejects(
    relay({ ...payload, outcome: "no" }, transport, () => {}),
  );
});
