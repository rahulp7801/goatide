#!/usr/bin/env bash
# Meta-test for scripts/ci/refuse-vector-libs.sh.
#
# Strategy:
#   1. Create a sentinel package.json under scripts/__pkg_meta_test/ that
#      declares "hnswlib-node" (a banned vector library) as a dependency.
#   2. `git add -N` the sentinel so `git ls-files` (which the refusal uses
#      to find package.json files) sees it.
#   3. Run scripts/ci/refuse-vector-libs.sh — assert it exits non-zero.
#   4. Cleanup: rm the directory and `git rm --cached` the intent-to-add
#      entry. Re-run the refusal — assert it exits 0.
#
# `trap` cleanup on EXIT so a failed assertion still unwinds.
set -euo pipefail

SENTINEL_DIR="scripts/__pkg_meta_test"
SENTINEL_FILE="$SENTINEL_DIR/package.json"

cleanup() {
  # `git rm --cached` must run before rm so git's index does not reference a
  # missing path. Suppress errors so cleanup is idempotent across paths
  # where one or both states already cleared.
  git rm --cached "$SENTINEL_FILE" 2>/dev/null || true
  rm -rf "$SENTINEL_DIR"
}
trap cleanup EXIT

# 1. Inject violation
mkdir -p "$SENTINEL_DIR"
cat > "$SENTINEL_FILE" <<'JSON'
{
  "name": "meta-test",
  "version": "0.0.0",
  "private": true,
  "dependencies": {
    "hnswlib-node": "^1.0.0"
  }
}
JSON

# 2. Make `git ls-files` aware of the sentinel without actually committing it.
git add --intent-to-add "$SENTINEL_FILE"

# 3. Refusal must fire
EXIT_CODE=0
bash scripts/ci/refuse-vector-libs.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "META FAIL: refuse-vector-libs did not fire on injected hnswlib-node"
  exit 1
fi

# 4. Cleanup before second run (trap will repeat at exit; safe).
git rm --cached "$SENTINEL_FILE" 2>/dev/null || true
rm -rf "$SENTINEL_DIR"

EXIT_CODE=0
bash scripts/ci/refuse-vector-libs.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "META FAIL: refuse-vector-libs stuck red after cleanup (exit $EXIT_CODE)"
  exit 1
fi

echo "META PASS: refuse-vector-libs.sh fires on violation and clears on cleanup."
