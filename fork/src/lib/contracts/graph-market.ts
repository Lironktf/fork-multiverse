import type { Assumption, ForkEvent, TargetRef } from "@/lib/domain/types";
import type { MarketBinding } from "./generated/app-types";

/** Resolve the exact binary instrument; event IDs and labels are never contract addresses. */
export function graphInstrument(event: ForkEvent | undefined, outcome: string) {
  if (!event || event.source !== "gemini" || !event.externalMarketId)
    return null;
  const key = event.eventType === "binary" ? "YES" : outcome;
  const instrument = event.metadata.instrumentSymbols?.[key];
  return instrument
    ? {
        ticker: event.externalMarketId,
        instrument,
        title: event.title,
        outcome: key,
      }
    : null;
}

export function graphMarketPair(
  events: Record<string, ForkEvent>,
  target: TargetRef,
  condition?: Assumption,
) {
  if (!condition || condition.eventId === target.eventId) return null;
  const event = events[condition.eventId];
  if (event?.eventType === "binary" && condition.selectedOutcome !== "YES")
    return null;
  const parent = graphInstrument(event, condition.selectedOutcome);
  const child = graphInstrument(events[target.eventId], target.outcome);
  return parent && child ? { parent, target: child } : null;
}

export function bindingLabel(
  binding: MarketBinding,
  events: Record<string, ForkEvent>,
) {
  const event = Object.values(events).find(
    (e) => e.source === "gemini" && e.externalMarketId === binding.ticker,
  );
  const outcome = Object.entries(event?.metadata.instrumentSymbols ?? {}).find(
    ([, symbol]) => symbol === binding.instrument,
  )?.[0];
  return event && outcome ? `${event.title} · ${outcome}` : binding.instrument;
}
