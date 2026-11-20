#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
NO_DNA=1 anchor build
mkdir -p .local
program_id="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("target/idl/fork_contracts.json")).address)')"
# Dedicated persistent ledger. Never reset another demo's state.
exec env NO_DNA=1 solana-test-validator \
  --ledger "${FORK_VALIDATOR_LEDGER:-.local/app-validator}" \
  --rpc-port "${FORK_RPC_PORT:-8899}" \
  --faucet-port "${FORK_FAUCET_PORT:-9900}" \
  --gossip-port "${FORK_GOSSIP_PORT:-8001}" \
  --dynamic-port-range "${FORK_DYNAMIC_PORT_RANGE:-8002-8030}" \
  --bind-address 127.0.0.1 \
  --limit-ledger-size 1000000 \
  --bpf-program "$program_id" target/deploy/fork_contracts.so \
  --quiet
