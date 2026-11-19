import type { Page } from "@playwright/test";
import { Keypair, Transaction } from "@solana/web3.js";

/** Test-only Wallet Standard bridge. Private keys remain in the Node test process. */
export async function installLocalWallet(page: Page) {
  const signers = [Keypair.generate(), Keypair.generate()];
  let rejectNext = false;
  await page.exposeFunction(
    "forkTestSign",
    (address: string, bytes: number[]) => {
      if (rejectNext) {
        rejectNext = false;
        throw new Error("User rejected transaction");
      }
      const signer = signers.find(
        (key) => key.publicKey.toBase58() === address,
      );
      if (!signer) throw new Error("Unknown test wallet");
      const tx = Transaction.from(Buffer.from(bytes));
      tx.partialSign(signer);
      return Array.from(tx.serialize());
    },
  );
  await page.addInitScript(
    (identities) => {
      const bridge = window as unknown as {
        forkTestSign: (address: string, bytes: number[]) => Promise<number[]>;
        forkTestSwitch: (index: number) => void;
      };
      let index = Number(sessionStorage.getItem("fork-test-account") ?? "0");
      let connected = sessionStorage.getItem("fork-test-connected") === "1";
      const accounts = identities.map((id) => ({
        address: id.address,
        publicKey: new Uint8Array(id.bytes),
        chains: ["solana:localnet", "solana:devnet"],
        features: ["solana:signTransaction"],
      }));
      const listeners = new Set<
        (properties: { accounts: typeof accounts }) => void
      >();
      const emit = () =>
        listeners.forEach((fn) => fn({ accounts: wallet.accounts }));
      const wallet = {
        version: "1.0.0",
        name: "Fork verification wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjOWRmZmNiIi8+PC9zdmc+",
        chains: ["solana:localnet", "solana:devnet"],
        get accounts() {
          return connected ? [accounts[index]] : [];
        },
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              connected = true;
              sessionStorage.setItem("fork-test-connected", "1");
              emit();
              return { accounts: wallet.accounts };
            },
          },
          "standard:disconnect": {
            version: "1.0.0",
            disconnect: async () => {
              connected = false;
              sessionStorage.removeItem("fork-test-connected");
              emit();
            },
          },
          "standard:events": {
            version: "1.0.0",
            on: (
              _event: string,
              callback: (properties: { accounts: typeof accounts }) => void,
            ) => {
              listeners.add(callback);
              return () => listeners.delete(callback);
            },
          },
          "solana:signTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signTransaction: async (
              ...inputs: {
                transaction: Uint8Array;
                account: { address: string };
              }[]
            ) =>
              Promise.all(
                inputs.map(async (input) => ({
                  signedTransaction: new Uint8Array(
                    await bridge.forkTestSign(input.account.address, [
                      ...input.transaction,
                    ]),
                  ),
                })),
              ),
          },
        },
      };
      bridge.forkTestSwitch = (next: number) => {
        index = next;
        sessionStorage.setItem("fork-test-account", String(next));
        emit();
      };
      const register = (api: { register: (wallet: unknown) => void }) =>
        api.register(wallet);
      window.addEventListener("wallet-standard:app-ready", (event) =>
        register((event as CustomEvent).detail),
      );
      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", {
          detail: register,
        }),
      );
    },
    signers.map((signer) => ({
      address: signer.publicKey.toBase58(),
      bytes: [...signer.publicKey.toBytes()],
    })),
  );
  return {
    signers,
    reject: () => {
      rejectNext = true;
    },
    switchAccount: (index: number) =>
      page.evaluate(
        (i) =>
          (
            window as unknown as { forkTestSwitch: (index: number) => void }
          ).forkTestSwitch(i),
        index,
      ),
  };
}
