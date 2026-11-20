/** Public DTOs only. No signing material or Node imports. */
export interface Instrument {
  ticker: string;
  title: string;
  instrument: string;
  label: string;
  status: string;
  marketState?: string;
  expiry: string;
  rulesUrl: string;
  description?: string;
  termsHash?: string;
  closeTs?: number;
}
export interface MarketBinding {
  ticker: string;
  instrument: string;
  termsHash: string;
  closeTs: number;
  observationTs: number;
}
export interface MarketDescriptor {
  address: string;
  parent: string;
  target: string;
  vault: string;
  bindings: [MarketBinding, MarketBinding];
}
export interface AppConfig {
  program: string;
  config: string;
  mint: string;
  rpc: string;
  genesis: string;
  idlHash: string;
  cluster: "localnet" | "devnet";
}

/** A read-only strategy proposal. Execution always uses a fresh wallet quote. */
export interface StrategyResult {
  market: string;
  owner: string;
  now: number;
  reason: string;
  model: {
    probability: number | null;
    lower: number;
    upper: number;
    samples: number;
    reason: string;
  };
  proposal: null | {
    yes: boolean;
    buy: boolean;
    amount: string;
    quote: string;
    limit: string;
    expectedProfitMicro: number;
    worstModelProfitMicro: number;
  };
}
