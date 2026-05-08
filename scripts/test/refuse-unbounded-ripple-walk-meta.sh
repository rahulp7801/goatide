#!/usr/bin/env bash
# scripts/test/refuse-unbounded-ripple-walk-meta.sh — Hermetic meta-test for the
# unbounded-ripple-walk refusal gate (Phase 7 Plan 07-01, Pitfall 4 + DRIFT-05).
# Plants `max_hops: 4` and `max_hops: 5` and asserts the gate exits 1; plants
# `max_hops: 3` and `max_hops: 1` and asserts exit 0.

set -euo pipefail

GATE="$(pwd)/scripts/ci/refuse-unbounded-ripple-walk.sh"
if [[ ! -x "$GATE" ]]; then
	echo "META-FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

mkdir -p "$TMP/kernel/src/drift"
mkdir -p "$TMP/scripts/ci"
cp "$GATE" "$TMP/scripts/ci/refuse-unbounded-ripple-walk.sh"
chmod +x "$TMP/scripts/ci/refuse-unbounded-ripple-walk.sh"
cd "$TMP"

git init -q
git config user.email "meta@test"
git config user.name "Meta Test"

# Each violating value (>3) must trip the gate.
for n in 4 5 10 100; do
	cat > kernel/src/drift/ripple.ts <<EOF
export function runRippleAnalysis(rootId: string) {
	const opts = { max_hops: $n, node_cap: 1000 };
	return opts;
}
EOF
	git add -A
	if bash scripts/ci/refuse-unbounded-ripple-walk.sh > /dev/null 2>&1; then
		echo "META-FAIL: unbounded-ripple-walk gate did NOT reject max_hops:$n" >&2
		exit 1
	fi
	echo "  OK: gate rejected max_hops:$n"
done

# Boundary values (1..3) must pass.
for n in 1 2 3; do
	cat > kernel/src/drift/ripple.ts <<EOF
export function runRippleAnalysis(rootId: string) {
	const opts = { max_hops: $n, node_cap: 1000 };
	return opts;
}
EOF
	git add -A
	if ! bash scripts/ci/refuse-unbounded-ripple-walk.sh > /dev/null 2>&1; then
		echo "META-FAIL: unbounded-ripple-walk gate REJECTED max_hops:$n (≤3 must pass)" >&2
		exit 1
	fi
	echo "  OK: gate accepted max_hops:$n"
done

# Empty tree.
rm -f kernel/src/drift/ripple.ts
git add -A
if ! bash scripts/ci/refuse-unbounded-ripple-walk.sh > /dev/null 2>&1; then
	echo "META-FAIL: unbounded-ripple-walk gate did not exit 0 when kernel/src/drift/ripple*.ts is absent" >&2
	exit 1
fi
echo "  OK: gate exited 0 when ripple*.ts is absent"

echo "refuse-unbounded-ripple-walk-meta: OK"
