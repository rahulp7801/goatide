#!/usr/bin/env bash
#
# scripts/visual-ceremony.sh — Phase 11 Plan 11-00 Task 2 top-level driver.
#
# DEFAULT MODE (Phase 13 CLOSE-02 closure): single Electron launch across all waves.
#   `bash scripts/visual-ceremony.sh`   — runs all 11 surfaces in one Electron launch.
#   This is the mode measured by refusal-close-02-single-launch-ceremony-meta.sh.
#
# The per-wave isolation workaround (--waves N per launch) was introduced in Phase 11
# commit 540bd120618 as a workaround for Wave-3 cross-state interference: VS Code's
# active-editor detection became inconsistent in multi-group multi-webview state, causing
# the auth-security.md save to never route through onWillSaveTextDocument. Phase 12-03
# (H1 dispose-on-reject + H2 ViewColumn.Active) partially fixed this. Phase 13 Plan 13-02
# (CLOSE-02) identified the root cause — save-command routing targets the *active* editor,
# not just the dirty one — and added a tab-active-before-save guard in prepareDriftSave
# so auth-security.md is pinned as the active editor immediately before the save fires.
# The workaround flag is retained for opt-in per-wave isolation (e.g. CI environments
# that need hermetic wave-level isolation) but is no longer the default.
#
# Usage:
#   bash scripts/visual-ceremony.sh                    # full sweep (single Electron launch)
#   bash scripts/visual-ceremony.sh --only VIS-09      # single-surface filter
#   bash scripts/visual-ceremony.sh --waves 1,2        # wave-number filter (single launch)
#   bash scripts/visual-ceremony.sh --waves 3 --per-wave-isolation
#                                                      # opt-in per-wave launch (legacy mode)
#   HARNESS_TIMEOUT_MS=300000 bash scripts/visual-ceremony.sh ...

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT"

# Detect per-wave-isolation opt-in flag.
PER_WAVE_ISOLATION=0
PASS_THROUGH_ARGS=()
for arg in "$@"; do
	case "$arg" in
		--per-wave-isolation)
			PER_WAVE_ISOLATION=1
			;;
		*)
			PASS_THROUGH_ARGS+=("$arg")
			;;
	esac
done

if [[ "$PER_WAVE_ISOLATION" == "1" ]]; then
	# Legacy per-wave isolation mode: run each specified wave in its own Electron launch.
	# Parse --waves from pass-through args; default to all waves if absent.
	WAVES=(0 1 2 3 4)
	for i in "${!PASS_THROUGH_ARGS[@]}"; do
		if [[ "${PASS_THROUGH_ARGS[$i]}" == "--waves" ]]; then
			IFS=',' read -ra WAVES <<< "${PASS_THROUGH_ARGS[$((i+1))]}"
			unset 'PASS_THROUGH_ARGS[i]'
			unset 'PASS_THROUGH_ARGS[$((i+1))]'
			PASS_THROUGH_ARGS=("${PASS_THROUGH_ARGS[@]}")
			break
		fi
	done

	TOTAL_PASS=0
	TOTAL_FAIL=0
	FAILED_WAVES=()
	ANY_FAIL=0

	for wave in "${WAVES[@]}"; do
		echo ""
		echo "====================================================="
		echo " VISUAL-CEREMONY > WAVE $wave (isolated Electron launch)"
		echo "====================================================="
		if node scripts/test/visual-ceremony-cdp.cjs --waves "$wave" "${PASS_THROUGH_ARGS[@]}"; then
			echo "  WAVE $wave PASSED"
		else
			echo "  WAVE $wave FAILED"
			ANY_FAIL=1
			FAILED_WAVES+=("$wave")
		fi
	done

	echo ""
	echo "====================================================="
	echo " VISUAL-CEREMONY > PER-WAVE SWEEP COMPLETE"
	echo "====================================================="
	if [[ "$ANY_FAIL" == "0" ]]; then
		echo "All ${#WAVES[@]} waves PASSED (per-wave isolation mode)"
		exit 0
	else
		echo "Failed waves: ${FAILED_WAVES[*]}"
		exit 1
	fi
fi

# Default: single Electron launch with all surfaces. Phase 13 CLOSE-02 closure — the
# tab-active-before-save fix in prepareDriftSave makes this deterministic.
# --only and --waves filters pass through to the harness as-is (single-launch always).
echo ""
echo "====================================================="
echo " VISUAL-CEREMONY > SINGLE-LAUNCH FULL SWEEP (CLOSE-02)"
echo "====================================================="
exec node scripts/test/visual-ceremony-cdp.cjs "$@"
