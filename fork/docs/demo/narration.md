# FORK demo — voiceover script

For [`fork-demo.mp4`](fork-demo.mp4) (3:12). Timestamps match the on-screen captions in the
final cut. Pace is about 2.5 words per second, so each line fits its segment with a breath
to spare. Lines in *italics* are optional if you run long.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 – 0:08 | Welcome screen | This is FORK: a multiverse engine for conditional forecasting, built on live Gemini prediction markets. |
| 0:08 – 0:20 | Picking a live market | You start with a question you care about. Every probability you see here is a live Gemini market price. We pick: will Bitcoin be above sixty-two thousand five hundred on November thirtieth? |
| 0:20 – 0:24 | Origin + odds chart | This is Origin, reality today. The market says just under even odds, and here's how that moved. |
| 0:24 – 0:32 | Searching "iran" | Search reads titles, outcomes and the actual resolution rules, so "Iran" finds the related markets even though there's no Iran market. |
| 0:32 – 0:52 | Building the basket | Now the interesting part: we change the assumptions. Let's assume ETH holds seventeen-fifty, and the Fed hikes in December. Each assumption is itself a live Gemini market. *We drag them into the basket.* |
| 0:52 – 0:56 | FORK REALITY animation | Then we fork reality, into a world where both are true. |
| 0:56 – 1:12 | Analysis starts | Claude, Codex and Grok each research the web in parallel. Then four analysts with different roles estimate the odds in this world, blind to each other. |
| 1:12 – 1:24 | "Analysing… (sped up)" | That takes about a minute in real time, so we've sped it up. *Nothing here is pre-recorded: these are live model calls.* |
| 1:24 – 1:32 | 66% vs market 48% | In this world, the analysts say sixty-six percent, against the market's forty-eight. That eighteen-point gap is what these assumptions are worth. |
| 1:32 – 1:36 | Dashed line on chart | The dashed line is this world's estimate, over Gemini's real price history. |
| 1:36 – 1:48 | Analysts and sources | Every analyst explains its reasoning, labelled with the model that actually answered, along with the sources the research found. *When they disagree, FORK shows the disagreement instead of hiding it.* |
| 1:48 – 2:00 | "If this happens, buy" card | So what if you disagree with the market? Say: if ETH above seventeen-fifty reaches forty-five percent, buy six shares of Bitcoin above sixty-two-five, on Solana. |
| 2:00 – 2:08 | Arming | Arming registers the exact Gemini contracts on Solana devnet, escrows the maximum cost, and starts watching ETH's odds. |
| 2:08 – 2:12 | "Bought" | The line was crossed, so it bought: a real devnet transaction. |
| 2:12 – 2:20 | ⚡ top-bar list | Every if-then buy, waiting or filled, lives up here. And if ETH ends below seventeen-fifty, the bet is cancelled and everyone is refunded. |
| 2:20 – 2:32 | Compare | Compare puts two worlds side by side: what changed between them, and why each one reads the way it does. |
| 2:32 – 2:52 | Atlas | Atlas maps how Gemini markets connect. Pick a market, and you see the ones that move with it. *You can fork straight from the map.* |
| 2:52 – 3:00 | Related markets | Each link shows the mechanism that connects them, ranked by the models, never invented. |
| 3:00 – 3:04 | Closing caption | Ask a question, change reality, see what the models think, and act on it on Solana. |
| 3:04 – 3:12 | End card | *(Optional; the card speaks for itself.)* That's FORK. The program and this trade are on Solana devnet; the links are on screen. |

## Honesty notes for Q&A

- Markets and prices are live Gemini data. The forecasts were live Claude, Codex and Grok
  calls on the day of recording. In that run Grok missed the research cut-off, so the
  research merged Claude and Codex; Grok still answered as an analyst.
- The trade is real on Solana **devnet** with mock USDC, not mainnet money. FORK's service
  acts as the oracle, reporting the Gemini result on-chain.
- Edits: the ~70 s analysis wait is sped up 7× and typing 1.4×. The Solana explorer page
  was cut (it blocks automated browsers), so the end card shows the signature to verify.
