#!/usr/bin/env bash
# scripts/test/refusal-close-03-sc3-flake-repro-meta.sh
#
# Phase 13 Plan 13-00 (Wave 0) — RED meta-test for CLOSE-03.
#
# RUNTIME COST WARNING:
#   This script runs the FULL kernel vitest suite 10 times consecutively under
#   Electron-as-Node. Each vitest run takes approximately 30-90 seconds depending
#   on machine speed and SQLite WAL state. Total wall-clock budget: 5-15 minutes.
#   DO NOT invoke ad-hoc without that time budget. Use it only for:
#     (a) Establishing the sc3 flake baseline before Plan 13-03
#     (b) Confirming 10/10 PASS after Plan 13-03 fix lands
#
# Asserts that `kernel/src/test/drift/integration/sc3-section-lock.spec.ts`
# ("Phase 7 SC #3 — enforcing-section edit triggers tri-bucket lock") passes
# 10/10 times in 10 consecutive full kernel vitest runs.
#
# Background:
#   Per REQUIREMENTS.md CLOSE-03 and commit `4f548fe10cd`, sc3 is order-dependent:
#   it flakes when WAL state from a prior spec leaks into its SQLite in-memory DB
#   setup. The flake is intermittent (some orderings are fine, some trigger it),
#   making it unreliable for regression testing of contract-lock changes.
#
# Expected current behavior (RED):
#   At least one of the 10 runs will have sc3 fail (flake), demonstrating the
#   order-dependent instability. Exit 1 with per-run breakdown.
#
# After Plan 13-03 fix (WAL state isolation), 10/10 runs should pass. Exit 0.
#
# Modeled on refusal-build-rt-04-meta.sh: set -euo pipefail, META PASS|FAIL|PEND.
# Phase 13 polarity: exit 1 = RED (FAIL or PEND), exit 0 = GREEN (PASS).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KERNEL="$ROOT/kernel"
VITEST_RUNNER="$KERNEL/scripts/run-vitest-electron.cjs"

# Verify pre-conditions.
if [ ! -f "$VITEST_RUNNER" ]; then
	echo "META FAIL: $VITEST_RUNNER not found — kernel vitest runner missing" >&2
	exit 1
fi

if [ ! -f "$KERNEL/node_modules/vitest/vitest.mjs" ]; then
	echo "META PEND: kernel/node_modules/vitest not found — run 'cd kernel && npm install' first" >&2
	exit 1
fi

# SC3 test file path (relative to kernel/ for vitest --reporter filter).
SC3_SPEC="src/test/drift/integration/sc3-section-lock.spec.ts"
SC3_SPEC_FULL="$KERNEL/$SC3_SPEC"

if [ ! -f "$SC3_SPEC_FULL" ]; then
	echo "META FAIL: sc3 spec file not found at $SC3_SPEC_FULL" >&2
	exit 1
fi

echo "META: Running sc3-section-lock.spec.ts 10 times (full kernel vitest suite each run)."
echo "META: Approximate runtime: 5-15 minutes. See script header for cost warning."
echo ""

PASS_COUNT=0
FAIL_COUNT=0
declare -a RUN_RESULTS=()

for i in $(seq 1 10); do
	echo "--- Run $i/10 ---"
	set +e
	# Run the full suite but filter test output to sc3-specific lines.
	# We use --reporter=verbose to get per-test PASS/FAIL lines.
	# The exit code of node scripts/run-vitest-electron.cjs indicates overall suite pass/fail.
	# We grep the output for sc3-specific failures to distinguish sc3 flake from other failures.
	RUN_OUTPUT=$(cd "$KERNEL" && node scripts/run-vitest-electron.cjs run 2>&1)
	RUN_EC=$?
	set -e

	# Determine if sc3 specifically failed this run.
	# vitest verbose reporter prints "✓" or "×" (or ANSI variants) before test names.
	# We check for the sc3 describe-block text failing.
	SC3_FAIL=0
	if echo "$RUN_OUTPUT" | grep -q "sc3-section-lock\|enforcing-section edit triggers tri-bucket lock"; then
		if echo "$RUN_OUTPUT" | grep -qE "(FAIL|failed|×|✗).*sc3-section-lock|sc3-section-lock.*(FAIL|failed|×|✗)|enforcing-section edit.*(FAIL|failed)"; then
			SC3_FAIL=1
		elif [ "$RUN_EC" -ne 0 ]; then
			# Overall suite failed — check if sc3 is among the failures.
			if echo "$RUN_OUTPUT" | grep -iE "failed.*sc3|sc3.*failed|section.lock.*fail" > /dev/null 2>&1; then
				SC3_FAIL=1
			fi
		fi
	fi

	# Also detect sc3 failure when the test file appears in vitest's "failed" summary.
	if echo "$RUN_OUTPUT" | grep -q "sc3-section-lock" && echo "$RUN_OUTPUT" | grep -q " 0 passed"; then
		SC3_FAIL=1
	fi

	if [ "$SC3_FAIL" -eq 0 ] && [ "$RUN_EC" -eq 0 ]; then
		STATUS="PASS"
		PASS_COUNT=$((PASS_COUNT + 1))
	elif [ "$SC3_FAIL" -eq 1 ]; then
		STATUS="FAIL (sc3 flaked)"
		FAIL_COUNT=$((FAIL_COUNT + 1))
	else
		# Suite failed for other reason. Determine sc3's status precisely:
		# vitest reports failing FILES in its summary as "FAIL <filepath>" lines.
		# If sc3-section-lock does NOT appear on a FAIL line, sc3 passed — another
		# spec caused the non-zero exit. This handles Windows ANSI/Unicode grep issues
		# where the ✓ character match may fail in the "passed" path of the verbose
		# reporter. (Plan 13-03 fix — CLOSE-03 meta-test detection correctness.)
		SC3_IN_FAIL_LINE=0
		if echo "$RUN_OUTPUT" | grep -iE "^[[:space:]]*FAIL[[:space:]].*sc3-section-lock|FAIL[[:space:]]src/test/drift/integration/sc3-section-lock" > /dev/null 2>&1; then
			SC3_IN_FAIL_LINE=1
		fi
		if [ "$SC3_IN_FAIL_LINE" -eq 0 ]; then
			STATUS="PASS (sc3 passed; other spec caused suite failure)"
			PASS_COUNT=$((PASS_COUNT + 1))
		elif echo "$RUN_OUTPUT" | grep -qE "(✓|PASS).*enforcing-section|enforcing-section.*(✓|PASS)"; then
			STATUS="PASS (sc3 passed; other spec failed)"
			PASS_COUNT=$((PASS_COUNT + 1))
		else
			STATUS="FAIL (suite error — sc3 status unknown)"
			FAIL_COUNT=$((FAIL_COUNT + 1))
		fi
	fi

	RUN_RESULTS+=("  Run $i: $STATUS")
	echo "  Run $i result: $STATUS"
	echo ""
done

echo "=================================="
echo "META: sc3 flake repro — 10-run summary:"
for result_line in "${RUN_RESULTS[@]}"; do
	echo "$result_line"
done
echo ""
echo "  sc3 PASS: $PASS_COUNT/10"
echo "  sc3 FAIL: $FAIL_COUNT/10"
echo "=================================="

if [ "$PASS_COUNT" -eq 10 ] && [ "$FAIL_COUNT" -eq 0 ]; then
	echo "META PASS: sc3-section-lock passed 10/10 consecutive runs (CLOSE-03)"
	exit 0
fi

echo "" >&2
echo "META FAIL (expected RED on master): sc3-section-lock flaked $FAIL_COUNT/10 runs" >&2
echo "Per-run breakdown:" >&2
for result_line in "${RUN_RESULTS[@]}"; do
	echo "$result_line" >&2
done
echo "" >&2
echo "This is the CLOSE-03 gap: sc3 is order-dependent (WAL state leak from prior spec)." >&2
echo "Plan 13-03 fixes WAL isolation so sc3 passes 10/10 deterministically." >&2
exit 1
