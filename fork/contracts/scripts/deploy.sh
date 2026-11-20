#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cluster="${1:-localnet}"
case "$cluster" in
  localnet) rpc='http://127.0.0.1:8899' ;;
  devnet) rpc='https://api.devnet.solana.com' ;;
  *) echo 'Only localnet and devnet are supported' >&2; exit 1 ;;
esac
: "${SIGNER_PATH:?Set SIGNER_PATH to your funded local/devnet signer}"
if [ ! -f target/deploy/fork_contracts-keypair.json ]; then
  NO_DNA=1 anchor build
fi
# Synchronize the public ID when a clean checkout generated a new local program key.
NO_DNA=1 anchor keys sync
NO_DNA=1 anchor build
NO_DNA=1 solana program deploy --url "$rpc" --keypair "$SIGNER_PATH" --program-id target/deploy/fork_contracts-keypair.json target/deploy/fork_contracts.so

npm run app:sync
