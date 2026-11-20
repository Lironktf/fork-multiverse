import { test, expect } from "@playwright/test";
import {
  graphInstrument,
  graphMarketPair,
  bindingLabel,
} from "../../src/lib/contracts/graph-market";
import { normalizeEvent } from "../../src/lib/domain/gemini-normalize";
import type { Assumption } from "../../src/lib/domain/types";

const a = normalizeEvent(
  {
    id: "a",
    ticker: "OIL",
    title: "Oil price?",
    type: "binary",
    status: "active",
    contracts: [
      {
        id: "numeric-id",
        instrumentSymbol: "GEMI-OIL-HI90",
        label: "Above $90",
        status: "active",
      },
    ],
  },
  Date.parse("2026-11-20T00:00:00Z"),
);
const b = normalizeEvent(
  {
    id: "b",
    ticker: "COPPER",
    title: "Copper price?",
    type: "categorical",
    status: "active",
    contracts: [
      {
        id: "c1",
        instrumentSymbol: "GEMI-COPPER-HI5",
        label: "Above $5",
        status: "active",
      },
      {
        id: "c2",
        instrumentSymbol: "GEMI-COPPER-HI6",
        label: "Above $6",
        status: "active",
      },
    ],
  },
  Date.parse("2026-11-20T00:00:00Z"),
);
const condition: Assumption = {
  eventId: a.id,
  selectedOutcome: "YES",
  addedAtVerseId: "v",
  sourceReference: "OIL",
};
const events = { [a.id]: a, [b.id]: b };

test("graph mapping uses exact instrument symbols, including categorical outcomes", () => {
  expect(graphInstrument(a, "NO")?.instrument).toBe("GEMI-OIL-HI90");
  const pair = graphMarketPair(
    events,
    { eventId: b.id, outcome: "Above $6" },
    condition,
  );
  expect(pair?.target.instrument).toBe("GEMI-COPPER-HI6");
  expect(pair?.parent.instrument).toBe("GEMI-OIL-HI90");
  expect(
    bindingLabel(
      {
        ticker: "COPPER",
        instrument: "GEMI-COPPER-HI6",
        termsHash: "",
        closeTs: 0,
        observationTs: 0,
      },
      events,
    ),
  ).toBe("Copper price? · Above $6");
});
test("unsupported graph assumptions never silently become executable markets", () => {
  const target = { eventId: b.id, outcome: "Above $6" };
  expect(
    graphMarketPair(events, target, { ...condition, selectedOutcome: "NO" }),
  ).toBeNull();
  expect(graphMarketPair(events, target)).toBeNull();
  expect(
    graphMarketPair(events, { eventId: a.id, outcome: "YES" }, condition),
  ).toBeNull();
  expect(graphInstrument({ ...a, source: "demo" }, "YES")).toBeNull();
  expect(
    graphInstrument(
      { ...a, metadata: { contractIds: { YES: "not-an-instrument" } } },
      "YES",
    ),
  ).toBeNull();
  expect(graphInstrument(b, "missing outcome")).toBeNull();
});
