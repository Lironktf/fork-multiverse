import { PublicKey } from "@solana/web3.js";
import { environmentClient, BN } from "../client/anchor.js";
import {
  fetchEvent,
  parseEvent,
  exactContract,
  fetchRules,
  settlement,
  relay,
  type Binding,
  type Outcome,
} from "../oracle/gemini.js";
const eventAddress = process.argv[2];
if (!eventAddress) throw new Error("Usage: npm run oracle -- EVENT_PDA");
const { program, payer, send } = environmentClient(),
  event = new PublicKey(eventAddress);
const state = await program.account.externalEvent.fetch(event);
const binding: Binding = {
  ticker: state.ticker,
  instrument: state.instrument,
  termsHash: Buffer.from(state.termsHash).toString("hex"),
  closeTs: state.closeTs.toNumber(),
  observationTs: state.observationTs.toNumber(),
};
const raw = await fetchEvent(binding.ticker),
  contract = exactContract(parseEvent(raw), binding);
if (!contract.termsAndConditionsUrl)
  throw new Error("No source terms document");
const rules = await fetchRules(contract.termsAndConditionsUrl);
const observedAt = Math.floor(Date.now() / 1000),
  payload = settlement(raw, binding, rules, observedAt);
console.log(
  JSON.stringify({ kind: "source", observedAt, event: eventAddress, raw }),
);
if (payload)
  await relay(
    payload,
    {
      async current() {
        const e = await program.account.externalEvent.fetch(event);
        return {
          outcome: Object.keys(e.outcome)[0] as Outcome,
          sourceTs: e.sourceTs.toNumber(),
        };
      },
      async submit(p) {
        return send([
          await program.methods
            .report(
              p.binding,
              p.termsHash,
              { [p.outcome]: {} },
              new BN(p.sourceTs),
            )
            .accountsStrict({
              reporter: payer.publicKey,
              config: state.config,
              event,
            })
            .instruction(),
        ]);
      },
    },
    (x) => console.log(JSON.stringify(x)),
  );
else console.log(JSON.stringify({ kind: "non-final", event: eventAddress }));
