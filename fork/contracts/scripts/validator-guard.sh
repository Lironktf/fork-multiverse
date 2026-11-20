#!/usr/bin/env bash
# Stops the local test validator before its ledger can fill the disk.
# Measured 2026-11-20: an idle solana-test-validator ledger grew ~4 GB/hour
# (rocksdb 6.8 GB after ~1.75 h) and filled this 72 GB server; --limit-ledger-size
# is clamped to a 50M-shred minimum, so it does not bound growth at this scale.
# ASSUMPTION: 2 GB ledger / 4 GB free disk are safe limits for a shared server.
set -u
LEDGER="${1:?usage: validator-guard.sh LEDGER_DIR}"
MAX_MB="${FORK_LEDGER_MAX_MB:-2048}"
MIN_FREE_MB="${FORK_MIN_FREE_MB:-4096}"
while sleep 60; do
  used=$(du -sm "$LEDGER" 2>/dev/null | cut -f1)
  free=$(df -Pm "$LEDGER" | awk 'NR==2{print $4}')
  if [ "${used:-0}" -gt "$MAX_MB" ] || [ "${free:-0}" -lt "$MIN_FREE_MB" ]; then
    echo "$(date -u +%FT%TZ) validator-guard: ledger ${used}MB, free ${free}MB; stopping validator" >&2
    for p in $(pgrep -x solana-test-val); do kill "$p"; done
    exit 0
  fi
done
