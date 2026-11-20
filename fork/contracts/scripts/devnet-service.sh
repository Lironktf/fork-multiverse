#!/usr/bin/env bash
# Run the FORK Solana service against devnet.
#   - RPC: Helius devnet if ~/.config/helius/api_key exists (mode 600, never in the repo),
#     else the public devnet endpoint (rate-limited: HTTP 429 measured 2026-11-20).
#   - Admin/oracle/mock-mint authority: a pre-funded devnet keypair outside the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
key_file="${HELIUS_KEY_FILE:-$HOME/.config/helius/api_key}"
if [ -r "$key_file" ]; then
  RPC_URL="https://devnet.helius-rpc.com/?api-key=$(cat "$key_file")"
else
  RPC_URL="https://api.devnet.solana.com"
fi
export RPC_URL ENABLE_DEVNET=yes
export FORK_ADMIN_KEYPAIR="${FORK_ADMIN_KEYPAIR:-$HOME/.config/solana/fork-devnet-deployer.json}"
export FORK_LOCAL_DIR="${FORK_LOCAL_DIR:-.local/devnet}"
export FORK_SERVICE_PORT="${FORK_SERVICE_PORT:-8788}"
exec npx tsx app/service.ts
