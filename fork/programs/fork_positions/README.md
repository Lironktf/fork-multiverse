# FORK Positions — Anchor program (design draft, not deployed)

**Status: specification-grade source only.** It has not been compiled, tested or
deployed from this repository: the build environment had no Rust / Solana CLI /
Anchor toolchain. The FORK UI shows "FORK Positions — not deployed" and never
simulates a position or a transaction for it.

What *is* live onchain today is the **Verse attestation**: a real Solana devnet
transaction (SPL Memo program) signed by the user's wallet. See
`src/lib/client/attest.ts` and `src/components/solana/Onchain.tsx`.

## Scope (hackathon-narrow by design)

| Requirement | Design |
| --- | --- |
| Network | Solana devnet |
| Collateral | any SPL test token (e.g. a devnet USDC-like mint created for the demo) |
| Conditions | one precisely defined **binary** event per market, identified by `event_hash` = sha256 of its canonical definition (title, resolution criteria, source id) |
| Collateralisation | complete sets only: 1 collateral → 1 YES + 1 NO, so claims are always 100% backed |
| Resolution | a single named `resolution_authority` key (test key on devnet), only after `expiry_ts`, only once |
| Settlement | winning side redeems 1:1; pre-resolution complete sets can be merged back |
| No model in the loop | an LLM never decides a payout; model output is never an input to `resolve` |

Instructions: `create_market`, `mint_set`, `merge_set`, `transfer_claim`,
`resolve`, `redeem`.

## To make it real

1. Install Rust, the Solana CLI and Anchor 0.31+; `anchor init` a workspace and
   drop this `src/lib.rs` in `programs/fork_positions/`.
2. `anchor build`, replace the placeholder `declare_id!`, `anchor deploy --provider.cluster devnet`.
3. Write `anchor test` cases for: double resolve, resolve before expiry, wrong
   authority, merge after resolve, redeem losing side, transfer more than held.
4. Only then wire a "Open position" action into the UI — with explorer links
   for every transaction and no optimistic success states.
