export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const TESTNET_GENESIS = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";

export function validateNetwork(cluster: string, rpc: string, genesis: string) {
  const url = new URL(rpc);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (cluster === "devnet") {
    if (
      url.protocol !== "https:" ||
      url.hostname !== "api.devnet.solana.com" ||
      genesis !== DEVNET_GENESIS
    )
      throw new Error(
        "Devnet requires the official HTTPS RPC and devnet genesis hash.",
      );
  } else if (cluster === "localnet") {
    if (
      !loopback ||
      !["http:", "https:"].includes(url.protocol) ||
      [DEVNET_GENESIS, MAINNET_GENESIS, TESTNET_GENESIS].includes(genesis)
    )
      throw new Error(
        "Localnet requires a local validator, not a proxy to a public cluster.",
      );
  } else throw new Error("Only localnet and devnet are supported.");
}
