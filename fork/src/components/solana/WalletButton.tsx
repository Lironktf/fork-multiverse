"use client";
import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Wallet, LogOut, Droplets, ExternalLink } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useUI } from "@/store/ui";
import { SOLANA_CLUSTER } from "./SolanaProvider";

export const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export function WalletButton({ showLabel = false }: { showLabel?: boolean }) {
  const {
    wallets,
    wallet,
    publicKey,
    connected,
    connecting,
    select,
    connect,
    disconnect,
  } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const installed = wallets.filter(
    (w) =>
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable,
  );

  useEffect(() => {
    if (!publicKey) return setBalance(null);
    let live = true;
    const subscription = connection.onAccountChange(
      publicKey,
      (account) => live && setBalance(account.lamports / LAMPORTS_PER_SOL),
      "confirmed",
    );
    connection
      .getBalance(publicKey, "confirmed")
      .then((b) => live && setBalance(b / LAMPORTS_PER_SOL))
      .catch(() => live && setBalance(null));
    return () => {
      live = false;
      void connection.removeAccountChangeListener(subscription).catch(() => {});
    };
  }, [publicKey, connection, busy]);

  useEffect(() => {
    if (wallet && !connected && !connecting) connect().catch(() => {});
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  // The devnet RPC faucet now returns 410 ("faucet is closed"); point to the official web faucet instead.
  const getSol = async () => {
    if (!publicKey) return;
    if (SOLANA_CLUSTER === "localnet") {
      useUI
        .getState()
        .toast(
          "Fund this wallet from your local validator using solana airdrop.",
        );
      return;
    }
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      useUI
        .getState()
        .toast("Address copied. Paste it into the Solana devnet faucet.");
    } catch {
      /* clipboard may be blocked; the faucet still opens */
    }
    window.open("https://faucet.solana.com", "_blank", "noopener");
    setBusy((b) => !b); // refresh balance when the user returns
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="ibtn"
          aria-label={
            connected && publicKey
              ? `Wallet ${short(publicKey.toBase58())}`
              : "Connect wallet"
          }
          title={`Solana wallet (${SOLANA_CLUSTER})`}
          data-active={connected}
        >
          <Wallet size={14} />
          {showLabel && !connected && <span>Connect wallet</span>}
          {connected && publicKey && (
            <span className="num hidden text-[10.5px] md:inline">
              {short(publicKey.toBase58())}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="surface z-50 w-[290px] p-3.5 text-[11.5px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink">
              Solana wallet
            </span>
            <span className="tag tag-custom">{SOLANA_CLUSTER}</span>
          </div>
          {connected && publicKey ? (
            <>
              <div className="num mt-3 break-all text-[11px] text-ink-2">
                {publicKey.toBase58()}
              </div>
              <div className="mt-2 flex items-center justify-between text-ink-3">
                <span>{wallet?.adapter.name}</span>
                <span className="num text-ink-2">
                  {balance === null ? "—" : `${balance.toFixed(3)} SOL`}
                </span>
              </div>
              <div className="mt-3 flex gap-1.5">
                <button className="btn !h-7 !text-[11px]" onClick={getSol}>
                  <Droplets size={12} />{" "}
                  {SOLANA_CLUSTER === "localnet"
                    ? "Get local SOL"
                    : "Get devnet SOL"}
                </button>
                <button
                  className="btn !h-7 !text-[11px]"
                  onClick={() => disconnect()}
                >
                  <LogOut size={12} /> Disconnect
                </button>
              </div>
            </>
          ) : installed.length ? (
            <ul className="mt-3 flex flex-col gap-1">
              {installed.map((w) => (
                <li key={w.adapter.name}>
                  <button
                    className="flex w-full items-center gap-2.5 rounded-md border border-line px-2.5 py-2 text-left text-ink hover:border-line-2 hover:bg-white/[0.03]"
                    onClick={() => {
                      select(w.adapter.name);
                    }}
                  >
                    {/* wallet-provided icon (data URI from the wallet itself) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.adapter.icon} alt="" width={18} height={18} />
                    {w.adapter.name}
                    {connecting && wallet?.adapter.name === w.adapter.name && (
                      <span className="ml-auto text-[10px] text-ink-3">
                        connecting…
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 leading-relaxed text-ink-3">
              No Solana wallet detected in this browser. Install a Wallet
              Standard wallet (e.g.{" "}
              <a
                className="text-accent hover:underline"
                href="https://phantom.com"
                target="_blank"
                rel="noreferrer"
              >
                Phantom <ExternalLink size={9} className="inline" />
              </a>
              ) and switch it to {SOLANA_CLUSTER} to transact onchain.
              Everything else works without a wallet.
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
