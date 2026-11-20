# Live Gemini/local-validator verification — 2026-11-19

This run fetched current Gemini event detail responses and actual source rules
PDFs. It registered the exact contracts below on a local validator, with
separate Alice/Bob trader signers and an independent LP/admin signer.

- A: BTC2611192200 / GEMI-BTC2611192200-HI61500.
- B: SOL2611192200 / GEMI-SOL2611192200-HI71.
- Source observation/expiry: 2026-11-19T22:00:00Z for both.
- Demo committed close: 2026-11-19T20:00:00Z for both (explicit demo choice).
- Market: BKfGQD8fJcAZNGqSGEevaopTkofgWGfAFgMt4Dv8UHjp.
- Session: `.local/live-verified`, resumable with `--session live-verified --resume`.

Alice bought 10 YES shares for 5.124952 mock USDC. Bob bought 8 NO shares
for 3.880055 mock USDC. Alice then sold 4 YES shares for 1.999996 mock USDC.
The on-chain LMSR moved from 50% to 52.4979%, then 50.5000%, then 49.5000%.

| Trader | Conditional cash | YES shares | NO shares |
| --- | ---: | ---: | ---: |
| Alice | 496.875044 | 6 | 0 |
| Bob | 496.119945 | 0 | 8 |

Vault balance: 1,080.000000 mock USDC. Current source outcomes remained
unresolved; this run did **not** manufacture settlement or test redemption
against a live final result. Poll/watch will relay authentic supported results
when available. The original deterministic suite still covers terminal paths.

`npm run demo:audit -- live-verified` independently fetched the current chain
state and confirmed **16 successful transaction statuses**, two trader PDAs,
vault ownership/mint, aggregate cash/inventory, and the worst-case liability
inequality. All checks passed. The validator retains a larger ledger history
for inspection; transactions from old pruned ledgers may become unavailable.

Actual trade signatures (local cluster):

- alice buy yes: `66zrvmUysZT6tRP9mzHYis6iNywoV3Uzn2v6Ch9396ZuFz5aNH445r2vXp4S2TQs5qEowVjEQgqzXaryKNtQEznu`
- bob buy no: `w2MFCAC7YBFt49AmBWHBo5WxTwxwBNZ3q69anQiEAAKx1sfPHrnYDfcZaepKaq1M5PtzpJ8M8wK9GofotzDrt5n`
- alice sell yes: `aqxR7BcScuZ7NJa16FakkoiyBMUh7W3bsmLoLJaQRM4ApNMqTa6RQSTNKgr8WWSeFiSr9QmjLGEWJPzS3RDyfYh`

Validation after changes: `npm run verify` passed (30 tests); TypeScript
checks, Prettier checks, Rust formatting and shell syntax checks passed.
All previously written TypeScript was reformatted; Rust account constraints
now have separate lines and spacing as well as standard rustfmt formatting.

Run your own selected contracts using the interactive search/pagination menus:

```bash
# Terminal 1
npm run validator:live
# Terminal 2
npm run demo:live
```

The CLI never places orders on Gemini. Gemini supplies live source contracts,
prices, terms and eventual resolution; the actual conditional trades execute
on Solana against the new market. No real-money collateral is involved.
