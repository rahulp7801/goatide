#!/usr/bin/env bash
#
# scripts/visual-ceremony.sh — Phase 11 Plan 11-00 Task 2 top-level driver.
#
# Two modes:
#   1. Filtered invocation (--only <id> or --waves <list>): delegate to the .cjs harness
#      with the filter; runs in a single Electron launch.
#   2. Unfiltered (full sweep): run each wave (0..4) in a SEPARATE Electron launch.
#      Per-wave isolation is the accepted closure mechanism per ROADMAP SC #3 and
#      11-EVIDENCE.md — single-launch full sweep historically hit Wave-3 cross-state
#      interference (auth-security.md saves not routing through the save-gate in
#      multi-group multi-webview state). Per-wave invocation works deterministically.
#
# Usage:
#   bash scripts/visual-ceremony.sh                    # full sweep (per-wave launches)
#   bash scripts/visual-ceremony.sh --only VIS-09      # single-surface filter
#   bash scripts/visual-ceremony.sh --waves 1,2        # wave-number filter
#   HARNESS_TIMEOUT_MS=300000 bash scripts/visual-ceremony.sh ...

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

# Detect filtered vs unfiltered invocation. Any --only or --waves arg means single-launch.
IS_FILTERED=0
for arg in "$@"; do
	case "$arg" in
		--only|--only=*|--waves|--waves=*)
			IS_FILTERED=1
			;;
	esac
done

if [[ "$IS_FILTERED" == "1" ]]; then
	exec node scripts/test/visual-ceremony-cdp.cjs "$@"
fi

# Unfiltered full sweep: run each wave in its own Electron launch. Accumulate
# pass/fail tallies and exit non-zero if any wave failed.
WAVES=(0 1 2 3 4)
TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_WAVES=()
ANY_FAIL=0

for wave in "${WAVES[@]}"; do
	echo ""
	echo "====================================================="
	echo " VISUAL-CEREMONY > WAVE $wave (isolated Electron launch)"
	echo "====================================================="
	if node scripts/test/visual-ceremony-cdp.cjs --waves "$wave" "$@"; then
		echo "  WAVE $wave PASSED"
	else
		echo "  WAVE $wave FAILED"
		ANY_FAIL=1
		FAILED_WAVES+=("$wave")
	fi
done

echo ""
echo "====================================================="
echo " VISUAL-CEREMONY > FULL SWEEP COMPLETE"
echo "====================================================="
if [[ "$ANY_FAIL" == "0" ]]; then
	echo "All ${#WAVES[@]} waves PASSED"
	exit 0
else
	echo "Failed waves: ${FAILED_WAVES[*]}"
	exit 1
fi
