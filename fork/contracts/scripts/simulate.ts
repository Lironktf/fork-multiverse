import { scenarios, analogueExperiments } from "../research/scenarios.js";
console.log(
  JSON.stringify(
    {
      warning:
        "Synthetic research only; supplied calibration is not inferred from Gemini",
      scenarios: scenarios(),
      terminalAnalogueTests: analogueExperiments(),
    },
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ),
);
