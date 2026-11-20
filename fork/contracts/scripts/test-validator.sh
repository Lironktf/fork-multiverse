#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
NO_DNA=1 anchor build
NO_DNA=1 anchor keys sync
NO_DNA=1 anchor build
npm run app:sync
mkdir -p .local
run_dir="$(mktemp -d "$PWD/.local/liquidity-validator.XXXXXX")"
# A unique ledger; never reset a developer's validator or reuse its accounts.
NO_DNA=1 solana-test-validator --ledger "$run_dir/ledger" --rpc-port 18999 --faucet-port 18998 --gossip-port 18997 --dynamic-port-range 19000-19100 --quiet > "$run_dir/validator.log" 2>&1 &
validator_pid=$!
trap 'kill "$validator_pid" 2>/dev/null || true; wait "$validator_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:18999/health > /dev/null 2>&1; then break; fi
  kill -0 "$validator_pid" || { cat "$run_dir/validator.log"; exit 1; }
  sleep 1
done
env -u SIGNER_PATH RPC_URL=http://127.0.0.1:18999 DEPLOY_LOCAL=yes npm run smoke:liquidity | tee "$run_dir/evidence.jsonl"
printf 'Validator log and public transaction evidence: %s\n' "$run_dir"
