#!/usr/bin/env bash
# Phase 16 Plan 16-01 — Hermetic meta-test for refuse-unbounded-ripple-walk.sh widening.
#
# Verifies the gate fires on a constraint-lift*.ts file with max_hops > 3 and
# does NOT fire on the canonical max_hops 1|2|3 literal-union surface.
#
# Modeled on scripts/test/refuse-deep05-write.meta.sh single-line META PASS / META FAIL pattern.
#
# Two phases:
#   Phase 1 (positive): clean repo state → gate exits 0.
#   Phase 2 (negative): plant a temp file with max_hops: 4 → gate exits 1.
#
# Exit codes: 0 + "META PASS" — both phases pass. 1 + "META FAIL: <phase>" — fail.
#
# Self-cleanup-safe: even if assertions fail, the temp file is removed and
# `git rm --cached` is run (so the worktree is restored).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

GATE="scripts/ci/refuse-unbounded-ripple-walk.sh"

if [[ ! -f "$GATE" ]]; then
	echo "META FAIL: $GATE does not exist"
	exit 1
fi

# Phase 1 (positive): clean repo state → gate exits 0
if ! bash "$GATE" > /dev/null 2>&1; then
	echo "META FAIL: positive — gate fired on clean state"
	exit 1
fi
echo "  OK: gate exited 0 on clean state"

# Phase 2 (negative): plant a temp file with max_hops: 4 → gate exits 1
TEMP="kernel/src/drift/constraint-lift.spec.tmp.ts"

cleanup() {
	git rm --cached --force "$TEMP" 2>/dev/null || true
	rm -f "$TEMP"
}
trap cleanup EXIT

cat > "$TEMP" <<'EOF'
// Phase 16 meta-test fixture — DO NOT COMMIT. Synthetic violation: max_hops: 4
const x = { max_hops: 4 };
EOF

# Add without committing so git ls-files sees it.
git add "$TEMP" 2>/dev/null || true

GATE_FIRED=0
bash "$GATE" > /dev/null 2>&1 && GATE_FIRED=0 || GATE_FIRED=1

# Cleanup BEFORE asserting (leaves worktree clean even on assertion failure).
cleanup
trap - EXIT

if [ "$GATE_FIRED" -ne 1 ]; then
	echo "META FAIL: negative — gate did not fire on max_hops:4 in constraint-lift*.ts"
	exit 1
fi
echo "  OK: gate exited 1 on max_hops:4 fixture (PASS)"

echo "META PASS"
exit 0
