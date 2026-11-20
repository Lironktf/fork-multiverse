#!/usr/bin/env bash
# Run a FORK Solana service against devnet.
#   FORK_COLLATERAL=mock (default): mock-USDC instance for "If this happens, buy" rules (port 8788).
#   FORK_COLLATERAL=sol: native devnet SOL instance for the Trade tab (port 8789).
#   - RPC: Helius devnet if ~/.config/helius/api_key exists (mode 600, never in the repo),
#     else the public devnet endpoint (rate-limited: HTTP 429 measured 2026-11-20).
#   - Admin/oracle authority: a pre-funded devnet keypair outside the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
key_file="${HELIUS_KEY_FILE:-$HOME/.config/helius/api_key}"
if [ -r "$key_file" ]; then
  RPC_URL="https://devnet.helius-rpc.com/?api-key=$(cat "$key_file")"
else
  RPC_URL="https://api.devnet.solana.com"
fi
export RPC_URL ENABLE_DEVNET=yes
export FORK_COLLATERAL="${FORK_COLLATERAL:-mock}"
export FORK_ADMIN_KEYPAIR="${FORK_ADMIN_KEYPAIR:-${SIGNER_PATH:-$HOME/.config/solana/fork-devnet-deployer.json}}"
if [ "$FORK_COLLATERAL" = sol ]; then
  export FORK_LOCAL_DIR="${FORK_LOCAL_DIR:-.local/devnet-sol}"
  export FORK_SERVICE_PORT="${FORK_SERVICE_PORT:-8789}"
else
  export FORK_LOCAL_DIR="${FORK_LOCAL_DIR:-.local/devnet}"
  export FORK_SERVICE_PORT="${FORK_SERVICE_PORT:-8788}"
fi
exec npx tsx app/service.ts
