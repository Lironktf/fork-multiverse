"use client";
/**
 * Solana devnet integration. Wallets are discovered through the Wallet
 * Standard (Phantom, Solflare, Backpack… register themselves), so no
 * wallet-specific packages are bundled.
 */
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";

export const SOLANA_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as "devnet" | "testnet";
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl(SOLANA_CLUSTER);
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${SOLANA_CLUSTER}`;

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={[]} autoConnect onError={(e) => console.warn("[fork] wallet", e.name, e.message)}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
