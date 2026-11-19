#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
program_id="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("target/idl/fork_contracts.json")).address)')"
exec solana-test-validator \
  --reset \
  --ledger .local/validator \
  --rpc-port 8899 \
  --bpf-program "$program_id" target/deploy/fork_contracts.so \
  --quiet
