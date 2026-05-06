#!/usr/bin/env bash
# Meta-test for scripts/ci/refuse-marketplace.sh.
#
# Test-the-tester: a refusal script that always exits 0 silently breaks the
# constitutional gate. This script proves the refusal both fires on a known
# violation and clears once the violation is removed.
#
# Strategy:
#   1. Inject a sentinel file containing a Microsoft Marketplace URL into the
#      worktree at a non-allowlisted path.
#   2. `git add --intent-to-add` the sentinel so `git ls-files` (which the
#      refusal uses) sees it.
#   3. Run scripts/ci/refuse-marketplace.sh — assert it exits non-zero.
#   4. Cleanup: rm the sentinel and `git rm --cached` the intent-to-add entry.
#      Re-run the refusal — assert it exits 0.
#
# Cleanup is `trap`-registered on EXIT so a failed assertion still unwinds.
# Sentinel filename is unique enough that cleanup is idempotent.
set -euo pipefail

SENTINEL="scripts/__refusal_meta_market.txt"

cleanup() {
	# `git rm --cached` must run before rm so git's index does not reference a
	# missing path. Suppress errors so cleanup is idempotent across paths
	# where one or both states already cleared.
	git rm --cached "$SENTINEL" 2>/dev/null || true
	rm -f "$SENTINEL"
}
trap cleanup EXIT

# 1. Inject violation
echo "https://marketplace.visualstudio.com/items?itemName=fake.fake" > "$SENTINEL"

# 2. Make `git ls-files` aware of the sentinel so refuse-marketplace.sh sees it.
# (refuse-marketplace.sh switched to `git ls-files | grep | rg -F` in Phase 1.2
# for cross-platform-determinism — see comments at top of that file.)
git add --intent-to-add "$SENTINEL"

# 3. Refusal must fire (non-zero exit). Note: under `set -e`, a non-zero from
# the script would normally abort us; capture it explicitly.
EXIT_CODE=0
bash scripts/ci/refuse-marketplace.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
	echo "META FAIL: refuse-marketplace did not fire on injected violation"
	exit 1
fi

# 4. Cleanup before second run (trap will repeat at exit; safe).
git rm --cached "$SENTINEL" 2>/dev/null || true
rm -f "$SENTINEL"

# Refusal must clear (exit 0)
EXIT_CODE=0
bash scripts/ci/refuse-marketplace.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
	echo "META FAIL: refuse-marketplace stuck red after cleanup (exit $EXIT_CODE)"
	exit 1
fi

echo "META PASS: refuse-marketplace.sh fires on violation and clears on cleanup."
