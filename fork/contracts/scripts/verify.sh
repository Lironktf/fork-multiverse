#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
NO_DNA=1 anchor build
npm run typecheck
npm test
cargo test --locked -- --nocapture
npm run format:check
