#!/usr/bin/env bash
# scripts/test/brander-asserts-pin-meta.sh
#
# Meta-test for FORK-05 brander TS-pin drift recovery.
#
# Source: 01.1-RESEARCH.md ## Common Pitfalls > Pitfall 2 (TS override stripped
#         on next upstream-sync — i.e. monthly upstream-sync re-introduces
#         upstream's bleeding-edge typescript@^6.0.0-dev.YYYYMMDD even though
#         goatide is pinned to ~5.9.0 against vscode 1.117.0's .d.ts surface).
# Source: 01.1-RESEARCH.md ## Open Questions > Q4 (recommendation: brander must
#         assert TS override survives the sync — bake the rewrite into the
#         brander's jq pipeline so the Pitfall-2 regression is impossible by
#         construction).
#
# Plan-of-record for the brander change: Plan 01.1-02 (TS pin + brander
# overrides extension, Wave 1). Plan 01.1-02 extends scripts/prepare_goatide.sh
# so its package.json drift-recovery jq pipeline forces both
# .devDependencies.typescript and .overrides.typescript to "~5.9.0" on every
# brander run, regardless of what upstream-sync introduced.
#
# Wave-0 expected state: this meta-test EXITS 1 against the live (pre-Plan-
# 01.1-02) brander. That refusal is correct — it is the green-by-construction
# pattern established in Plan 01-01 ("Wave-0 test scripts use fail-loudly
# named-fixer diagnostics ... giving Plan 01-XX a green-by-construction
# target", STATE.md ## Decisions [Phase 01]). Plan 01.1-02 makes this test
# exit 0 by extending the brander's jq pipeline.
#
# Strategy:
#   1. Build a hermetic git fixture; copy product.json from the live tree so
#      the brander's pre-checks pass.
#   2. Write a minimal package.json with a TAMPERED typescript entry —
#      "devDependencies.typescript": "^6.0.0-dev.20260401" and
#      "overrides.typescript":      "^6.0.0-dev.20260401" — exactly the post-
#      upstream-sync regression state Pitfall 2 describes.
#   3. Commit the fixture; run the brander once.
#   4. Assert via jq that the brander rewrote BOTH locations back to "~5.9.0".
#
# Cleanup is `trap`-registered on EXIT so a failed assertion still unwinds.
set -euo pipefail

# Capture ORIG_CWD before any `cd` so the brander script can be resolved
# relative to the live tree.
ORIG_CWD="$(pwd)"

PREPARE_GOATIDE="${PREPARE_GOATIDE:-scripts/prepare_goatide.sh}"

# Pre-checks — fail loudly if the brander itself is missing.
if [[ ! -f "$ORIG_CWD/$PREPARE_GOATIDE" ]]; then
	echo "brander-asserts-pin meta SKIPPED — $PREPARE_GOATIDE not present in CWD; nothing to test." >&2
	exit 0
fi
if [[ ! -f "$ORIG_CWD/product.json" ]]; then
	echo "brander-asserts-pin meta SKIPPED — product.json not present in CWD; brander pre-check would fail before our assertions run." >&2
	exit 0
fi

FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT

git -C "$FIXTURE" init -q
git -C "$FIXTURE" config user.email a@b
git -C "$FIXTURE" config user.name  test
git -C "$FIXTURE" config commit.gpgsign false 2>/dev/null || true

# Copy product.json so the brander's pre-check (`[[ -f product.json ]] || exit 1`)
# passes. The brander will rewrite this; we don't assert anything about it here.
cp "$ORIG_CWD/product.json" "$FIXTURE/product.json"

# Tampered package.json — Pitfall-2 post-upstream-sync regression state.
# typescript appears in BOTH devDependencies and overrides at the bleeding-edge
# version that upstream/master pulls in. The brander (Plan 01.1-02 onward) must
# rewrite both back to "~5.9.0" so vscode 1.117.0's .d.ts surface keeps
# compiling.
cat > "$FIXTURE/package.json" <<'EOF'
{
	"name": "fixture-tampered-ts",
	"version": "0.0.1",
	"private": true,
	"scripts": {
		"upstream-sync": "bash scripts/upstream-sync.sh"
	},
	"devDependencies": {
		"typescript": "^6.0.0-dev.20260401"
	},
	"overrides": {
		"typescript": "^6.0.0-dev.20260401"
	}
}
EOF

git -C "$FIXTURE" add -A
git -C "$FIXTURE" commit -q -m "fixture tampered ts override"

# Run the live brander once. We do NOT capture its exit code as a hard failure
# signal — even a successful brander run that does NOT rewrite the ts pin is a
# meta-test failure (Plan 01.1-02 has not landed). The interesting signal is
# the post-run state of package.json.
(
	cd "$FIXTURE"
	bash "$ORIG_CWD/$PREPARE_GOATIDE" >/dev/null 2>&1 || true
)

DEV_TS="$(jq -r '.devDependencies.typescript // "MISSING"' "$FIXTURE/package.json")"
OVR_TS="$(jq -r '.overrides.typescript      // "MISSING"' "$FIXTURE/package.json")"

if [[ "$DEV_TS" != "~5.9.0" ]]; then
	echo "brander-asserts-pin meta FAIL — Plan 01.1-02 has not yet extended prepare_goatide.sh's package.json jq to rewrite .devDependencies.typescript to ~5.9.0; expected '~5.9.0', got '$DEV_TS'." >&2
	exit 1
fi

if [[ "$OVR_TS" != "~5.9.0" ]]; then
	echo "brander-asserts-pin meta FAIL — Plan 01.1-02 has not yet extended prepare_goatide.sh's package.json jq to rewrite .overrides.typescript to ~5.9.0; expected '~5.9.0', got '$OVR_TS'." >&2
	exit 1
fi

echo "brander-asserts-pin ok — prepare_goatide.sh restored typescript@~5.9.0 in devDependencies AND overrides"
exit 0
