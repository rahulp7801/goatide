#!/usr/bin/env bash
#
# scripts/visual-ceremony.sh — Phase 11 Plan 11-00 Task 2 top-level driver.
#
# Thin wrapper: delegates to scripts/test/visual-ceremony-cdp.cjs with passthrough args
# so callers can do:
#   bash scripts/visual-ceremony.sh                    # run all registered VIS-* surfaces
#   bash scripts/visual-ceremony.sh --only VIS-09      # single-surface filter
#   bash scripts/visual-ceremony.sh --waves 1,2        # wave-number filter
#   HARNESS_TIMEOUT_MS=300000 bash scripts/visual-ceremony.sh ...   # override 600s deadline

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"
exec node scripts/test/visual-ceremony-cdp.cjs "$@"
