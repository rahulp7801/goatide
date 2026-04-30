#!/usr/bin/env bash
# Meta-test for scripts/ci/refuse-fuzzy-fallback.sh.
#
# Constitutional mandate enforcement is only as good as the gate's ability to catch
# violations. This script writes a sentinel file containing a banned token, runs the
# gate, asserts exit 1, then cleans up. Modeled on scripts/test/refusal-vector-meta.sh.
set -euo pipefail

SENTINEL="kernel/src/graph/__sentinel_fuzzy__.ts"

cleanup() {
	# `git rm --cached` must run before rm so git's index does not reference a
	# missing path. Suppress errors so cleanup is idempotent across paths
	# where one or both states already cleared.
	git rm --cached "$SENTINEL" 2>/dev/null || true
	rm -f "$SENTINEL"
}
trap cleanup EXIT

cat > "$SENTINEL" <<'EOF'
// Intentional sentinel for refuse-fuzzy-fallback.sh meta-test.
export const sentinel = 'levenshtein';
EOF

# `git add --intent-to-add` so `git ls-files` (which the refusal uses to find
# scan candidates) sees the sentinel without actually committing it.
git add --intent-to-add "$SENTINEL"

EXIT_CODE=0
bash scripts/ci/refuse-fuzzy-fallback.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
	echo "META FAIL: refuse-fuzzy-fallback.sh did not detect sentinel '$SENTINEL'"
	exit 1
fi

# Cleanup before second run (trap will repeat at exit; safe).
git rm --cached "$SENTINEL" 2>/dev/null || true
rm -f "$SENTINEL"

EXIT_CODE=0
bash scripts/ci/refuse-fuzzy-fallback.sh > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
	echo "META FAIL: refuse-fuzzy-fallback.sh stuck red after cleanup (exit $EXIT_CODE)"
	exit 1
fi

echo "META PASS: refuse-fuzzy-fallback.sh fires on violation and clears on cleanup."
