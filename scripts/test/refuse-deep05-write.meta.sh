#!/usr/bin/env bash
# scripts/test/refuse-deep05-write.meta.sh — Hermetic meta-test for the DEEP-05
# inspector-write refusal gate (Phase 14 Plan 14-01, Mandate B).
#
# Two phases:
#   Phase 1 (positive control — gate must FIRE): create a fixture under inspector/
#   containing the literal `atomicAccept`, `git add --intent-to-add` so git ls-files
#   sees it, assert the gate exits 1.
#   Phase 2 (negative control — gate must EXIT 0): clean the fixture, assert the gate
#   exits 0 on the unaltered tree.
#
# Modeled on scripts/test/refuse-silent-override-meta.sh; differs in that we operate on
# the LIVE repo tree (no mktemp -d copy) because the gate is keyed on the absolute
# inspector path. A trap restores state on any exit so failure mid-test does not leave
# the fixture file in the tree.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
GATE="${REPO_ROOT}/scripts/ci/refuse-deep05-write.sh"
FIXTURE="${REPO_ROOT}/src/vs/goatide/extensions/goatide-bridge/src/inspector/_fixture-violation.ts"

if [[ ! -x "$GATE" ]]; then
	echo "META FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

cleanup() {
	# Restore tree state regardless of how we exited. `git reset HEAD -- <path>` is a
	# no-op if the fixture was never staged; `rm -f` is a no-op if the file is absent.
	git -C "$REPO_ROOT" reset HEAD -- "$FIXTURE" >/dev/null 2>&1 || true
	rm -f "$FIXTURE"
}
trap cleanup EXIT

cd "$REPO_ROOT"

# ----- Phase 1: positive control -----
# Author a fixture that contains the literal `atomicAccept` token. The gate uses
# git ls-files, so the file must be tracked (or intent-to-add'd) for the scan to see it.
cat > "$FIXTURE" <<'EOF'
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// META-TEST FIXTURE — intentionally contains a banned write-RPC token. Removed by
// scripts/test/refuse-deep05-write.meta.sh trap; if you see this file outside the
// meta-test run, delete it.
export const VIOLATION = 'atomicAccept';
EOF
git add --intent-to-add -- "$FIXTURE"

RC=0
bash "$GATE" >/dev/null 2>&1 || RC=$?
if [ "$RC" -eq 0 ]; then
	echo "META FAIL: gate did not fire on positive fixture (exit code was 0)" >&2
	exit 1
fi
echo "  OK: gate exited $RC on positive fixture (banned atomicAccept token)"

# Tear the fixture down BEFORE phase 2 (the trap also clears it, but make phase 2
# state explicit).
git reset HEAD -- "$FIXTURE" >/dev/null 2>&1 || true
rm -f "$FIXTURE"

# ----- Phase 2: negative control -----
RC=0
bash "$GATE" >/dev/null 2>&1 || RC=$?
if [ "$RC" -ne 0 ]; then
	echo "META FAIL: gate fired on clean tree (exit code was $RC)" >&2
	exit 1
fi
echo "  OK: gate exited 0 on clean tree"

echo "META PASS"
exit 0
