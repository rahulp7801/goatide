#!/usr/bin/env bash
# scripts/test/refuse-silent-override-meta.sh — Hermetic meta-test for the silent-override
# refusal gate (Phase 7 Plan 07-01, Pitfall 1 + DRIFT-06). Plants two regression patterns
# (a function named *override* with no audit sentinel; a tier-dispatch branch handling
# lock without override path) and asserts the gate exits 1; clears and asserts exit 0.
#
# Modeled on scripts/test/refuse-non-loopback-mcp-bind-meta.sh.

set -euo pipefail

GATE="$(pwd)/scripts/ci/refuse-silent-override.sh"
if [[ ! -x "$GATE" ]]; then
	echo "META-FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

mkdir -p "$TMP/kernel/src/drift"
mkdir -p "$TMP/scripts/ci"
cp "$GATE" "$TMP/scripts/ci/refuse-silent-override.sh"
chmod +x "$TMP/scripts/ci/refuse-silent-override.sh"
cd "$TMP"

git init -q
git config user.email "meta@test"
git config user.name "Meta Test"

# Plant 1: a function named recordOverride that bypasses the audit seed. The sentinel
# comment deliberately AVOIDS the literal tokens 'contract_override' and
# 'recordContractOverride' so the gate's audit-sentinel check is not accidentally satisfied.
cat > kernel/src/drift/override-handler.ts <<'EOF'
// Sentinel — function below seeds an Attempt with the wrong attempt_kind value.
// Audit trail intentionally absent so the gate fires.
export function recordOverride(daoSeed: (x: object) => void, contractNodeId: string, note: string): void {
	daoSeed({ kind: 'Attempt', body: note, attempt_kind: 'accepted' });
}
EOF
git add -A
if bash scripts/ci/refuse-silent-override.sh > /dev/null 2>&1; then
	echo "META-FAIL: silent-override gate did NOT reject recordOverride() bypass" >&2
	exit 1
fi
echo "  OK: gate rejected silent recordOverride() (no contract_override sentinel)"

# Plant 2: tier-dispatch branch handling lock without the override-attempt path. Sentinel
# comment text avoids the literal audit tokens so the gate's audit-sentinel check fails.
cat > kernel/src/drift/override-handler.ts <<'EOF'
// Sentinel — overrideContract function declared without the audit seed.
export const overrideContract = async (lock: unknown): Promise<void> => {
	if (lock !== null) {
		// audit seed intentionally absent so the gate fires
		console.log('proceeding past lock');
	}
};
EOF
git add -A
if bash scripts/ci/refuse-silent-override.sh > /dev/null 2>&1; then
	echo "META-FAIL: silent-override gate did NOT reject override-named arrow fn bypass" >&2
	exit 1
fi
echo "  OK: gate rejected silent overrideContract arrow fn"

# Clean state 1: an override function that seeds the correct attempt_kind.
cat > kernel/src/drift/override-handler.ts <<'EOF'
// Clean — recordOverride seeds the audit Attempt with attempt_kind:'contract_override'.
export function recordOverride(daoSeed: (x: object) => void, contractNodeId: string, note: string): void {
	daoSeed({ kind: 'Attempt', body: note, attempt_kind: 'contract_override' });
}
EOF
git add -A
if ! bash scripts/ci/refuse-silent-override.sh > /dev/null 2>&1; then
	echo "META-FAIL: silent-override gate REJECTED a clean override path with attempt_kind:'contract_override'" >&2
	exit 1
fi
echo "  OK: gate accepted clean override path with attempt_kind:'contract_override'"

# Clean state 2: an override function that calls the helper recordContractOverride().
cat > kernel/src/drift/override-handler.ts <<'EOF'
// Clean — recordOverride delegates to recordContractOverride().
export function recordOverride(graph: { recordContractOverride: (id: string, note: string) => void }, id: string, note: string): void {
	graph.recordContractOverride(id, note);
}
EOF
git add -A
if ! bash scripts/ci/refuse-silent-override.sh > /dev/null 2>&1; then
	echo "META-FAIL: silent-override gate REJECTED a clean recordContractOverride() delegation" >&2
	exit 1
fi
echo "  OK: gate accepted clean recordContractOverride() delegation"

# Empty-tree state: no kernel/src/drift/*.ts tracked. Gate exits 0 cleanly.
rm -f kernel/src/drift/override-handler.ts
git add -A
if ! bash scripts/ci/refuse-silent-override.sh > /dev/null 2>&1; then
	echo "META-FAIL: silent-override gate did not exit 0 when kernel/src/drift/ has no .ts files" >&2
	exit 1
fi
echo "  OK: gate exited 0 when kernel/src/drift/ has no .ts files"

echo "refuse-silent-override-meta: OK"
