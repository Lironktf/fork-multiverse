#!/usr/bin/env bash
# Devnet demo: mock-USDC service (if-then rules, :8788), native-SOL service (Trade tab, :8789)
# and the frontend. Both services share one funded operator kept outside the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
export SIGNER_PATH="${SIGNER_PATH:-$HOME/.config/solana/fork-devnet-deployer.json}"
[ -r "$SIGNER_PATH" ] || { echo "Set SIGNER_PATH to the funded devnet operator signer; never a browser wallet export"; exit 1; }
npm run contracts:sync
FORK_COLLATERAL=mock bash contracts/scripts/devnet-service.sh & mock_pid=$!
FORK_COLLATERAL=sol bash contracts/scripts/devnet-service.sh & sol_pid=$!
trap 'kill "$mock_pid" "$sol_pid" 2>/dev/null || true' EXIT
export FORK_LOCAL_SERVICE=http://127.0.0.1:8788 FORK_SOL_SERVICE=http://127.0.0.1:8789
for url in "$FORK_LOCAL_SERVICE" "$FORK_SOL_SERVICE"; do
  for attempt in $(seq 1 90); do
    kill -0 "$mock_pid" "$sol_pid" || { echo 'A devnet service did not start.'; exit 1; }
    curl -fsS -H 'x-fork-local: 1' "$url/config" > /dev/null && break
    [ "$attempt" = 90 ] && { echo "Devnet service readiness timed out: $url"; exit 1; }
    sleep 1
  done
done
export NEXT_PUBLIC_SOLANA_CLUSTER=devnet NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
echo "Open http://localhost:${PORT:-3100} and connect Phantom on Solana Devnet."
npm run dev -- --hostname 127.0.0.1 --port "${PORT:-3100}"
