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
  cluster: "localnet";
}
