import test from "node:test";
import assert from "node:assert/strict";
import {
  validateNetwork,
  DEVNET_GENESIS,
  MAINNET_GENESIS,
  TESTNET_GENESIS,
} from "../client/network.js";

test("network checks pin devnet and reject public clusters behind loopback", () => {
  validateNetwork("devnet", "https://api.devnet.solana.com", DEVNET_GENESIS);
  validateNetwork("localnet", "http://127.0.0.1:8899", "local-genesis");
  for (const genesis of [MAINNET_GENESIS, TESTNET_GENESIS, "local-genesis"])
    assert.throws(() =>
      validateNetwork("devnet", "https://api.devnet.solana.com", genesis),
    );
  for (const genesis of [MAINNET_GENESIS, TESTNET_GENESIS, DEVNET_GENESIS])
    assert.throws(() =>
      validateNetwork("localnet", "http://localhost:8899", genesis),
    );
  for (const rpc of [
    "https://api.mainnet-beta.solana.com",
    "https://api.devnet.solana.com.evil.test",
    "http://api.devnet.solana.com",
  ])
    assert.throws(() => validateNetwork("devnet", rpc, DEVNET_GENESIS));
  assert.throws(() =>
    validateNetwork(
      "mainnet",
      "https://api.mainnet-beta.solana.com",
      MAINNET_GENESIS,
    ),
  );
});
