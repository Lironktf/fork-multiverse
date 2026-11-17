/**
 * DEMONSTRATION dataset.
 *
 * Every event here is hypothetical and every probability is ILLUSTRATIVE —
 * hand-authored so the full product journey works without credentials.
 * Nothing in this file is market data or a model result; the UI labels it DEMO.
 */
import type { ForkEvent } from "@/lib/domain/types";

const yn = ["YES", "NO"];

const demo = (e: Omit<ForkEvent, "source" | "externalMarketId" | "eventType" | "possibleOutcomes"> & {
  possibleOutcomes?: string[];
}): ForkEvent => ({
  source: "demo",
  externalMarketId: null,
  eventType: e.possibleOutcomes && e.possibleOutcomes.length > 2 ? "categorical" : "binary",
  possibleOutcomes: e.possibleOutcomes ?? yn,
  ...e,
});

/** Targets: events whose probability the demo engine knows how to condition. */
export const DEMO_TARGETS: ForkEvent[] = [
  demo({
    id: "demo-btc-150k-2027",
    title: "Bitcoin above $150,000 by December 2027",
    description: "Hypothetical target: BTC/USD trades above $150,000 at any point before 31 Dec 2027.",
    category: "crypto",
    resolutionCriteria: "Resolves YES if a major USD spot index prints above $150,000 before 2027-12-31 23:59 UTC.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.35, tags: ["bitcoin", "btc", "price"] },
  }),
  demo({
    id: "demo-eth-8k-2027",
    title: "Ethereum above $8,000 by December 2027",
    description: "Hypothetical target: ETH/USD trades above $8,000 at any point before 31 Dec 2027.",
    category: "crypto",
    resolutionCriteria: "Resolves YES if a major USD spot index prints above $8,000 before 2027-12-31 23:59 UTC.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.22, tags: ["ethereum", "eth", "price"] },
  }),
  demo({
    id: "demo-spx-up-2027",
    title: "S&P 500 finishes 2027 higher than it started",
    description: "Hypothetical target: the S&P 500 index closes 2027 above its first close of 2027.",
    category: "markets",
    resolutionCriteria: "Compares the official closing levels of the first and last trading days of 2027.",
    resolutionDate: "2027-12-31T21:00:00.000Z",
    metadata: { demoBaseline: 0.64, tags: ["equities", "spx", "stocks"] },
  }),
  demo({
    id: "demo-ai-law-2027",
    title: "US federal AI legislation signed into law by end of 2027",
    description: "Hypothetical target: a federal statute primarily regulating frontier AI systems is signed.",
    category: "ai",
    resolutionCriteria: "Resolves YES if the President signs a bill whose principal subject is AI model development or deployment.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.24, tags: ["ai", "regulation", "policy"] },
  }),
];

/** Assumption candidates — the "library of possible futures". */
export const DEMO_EVENTS: ForkEvent[] = [
  demo({
    id: "demo-fed-cuts-100",
    title: "Federal Reserve cuts rates 100bp+ during 2027",
    description: "Cumulative cuts to the federal funds target of at least 100 basis points across 2027.",
    category: "macro",
    resolutionCriteria: "Upper bound of the FOMC target range on 2027-12-31 is ≥1.00pp below its 2027-01-01 level.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.38, tags: ["fed", "rates", "fomc"] },
  }),
  demo({
    id: "demo-crypto-etf",
    title: "Major new crypto ETF approved",
    description: "A US regulator approves a large new class of crypto exchange-traded products (e.g. multi-asset with staking).",
    category: "crypto",
    resolutionCriteria: "Approval order published for a crypto ETP class not previously trading in the US.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.55, tags: ["etf", "sec"] },
  }),
  demo({
    id: "demo-us-recession",
    title: "United States enters recession in 2027",
    description: "NBER-dated recession beginning in calendar 2027.",
    category: "macro",
    resolutionCriteria: "NBER Business Cycle Dating Committee dates a peak in 2027 (resolution may lag).",
    resolutionDate: "2028-06-30T00:00:00.000Z",
    metadata: { demoBaseline: 0.27, exclusiveWith: ["demo-soft-landing"], tags: ["recession", "gdp"] },
  }),
  demo({
    id: "demo-soft-landing",
    title: "Soft landing: core inflation < 2.5% with unemployment < 4.5%",
    description: "At end of 2027, core PCE inflation is below 2.5% and unemployment is below 4.5%.",
    category: "macro",
    resolutionCriteria: "December 2027 core PCE YoY < 2.5% and unemployment rate < 4.5% (BEA / BLS).",
    resolutionDate: "2028-01-31T00:00:00.000Z",
    metadata: { demoBaseline: 0.33, exclusiveWith: ["demo-us-recession", "demo-inflation-4"], tags: ["inflation"] },
  }),
  demo({
    id: "demo-exchange-collapse",
    title: "A top-10 crypto exchange collapses",
    description: "A top-10 exchange by spot volume halts withdrawals and enters insolvency proceedings.",
    category: "crypto",
    resolutionCriteria: "Withdrawals halted > 7 days plus a bankruptcy or insolvency filing, before 2027-12-31.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.08, tags: ["exchange", "insolvency"] },
  }),
  demo({
    id: "demo-market-structure-law",
    title: "US crypto market-structure law enacted",
    description: "Comprehensive digital-asset market-structure legislation is signed into law.",
    category: "politics",
    resolutionCriteria: "Signed by the President before 2027-12-31.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.4, tags: ["regulation", "congress", "clarity"] },
  }),
  demo({
    id: "demo-sbr-purchases",
    title: "US government buys bitcoin on the open market",
    description: "The US Treasury or a federal reserve fund makes open-market BTC purchases (not forfeiture transfers).",
    category: "politics",
    resolutionCriteria: "Official confirmation of open-market purchases before 2027-12-31.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.12, tags: ["reserve", "treasury"] },
  }),
  demo({
    id: "demo-inflation-4",
    title: "US CPI inflation re-accelerates above 4%",
    description: "Headline CPI year-over-year prints above 4.0% at any point in 2027.",
    category: "macro",
    resolutionCriteria: "Any BLS CPI-U YoY release for a 2027 month above 4.0%.",
    resolutionDate: "2028-01-15T00:00:00.000Z",
    metadata: { demoBaseline: 0.18, exclusiveWith: ["demo-soft-landing"], tags: ["cpi", "inflation"] },
  }),
  demo({
    id: "demo-oil-120",
    title: "Brent crude above $120 for a full month",
    description: "Monthly average Brent front-month above $120/bbl in any month of 2027.",
    category: "energy",
    resolutionCriteria: "EIA monthly average Brent spot price > $120 for any 2027 month.",
    resolutionDate: "2028-01-31T00:00:00.000Z",
    metadata: { demoBaseline: 0.1, tags: ["oil", "brent"] },
  }),
  demo({
    id: "demo-taiwan-blockade",
    title: "Naval blockade of Taiwan begins",
    description: "PRC forces impose a blockade or quarantine restricting commercial shipping to Taiwan.",
    category: "geopolitics",
    resolutionCriteria: "Two of: US State Dept, Reuters, AP describe an active blockade/quarantine before 2027-12-31.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.05, tags: ["china", "taiwan", "shipping"] },
  }),
  demo({
    id: "demo-ai-capex-cut",
    title: "Hyperscalers cut AI capex by 20%+",
    description: "Combined 2027 capex guidance of the four largest US cloud providers falls ≥20% vs 2026.",
    category: "ai",
    resolutionCriteria: "Sum of reported 2027 capex vs 2026 for MSFT, GOOGL, AMZN, META.",
    resolutionDate: "2028-02-28T00:00:00.000Z",
    metadata: { demoBaseline: 0.12, tags: ["ai", "capex", "datacenter"] },
  }),
  demo({
    id: "demo-ai-incident",
    title: "Major AI-caused incident triggers congressional hearings",
    description: "A widely reported AI-attributed incident (financial, cyber or safety) leads to dedicated hearings.",
    category: "ai",
    resolutionCriteria: "A House or Senate committee holds a hearing explicitly about the incident.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.3, tags: ["ai", "safety"] },
  }),
  demo({
    id: "demo-dollar-weak",
    title: "US Dollar Index falls below 90",
    description: "DXY closes below 90.0 on any trading day of 2027.",
    category: "markets",
    resolutionCriteria: "ICE DXY daily close < 90.0 in 2027.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.2, tags: ["dollar", "dxy", "fx"] },
  }),
  demo({
    id: "demo-stablecoin-500b",
    title: "Stablecoin supply exceeds $500B",
    description: "Total fiat-backed stablecoin market capitalisation exceeds $500 billion.",
    category: "crypto",
    resolutionCriteria: "Any daily reading above $500B on a major public stablecoin tracker in 2027.",
    resolutionDate: "2027-12-31T23:59:00.000Z",
    metadata: { demoBaseline: 0.35, tags: ["stablecoin", "usdc", "usdt"] },
  }),
];

export const ALL_DEMO_EVENTS = [...DEMO_TARGETS, ...DEMO_EVENTS];

/**
 * Illustrative effects: log-odds shift on P(target = YES) when the event
 * resolves YES, per analyst role [causal, empirical, market, skeptic].
 * A NO resolution applies a dampened opposite shift (see demo engine).
 * These are authored narratives, not estimates.
 */
export interface DemoEffect {
  d: [number, number, number, number];
  why: string;
  /** Skeptic's competing premise, when it reads the mechanism differently */
  skeptic?: string;
}

type EffectTable = Record<string, Record<string, DemoEffect>>;

export const DEMO_EFFECTS: EffectTable = {
  "demo-btc-150k-2027": {
    "demo-fed-cuts-100": {
      d: [0.75, 0.45, 0.6, -0.45],
      why: "Lower policy rates ease dollar liquidity and lift long-duration risk assets.",
      skeptic: "Cuts of 100bp+ usually arrive because growth is breaking — risk assets fall first.",
    },
    "demo-crypto-etf": {
      d: [0.55, 0.4, 0.7, 0.15],
      why: "New ETF wrappers widen the buyer base and channel structural inflows.",
      skeptic: "Approval is largely anticipated and priced; flows may rotate rather than add.",
    },
    "demo-us-recession": {
      d: [-0.9, -0.7, -0.8, -0.5],
      why: "Recessions compress risk appetite; BTC has traded as a high-beta risk asset.",
    },
    "demo-soft-landing": {
      d: [0.6, 0.4, 0.5, 0.2],
      why: "Disinflation without job losses allows easing while earnings and risk appetite hold.",
    },
    "demo-exchange-collapse": {
      d: [-1.1, -0.9, -1.0, -0.6],
      why: "Counterparty failure forces deleveraging and damages new-entrant trust.",
    },
    "demo-market-structure-law": {
      d: [0.5, 0.3, 0.55, 0.1],
      why: "Regulatory clarity lowers the compliance barrier for banks and advisors.",
      skeptic: "Clarity also formalises restrictions; the headline effect may be modest.",
    },
    "demo-sbr-purchases": {
      d: [1.0, 0.6, 1.1, 0.5],
      why: "A sovereign price-insensitive buyer changes the supply-demand balance and signals legitimacy.",
    },
    "demo-inflation-4": {
      d: [-0.45, -0.5, -0.55, 0.2],
      why: "Re-accelerating inflation keeps real rates high and delays easing.",
      skeptic: "Persistent inflation is exactly the debasement narrative BTC holders cite.",
    },
    "demo-oil-120": {
      d: [-0.35, -0.3, -0.4, -0.1],
      why: "An energy shock tightens financial conditions and squeezes risk budgets.",
    },
    "demo-taiwan-blockade": {
      d: [-0.7, -0.5, -0.8, 0.1],
      why: "A major geopolitical shock triggers a dash for dollars and de-risking.",
      skeptic: "Capital-flight demand for seizure-resistant assets could partially offset.",
    },
    "demo-ai-capex-cut": {
      d: [-0.3, -0.2, -0.35, -0.05],
      why: "An AI-capex retrenchment would hit growth equities and spill into crypto beta.",
    },
    "demo-dollar-weak": {
      d: [0.55, 0.45, 0.5, 0.25],
      why: "A weak dollar historically coincides with strong USD-denominated BTC returns.",
    },
    "demo-stablecoin-500b": {
      d: [0.45, 0.35, 0.5, 0.1],
      why: "Stablecoin growth is on-chain dry powder and a proxy for crypto liquidity.",
      skeptic: "Stablecoin growth may reflect payments use, not speculative demand.",
    },
  },
  "demo-eth-8k-2027": {
    "demo-fed-cuts-100": { d: [0.7, 0.4, 0.55, -0.5], why: "Easier money supports high-beta crypto assets.", skeptic: "Deep cuts signal stress; ETH's beta cuts both ways." },
    "demo-crypto-etf": { d: [0.7, 0.45, 0.8, 0.2], why: "Staking-enabled ETF products make ETH yield accessible to institutions." },
    "demo-us-recession": { d: [-1.0, -0.8, -0.9, -0.6], why: "Recession de-risks portfolios; ETH has higher drawdowns than BTC." },
    "demo-soft-landing": { d: [0.6, 0.4, 0.5, 0.15], why: "Benign macro supports risk appetite and on-chain activity." },
    "demo-exchange-collapse": { d: [-1.2, -0.9, -1.1, -0.7], why: "Contagion and forced liquidations hit ETH collateral hardest." },
    "demo-market-structure-law": { d: [0.65, 0.35, 0.6, 0.15], why: "Clarity on token classification de-risks ETH for institutions." },
    "demo-sbr-purchases": { d: [0.4, 0.2, 0.45, -0.1], why: "Sovereign BTC buying lifts the sector, though it may concentrate flows in BTC.", skeptic: "A BTC-only reserve could widen the BTC/ETH dominance gap." },
    "demo-stablecoin-500b": { d: [0.6, 0.45, 0.65, 0.3], why: "Most stablecoin activity settles on Ethereum and its rollups." },
    "demo-dollar-weak": { d: [0.5, 0.4, 0.5, 0.2], why: "Dollar weakness supports USD-denominated crypto prices." },
    "demo-ai-capex-cut": { d: [-0.3, -0.2, -0.3, 0.0], why: "Growth-asset retrenchment spills into crypto." },
    "demo-inflation-4": { d: [-0.5, -0.5, -0.55, 0.0], why: "Higher-for-longer rates weigh on long-duration assets." },
  },
  "demo-spx-up-2027": {
    "demo-fed-cuts-100": { d: [0.4, 0.15, 0.3, -0.6], why: "Lower discount rates support equity multiples.", skeptic: "Historically, deep cutting cycles have often coincided with equity drawdowns." },
    "demo-us-recession": { d: [-1.1, -0.9, -1.0, -0.7], why: "Earnings contract in recessions; most recessions coincide with down years." },
    "demo-soft-landing": { d: [0.8, 0.6, 0.7, 0.3], why: "Soft landings preserve earnings while allowing easing." },
    "demo-ai-capex-cut": { d: [-0.8, -0.5, -0.9, -0.3], why: "AI capex has been a major driver of index-level earnings growth." },
    "demo-oil-120": { d: [-0.6, -0.6, -0.5, -0.3], why: "Oil shocks have preceded several post-war slowdowns." },
    "demo-taiwan-blockade": { d: [-1.2, -0.8, -1.3, -0.9], why: "Semiconductor supply disruption would hit the index's largest weights." },
    "demo-inflation-4": { d: [-0.5, -0.45, -0.6, -0.2], why: "Inflation forces tighter policy and compresses multiples." },
    "demo-dollar-weak": { d: [0.3, 0.2, 0.25, 0.0], why: "A weaker dollar boosts multinational earnings translation." },
  },
  "demo-ai-law-2027": {
    "demo-ai-incident": { d: [1.0, 0.6, 0.3, 0.4], why: "Salient incidents historically catalyse legislative windows." },
    "demo-ai-capex-cut": { d: [-0.2, -0.1, -0.1, 0.2], why: "A cooling sector lowers urgency.", skeptic: "A weaker industry has less lobbying leverage to block rules." },
    "demo-us-recession": { d: [-0.3, -0.25, -0.1, -0.2], why: "Recessions crowd out non-economic legislation." },
    "demo-taiwan-blockade": { d: [0.3, 0.1, 0.1, -0.3], why: "A security shock could fold AI controls into defence legislation.", skeptic: "Crisis agendas tend to sideline standalone tech regulation." },
    "demo-market-structure-law": { d: [0.2, 0.15, 0.1, 0.0], why: "Passing complex tech legislation signals a functioning committee pipeline." },
  },
};

/** Curated example targets shown on the first screen. */
export const FEATURED_TARGET_IDS = ["demo-btc-150k-2027", "demo-spx-up-2027", "demo-ai-law-2027"];
