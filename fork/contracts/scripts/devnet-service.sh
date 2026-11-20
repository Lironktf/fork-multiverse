#!/usr/bin/env bash
# SOL-backed service only; the existing funded devnet operator stays outside Next.js.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SIGNER_PATH:?Set SIGNER_PATH to the existing funded devnet operator signer}"
export SIGNER_PATH="$(realpath "$SIGNER_PATH")"
export RPC_URL=https://api.devnet.solana.com
export ENABLE_DEVNET=yes
export FORK_APP_DIR="${FORK_APP_DIR:-.local/devnet-sol}"
export FORK_SERVICE_PORT="${FORK_SERVICE_PORT:-8787}"
exec node --import tsx app/service.ts
