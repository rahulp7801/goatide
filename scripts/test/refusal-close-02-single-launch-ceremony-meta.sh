#!/usr/bin/env bash
# scripts/test/refusal-close-02-single-launch-ceremony-meta.sh
#
# Phase 13 Plan 13-00 (Wave 0) — RED meta-test for CLOSE-02.
#
# Asserts that all 11 ceremony surfaces pass in a single Electron launch (i.e.,
# without the `--waves N` per-wave-isolation workaround introduced in Phase 11).
#
# Background:
#   `scripts/visual-ceremony.sh` without any flags runs each wave in a separate
#   Electron launch as a deliberate workaround for cross-state interference in a
#   single-launch full sweep. CLOSE-02 (Plan 13-02) identifies and fixes the root
#   cause so all 11 surfaces can pass in ONE Electron launch — making the ceremony
#   idempotent and cheaper (1 Electron launch instead of 5).
#
# This meta-test invokes the ceremony harness directly (without the multi-launch
# driver) so it measures single-launch behaviour.
#
# The 11 ceremony surfaces (in the order they appear in SURFACE_REGISTRY):
#   Wave 0: WAVE0-SMOKE
#   Wave 1: VIS-10, VIS-09, VIS-01
#   Wave 2: VIS-02
#   Wave 3: VIS-06, VIS-07, VIS-08
#   Wave 4: VIS-04, VIS-05, VIS-03
#
# Execution model:
#   1. Invokes `node scripts/test/visual-ceremony-cdp.cjs` WITHOUT any --waves filter,
#      i.e. passes all wave IDs together so the harness runs them in a single launch.
#   2. Captures pass/fail count from the harness output.
#   3. Asserts: 11/11 PASS. Exit 0 iff true; exit 1 with pass/fail breakdown otherwise.
#
# Expected current behavior (RED):
#   Without the CLOSE-02 fix, Wave-3 surfaces (VIS-06/07/08) fail in a single-launch
#   context because cross-state interference prevents drift findings from populating on
#   subsequent saves. The test fails with < 11/11 PASS.
#
# After Plan 13-02 fix lands, exit 0.
#
# Modeled on refusal-build-rt-04-meta.sh: set -euo pipefail, META PASS|FAIL|PEND.
# Exit 1 = RED (both FAIL and PEND). Phase 13 polarity.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS="$ROOT/scripts/test/visual-ceremony-cdp.cjs"

if [ ! -f "$HARNESS" ]; then
	echo "META FAIL: $HARNESS not found — visual-ceremony-cdp.cjs is a pre-condition" >&2
	exit 1
fi

# Electron binary pre-flight (same resolution as freshclone-smoke-cdp.cjs / CLOSE-01).
case "$(uname -s)" in
	MINGW*|MSYS*|CYGWIN*|Windows_NT)
		ELECTRON_BIN="$ROOT/.build/electron/GoatIDE.exe"
		;;
	Darwin)
		PRODUCT_NAME=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('$ROOT/product.json','utf8')); process.stdout.write(p.nameLong||'GoatIDE');" 2>/dev/null || echo 'GoatIDE')
		ELECTRON_BIN="$ROOT/.build/electron/${PRODUCT_NAME}.app/Contents/MacOS/goatide"
		;;
	*)
		ELECTRON_BIN="$ROOT/.build/electron/goatide"
		;;
esac

if [ ! -f "$ELECTRON_BIN" ]; then
	echo "META PEND: Electron binary not found at $ELECTRON_BIN — run 'npm install && npm run electron' first" >&2
	exit 1
fi

# Run the ceremony harness in single-launch mode: pass ALL waves (0,1,2,3,4) as a
# comma-separated --waves argument so the harness collects all 11 surfaces in one
# Electron session.  This is the exact failure mode CLOSE-02 is meant to fix — the
# existing per-wave-isolation workaround in visual-ceremony.sh is deliberately bypassed.
echo "META: Running visual-ceremony-cdp.cjs --waves 0,1,2,3,4 (single-launch, no per-wave isolation) ..."

HARNESS_OUTPUT_FILE=$(mktemp "${TMPDIR:-/tmp}/close02-harness-output.XXXXXXXX")
trap 'rm -f "$HARNESS_OUTPUT_FILE"' EXIT

set +e
node "$HARNESS" --waves 0,1,2,3,4 2>&1 | tee "$HARNESS_OUTPUT_FILE"
HARNESS_EC=${PIPESTATUS[0]}
set -e

# Count PASS and FAIL lines from harness output.
# The harness prints lines like "  [PASS] WAVE0-SMOKE" or "  [FAIL] VIS-06: <reason>".
PASS_COUNT=$(grep -c '\[PASS\]' "$HARNESS_OUTPUT_FILE" 2>/dev/null || echo 0)
FAIL_COUNT=$(grep -c '\[FAIL\]' "$HARNESS_OUTPUT_FILE" 2>/dev/null || echo 0)
TOTAL=$((PASS_COUNT + FAIL_COUNT))

echo ""
echo "META: Ceremony single-launch result: $PASS_COUNT/$TOTAL PASS, $FAIL_COUNT/$TOTAL FAIL"

if [ "$PASS_COUNT" -eq 11 ] && [ "$FAIL_COUNT" -eq 0 ]; then
	echo "META PASS: all 11 ceremony surfaces PASS in a single Electron launch (CLOSE-02)"
	exit 0
fi

# Provide pass/fail breakdown for the probe baseline.
echo "META FAIL (expected RED on master): $PASS_COUNT/11 ceremony surfaces passed in single-launch mode" >&2
echo "" >&2
echo "Pass/Fail breakdown:" >&2
echo "  PASS lines ($(grep '\[PASS\]' "$HARNESS_OUTPUT_FILE" 2>/dev/null | wc -l)):" >&2
grep '\[PASS\]' "$HARNESS_OUTPUT_FILE" 2>/dev/null | sed 's/^/    /' >&2 || true
echo "  FAIL lines ($(grep '\[FAIL\]' "$HARNESS_OUTPUT_FILE" 2>/dev/null | wc -l)):" >&2
grep '\[FAIL\]' "$HARNESS_OUTPUT_FILE" 2>/dev/null | sed 's/^/    /' >&2 || true
echo "" >&2
echo "This is the CLOSE-02 gap: Wave-3 surfaces (VIS-06/07/08) fail in single-launch mode" >&2
echo "due to cross-state interference. Plan 13-02 fixes the root cause." >&2
exit 1
