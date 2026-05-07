#!/usr/bin/env bash
# scripts/test/refuse-credential-leaks-meta.sh — Hermetic meta-test for the credential-leak
# refusal gate (Phase 5 Plan 05-01). Plants each forbidden pattern in a temp fixture and
# asserts the gate exits 1; clears the pattern and asserts exit 0.
#
# Modeled on scripts/test/refusal-vector-meta.sh / refusal-fuzzy-fallback-meta.sh.

set -euo pipefail

GATE="$(pwd)/scripts/ci/refuse-credential-leaks-in-fixtures.sh"
if [[ ! -x "$GATE" ]]; then
	echo "META-FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

mkdir -p "$TMP/kernel/src/test/harvester/promoter/fixtures"
cd "$TMP"

PLANTS=(
	'Authorization: Bearer xxxx'
	'"authorization": "Bearer abc"'
	'sk-ant-api03-fake-fake-fake'
	'AKIAIOSFODNN7EXAMPLE'
	'ghp_abcdefghijklmnopqrstuvwxyz0123456789'
	'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.faketokensignature'
	'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
)

for plant in "${PLANTS[@]}"; do
	echo "$plant" > "kernel/src/test/harvester/promoter/fixtures/leak.json"
	if bash "$GATE" > /dev/null 2>&1; then
		echo "META-FAIL: gate did NOT reject pattern: $plant" >&2
		exit 1
	fi
	echo "  OK: gate rejected '${plant:0:24}...'"
done

# Clean state: empty out the planted file and verify gate passes.
rm -rf kernel/src/test/harvester/promoter/fixtures/*
echo '{"content":"hello","model":"claude-3-5-sonnet"}' > kernel/src/test/harvester/promoter/fixtures/clean.json
if ! bash "$GATE" > /dev/null 2>&1; then
	echo "META-FAIL: gate REJECTED a clean fixture" >&2
	exit 1
fi

echo "refuse-credential-leaks-meta: OK"
