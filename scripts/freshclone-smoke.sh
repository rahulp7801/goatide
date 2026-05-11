#!/usr/bin/env bash
# scripts/freshclone-smoke.sh
#
# Phase 9 Plan 09-05 — fresh-clone CDP smoke driver (BUILD-RT-* SC #5).
#
# Orchestrates the full first-time-launch contract:
#   1. `npm install` (idempotent on warm tree, fresh on clean clone)
#   2. `npm run compile` (chains build-bridge -> gulp compile -> transpile-client thanks
#      to Plans 09-02 / 09-03 / 09-04)
#   3. Ensures the Electron binary is on disk (downloads via `npm run electron` if missing)
#   4. Invokes `node scripts/test/freshclone-smoke-cdp.cjs` (4 SC#5 assertions)
#
# Budget: 15 min total (SMOKE_TIMEOUT_S=900) — override via env var.
# Per-step timeouts protect the CI runner from a hang in any one stage.
#
# Cross-platform: works on Linux, macOS, Git-Bash / MinGW. The `timeout` command may not
# exist on Git-Bash; the script falls back to running the step without a timeout wrapper
# and prints a warning in that case (the .cjs harness has its own internal Playwright
# timeout so the smoke cannot hang indefinitely).
#
# Exit codes:
#   0   = all 4 SC#5 assertions PASS (clean smoke)
#   124 = a step exceeded its timeout (POSIX `timeout` standard exit code)
#   *   = any step failed (set -euo pipefail propagates)
#
# Reference: 09-RESEARCH.md sections "Pattern 6" and "Example 4".
# Reference: scripts/test/clean-profile-launch.sh (POSIX + MinGW dual-mode pattern).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SMOKE_TIMEOUT_S="${SMOKE_TIMEOUT_S:-900}"
CDP_TIMEOUT_S="${CDP_TIMEOUT_S:-300}"

# --- timeout wrapper (graceful fallback on Git-Bash / MinGW) ----------------
if command -v timeout >/dev/null 2>&1; then
	TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
	# macOS with `brew install coreutils` (gtimeout is the GNU coreutils name)
	TIMEOUT_BIN="gtimeout"
else
	TIMEOUT_BIN=""
	echo "[freshclone-smoke] WARNING: no 'timeout' or 'gtimeout' available; running each step without a wall-clock cap"
fi

run_with_timeout() {
	local budget_s="$1"
	shift
	if [[ -n "$TIMEOUT_BIN" ]]; then
		"$TIMEOUT_BIN" "${budget_s}s" "$@"
	else
		"$@"
	fi
}

# --- Platform-resolved electron binary path (mirror of .cjs harness) --------
detect_electron_binary() {
	local platform
	platform="$(uname -s)"
	case "$platform" in
		Linux)
			echo "$ROOT/.build/electron/goatide"
			;;
		Darwin)
			echo "$ROOT/.build/electron/GoatIDE.app/Contents/MacOS/GoatIDE"
			;;
		MINGW*|MSYS*|CYGWIN*)
			echo "$ROOT/.build/electron/GoatIDE.exe"
			;;
		*)
			echo "$ROOT/.build/electron/goatide"
			;;
	esac
}

# --- Step 1: npm install ----------------------------------------------------
echo "[freshclone-smoke] Step 1: npm install (budget ${SMOKE_TIMEOUT_S}s)"
run_with_timeout "$SMOKE_TIMEOUT_S" npm install

# --- Step 2: npm run compile (chains build-bridge / gulp / transpile-client) -
echo "[freshclone-smoke] Step 2: npm run compile (budget ${SMOKE_TIMEOUT_S}s)"
run_with_timeout "$SMOKE_TIMEOUT_S" npm run compile

# --- Step 3: ensure Electron binary on disk ---------------------------------
ELECTRON_BIN="$(detect_electron_binary)"
if [[ ! -f "$ELECTRON_BIN" ]]; then
	echo "[freshclone-smoke] Step 3: Electron binary missing at $ELECTRON_BIN — invoking npm run electron"
	run_with_timeout "$SMOKE_TIMEOUT_S" npm run electron
	if [[ ! -f "$ELECTRON_BIN" ]]; then
		echo "[freshclone-smoke] FAIL: Electron binary still missing after `npm run electron` — see logs above" >&2
		exit 1
	fi
else
	echo "[freshclone-smoke] Step 3: Electron binary OK at $ELECTRON_BIN"
fi

# --- Step 4: CDP smoke harness ----------------------------------------------
echo "[freshclone-smoke] Step 4: CDP smoke harness (budget ${CDP_TIMEOUT_S}s)"
run_with_timeout "$CDP_TIMEOUT_S" node "$ROOT/scripts/test/freshclone-smoke-cdp.cjs"

echo "[freshclone-smoke] OK — all 4 SC#5 assertions PASS"
exit 0
