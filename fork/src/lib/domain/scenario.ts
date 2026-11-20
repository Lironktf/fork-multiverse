import type { ForkEvent, TargetRef } from "./types";

/** Assumptions one fork may add: the same cap as the basket (store/universe.ts BASKET_LIMIT). */
export const SCENARIO_LIMIT = 8;

export function validateScenario(
  target: TargetRef,
  assumptions: ReadonlyArray<{ eventId: string; outcome: string }>,
  events: ReadonlyMap<string, ForkEvent>,
): void {
  if (!events.get(target.eventId)?.possibleOutcomes.includes(target.outcome)) {
    throw new Error("Choose a valid target outcome before analysing this Verse.");
  }
  if (assumptions.length > SCENARIO_LIMIT) {
    throw new Error(`A Verse can be analysed with at most ${SCENARIO_LIMIT} cumulative assumptions.`);
  }
  const seen = new Set([target.eventId]);
  for (const { eventId, outcome } of assumptions) {
    const event = events.get(eventId);
    if (!event?.possibleOutcomes.includes(outcome)) throw new Error(`Invalid assumption outcome for ${event?.title ?? eventId}.`);
    if (eventId === target.eventId) throw new Error("The target is already assumed in this scenario. Choose another target.");
    if (seen.has(eventId)) throw new Error(`“${event.title}” appears more than once in this scenario.`);
    seen.add(eventId);
  }
}
