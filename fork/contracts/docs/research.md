# Optional market-making research

The bot is an ordinary trader, separate from the passive LP. Its inventory can
lose its deposit when activated; LP losses come from the committed subsidy.
Neither its estimates nor trades have any authority over final outcomes.

`npm run simulate` runs twelve deterministic scenarios without network access
or a wallet. `npm run bot -- MARKET_PDA` is a single-pass paper proposal using
public Gemini data and existing on-chain trader accounts. It never creates a
funded position or submits a trade by default. It reads the generated Anchor
IDL, checks the authoritative on-chain quote, and logs the model, source gates,
uncertainty, size, quote, limit and proposed exposure. Repeat it explicitly or
with a separately reviewed scheduler; it does not run an uncontrolled loop.

To execute a single testnet proposal, supply a funded mock-collateral trader,
`SIGNER_PATH`, and `ENABLE_TESTNET_TRADING=yes`, then pass `--execute-testnet`.
For official devnet, also set `ENABLE_DEVNET=yes` and
`RPC_URL=https://api.devnet.solana.com`. Mainnet RPC URLs are rejected. No live
execution was performed during development. The script does not request a
balance top-up, create a real-money market or bypass the on-chain cutoff.

## Identification and model

Marginals identify only the Frechet interval
[max(0,pA+pB-1), min(pA,pB)] for the joint. Divide by pA for the conditional
interval; pA=0 has no defined conditional probability. Default behavior is
**no trade**, even with a long history, unless explicit external calibration is
provided. Price-change correlation is not Bernoulli outcome correlation.

Histories are sorted, deduplicated, paired within a timestamp tolerance and
limited to a rolling window. Invalid prices, missing quote sides and crossed
or overly wide spreads are filtered; a bad latest quote explicitly stops
trading. Probability clipping avoids numerical boundary instabilities; low
parent probability independently causes abstention. Stale and insufficient
paired histories stop estimation. Gemini's optional priceHistory does not
supply historical volume or spread in the documented timestamp/price entries;
those fields are never fabricated. REST retrieval time is only an observation
time, not proof of the last trade's freshness. A production feed would need
exchange timestamped observations and persistent history. Settled A lacks a
live A quote, so this conservative research runner stops even where the
on-chain market would permit B trading after activation.

For a supplied calibration, rho=clip(intercept+slope*corr(delta pA,delta pB)).
The joint estimate pA*pB+rho*sqrt(pA(1-pA)pB(1-pB)) is projected into the
Frechet interval. Sensitivity uses rhoError plus a sample-size term. This is a
sensitivity envelope, **not** a validated confidence interval for serially
correlated prices. Wide envelopes abstain. The conservative edge calculation
uses the unfavorable end of this envelope, exact BigInt LMSR finite trade
cost, fees (currently zero), rounding, worst permitted slippage, and a network
cost allowance. It multiplies conditional edge by activation probability.
Sizing searches sixteen sizes per direction and checks cash, minimum remaining
cash, total open shares and per-trade limits; exits are considered as well.

Example research calibration file (not a recommendation):

```json
{"slope":0.5,"intercept":0,"rhoError":0.3,"rationale":"Describe independent held-out calibration evidence here"}
```

`CALIBRATION_PATH` enables the heuristic. Supplying this file is an explicit
research assumption; the code cannot validate its scientific justification.
The scenario runner supplies synthetic calibrations to demonstrate behavior.
Different joint distributions can produce identical marginal price paths, so
no estimator of those paths alone can consistently identify the true answer.
The misspecified scenario makes profitable-looking trades with negative true
expected P&L. No informational edge is claimed.

## Historical analogues and copulas

An implemented empirical estimator counts B=YES among genuinely comparable
past A=YES terminal outcomes, requires a minimum sample count and an explicit
exchangeability assumption, and reports a Wilson interval. Synthetic outcome
tables recover known conditional probabilities exactly. No real comparable
terminal-outcome dataset was available, so this estimator is not silently
substituted into the Gemini bot.

A Gaussian copula would use Phi2(Phi^-1(pA),Phi^-1(pB);rho). Its latent rho is
also unidentified from current marginals, and correlation of price changes
cannot defensibly substitute for it. Without paired terminal outcomes or an
independently justified latent model, implementing numerical quadrature would
add precision without evidence. The empirical alternative is implemented;
Gaussian-copula fitting is deliberately deferred rather than given a spurious
calibration. Model validation on real outcomes remains unfulfilled research.

## Simulation interpretation

Reports include true conditional probability, model estimate and envelope,
prices before/after, every trade, zero percentage fees, rounding reserves,
network cost allowance, open exposure, activated expected P&L and both possible
activated realized P&Ls. VOID conditional P&L is exactly zero. Network costs
are separate and nonrefundable. The arithmetic is deterministic, but paper
fills have no latency, competition or transaction-failure model. They are not
performance forecasts. See simulation-results.md for the recorded scenario table.
