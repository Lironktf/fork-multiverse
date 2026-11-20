FORK LPs previously earned no trading fees and the app always supplied a fixed 80 mock USDC subsidy for depth b=100. This change adds conditional LP fee income, sizes immutable depth from a collateral budget, and lets wallets fund and claim liquidity in the existing market panel. It also connects the application and strategy proposals to public devnet while preserving localnet support.

## Architecture and economics

- Preserve Anchor/Solana, binary LMSR, P(B|A), buy/sell conditional cash, oracle bindings and final settlement semantics.
- Admin-configurable default fee of 0–1,000 bps is snapshotted at market creation. Existing markets cannot be repriced. The local app defaults to 100 bps.
- Buy/sell fees remain inside conditional cash accounting and the market vault. They are included in LP residual equity on valid settlement and cancel entirely on VOID. No protocol collector or fee withdrawal path.
- Reuse permissionless SPL funding and proportional LP PDAs, expose funding/exits/start/claims in the existing panel, and add an optional community Funding phase. Contributions lock at trading start to prevent dilution.
- Budget-sized b: 80 collateral supports about 115.4156 depth instead of 100. The automatic sponsor transfers the exact required subsidy. Show funding requirements, contributions, fees, scenario equity, capital at risk and withdrawal eligibility.
- Keep each market's collateral isolated. A shared custody layer cannot safely reuse reserves across independently resolvable markets with full VOID refunds; the investigation and deferral are documented.

- Enable matching devnet service/browser configuration with pinned genesis/program/IDL checks. Keep privileged signing in the loopback service and wallet signing in Phantom/Wallet Standard. Test collateral is a separate SPL mint; SOL pays fees.
- Share the existing quantitative bot between CLI and a read-only app endpoint. Proposals require a fresh limit-checked on-chain quote and wallet confirmation. Insufficient research data remains an explicit abstention.

## Security and compatibility

Every trade retains `L + D >= C + max(Y,N)`. Fees decrease conditional cash but never original principal or physical reserves. Terminal trader liabilities and LP equity are snapshotted independently; claims are single-use and claim order cannot consume the other class's collateral. Checked integer arithmetic and rounding up prevent fee truncation bypasses.

Market appends 10 bytes for the fixed fee and cumulative conditional fees. `migrate_market` validates owner, discriminator, exact size, canonical PDA and bump, adds rent and preserves all original bytes. Legacy markets retain zero fees; repeated migration cannot reset new fees. Other account layouts, existing instruction arguments, PDA seeds and the repository program ID are unchanged. Updated IDL/events are required. A reproducible migration script is included.

## Validation

- Ran the existing build/check/test workflow before modifications: 16 TypeScript tests, 2 Rust unit + 15 integration tests and 10 frontend unit tests passed.
- Final contract verification: SBF/IDL build, typecheck, formatting, 19 TypeScript tests, 3 Rust unit tests, 18 Rust integration tests (17 execute the compiled program in LiteSVM); Clippy with warnings denied.
- Full real `solana-test-validator` deployment via the CLI: 124 tracked RPC transactions, five markets, two LPs with unequal stakes and three traders; actual SPL transfers, funding exits, both trade sides, profitable trader exits, adverse valid settlement, A=NO, A=INVALID and B=INVALID, arbitrary claim ordering and rejected unauthorized/double claims. Every market checks liabilities and conservation independently.
- In the adverse YES fixture, 80 LP collateral becomes 7.851947 despite 7.199394 accrued conditional fees. All three VOID fixtures refund all original trader deposits and all 80 LP collateral; fees earn zero.
- App typecheck, ESLint, formatting, production build and 11 frontend unit tests pass. All four browser wallet fixtures pass (LP lifecycle plus existing VOID/YES/NO redemption); the seven original UI journey tests also pass.
- Solana program static checker: no findings. Public deployment signature and RPC evidence are checked into the verification artifacts.

- Public devnet deployment and the browser deposit/buy/sell/strategy flow passed; see `fork/contracts/docs/devnet-deployment.json` for public addresses and confirmed transaction signatures.
- Devnet integration checks: 21 contract TypeScript tests, 11 frontend unit tests and seven UI journey tests passed. The devnet build passed. Browser verification uses a Wallet Standard test adapter, not an automated Phantom extension.

## Limits and review notes

No shared vault, live LP additions or withdrawals after start. Fees do not guarantee profit. Pro rata dust and unsolicited surplus remain locked. Single-reporter and upgrade-authority trust remain. This is not an independent audit or a production readiness claim. The app is served on localhost and transacts on public devnet; it is not a publicly hosted service. The funded live Gemini-bound market has future settlement dates, so its final outcome cannot yet be verified. Synthetic settlement tests use a separate configuration and never report fabricated outcomes for that live market. The bot does not provide unattended Phantom trading and may abstain on missing history/calibration.

See `fork/contracts/docs/liquidity.md`, `fork/contracts/docs/liquidity-verification.md`, and `fork/contracts/docs/liquidity-rpc-evidence.json` for the equations, migration instructions, reproducible commands and measured results.
