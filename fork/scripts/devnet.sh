#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SIGNER_PATH:?Set SIGNER_PATH to the existing funded devnet operator signer; never a browser wallet export}"
export SIGNER_PATH="$(realpath "$SIGNER_PATH")"
export RPC_URL=https://api.devnet.solana.com
export ENABLE_DEVNET=yes
export FORK_APP_DIR="${FORK_APP_DIR:-.local/devnet-sol}"
export FORK_SERVICE_PORT="${FORK_SERVICE_PORT:-8787}"
export FORK_SERVICE_URL="http://127.0.0.1:$FORK_SERVICE_PORT"
export NEXT_PUBLIC_SOLANA_CLUSTER=devnet
export NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
export NEXT_DIST_DIR=.next-devnet
npm run contracts:sync
(cd contracts && exec node --import tsx app/service.ts) &
service_pid=$!
trap 'kill "$service_pid" 2>/dev/null || true; wait "$service_pid" 2>/dev/null || true' EXIT
ready=false
for attempt in $(seq 1 90); do
  kill -0 "$service_pid" || { echo 'Devnet service did not start.'; exit 1; }
  if curl -fsS -H 'x-fork-local: 1' "$FORK_SERVICE_URL/config" > /dev/null; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'Devnet service readiness timed out.'; exit 1; fi
echo "Open http://localhost:${PORT:-3100} and connect Phantom on Solana Devnet."
npm run dev -- --hostname 127.0.0.1 --port "${PORT:-3100}"
