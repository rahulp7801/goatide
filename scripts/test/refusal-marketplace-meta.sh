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
#   2. Run scripts/ci/refuse-marketplace.sh — assert it exits non-zero.
#   3. Remove the sentinel.
#   4. Run scripts/ci/refuse-marketplace.sh — assert it exits 0.
#
# Cleanup is `trap`-registered on EXIT so a failed assertion still unwinds.
# Sentinel filename is unique enough that cleanup is idempotent.
set -euo pipefail

SENTINEL="scripts/__refusal_meta_market.tmp"

cleanup() {
  rm -f "$SENTINEL"
}
trap cleanup EXIT

# 1. Inject violation
echo "https://marketplace.visualstudio.com/items?itemName=fake.fake" > "$SENTINEL"

# 2. Refusal must fire (non-zero exit). Note: under `set -e`, a non-zero from
# the script would normally abort us; capture it explicitly.
EXIT_CODE=0
bash scripts/ci/refuse-marketplace.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "META FAIL: refuse-marketplace did not fire on injected violation"
  exit 1
fi

# 3. Cleanup happens via trap, but do it now too so step 4 sees the clean state.
rm -f "$SENTINEL"

# 4. Refusal must clear (exit 0)
EXIT_CODE=0
bash scripts/ci/refuse-marketplace.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "META FAIL: refuse-marketplace stuck red after cleanup (exit $EXIT_CODE)"
  exit 1
fi

echo "META PASS: refuse-marketplace.sh fires on violation and clears on cleanup."
