# Fork

The Next.js application and Solana backend live together in [`fork/`](fork/README.md).

See the [development workflow](fork/docs/integration.md),
[verification evidence](fork/docs/verification.md), and
[review notes](fork/docs/pr-review.md).

For the demo, follow the [devnet walkthrough](fork/docs/devnet.md).
Use **Trade → Available markets → Open in graph & trade**, then connect Phantom,
deposit devnet SOL and review a buy or sell.

The actual Rust program is in [`lib.rs`](fork/contracts/programs/fork-contracts/src/lib.rs),
with [account constraints](fork/contracts/programs/fork-contracts/src/instructions.rs),
[lifecycle](fork/contracts/programs/fork-contracts/src/state.rs), and
[pricing math](fork/contracts/programs/fork-contracts/src/math.rs).
