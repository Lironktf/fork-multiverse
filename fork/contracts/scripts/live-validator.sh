#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
NO_DNA=1 anchor build
mkdir -p .local
program_id="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("target/idl/fork_contracts.json")).address)')"
exec solana-test-validator \
  --ledger .local/live-validator \
  --rpc-port 8899 \
  --limit-ledger-size 1000000 \
  --bpf-program "$program_id" target/deploy/fork_contracts.so \
  --quiet
