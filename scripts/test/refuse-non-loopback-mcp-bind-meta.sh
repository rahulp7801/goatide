#!/usr/bin/env bash
# scripts/test/refuse-non-loopback-mcp-bind-meta.sh — Hermetic meta-test for the non-loopback
# bind refusal gate (Phase 6 Plan 06-01, Pitfall 10). Plants each banned bind literal into a
# tracked file under kernel/src/mcp/server/ and asserts the gate exits 1; clears and asserts
# exit 0.

set -euo pipefail

GATE="$(pwd)/scripts/ci/refuse-non-loopback-mcp-bind.sh"
if [[ ! -x "$GATE" ]]; then
	echo "META-FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

# Gate uses `git ls-files` so we run inside a temp git repo with the planted file tracked.
TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

mkdir -p "$TMP/kernel/src/mcp/server"
mkdir -p "$TMP/scripts/ci"
cp "$GATE" "$TMP/scripts/ci/refuse-non-loopback-mcp-bind.sh"
chmod +x "$TMP/scripts/ci/refuse-non-loopback-mcp-bind.sh"
cd "$TMP"

git init -q
git config user.email "meta@test"
git config user.name "Meta Test"

PLANTS=(
	"app.listen(7345, '0.0.0.0', () => {});"
	"app.listen(7345, \"0.0.0.0\", () => {});"
	"app.listen(7345, '::', () => {});"
	"app.listen(7345, \"::\", () => {});"
)

for plant in "${PLANTS[@]}"; do
	echo "$plant" > kernel/src/mcp/server/sentinel.ts
	git add -A
	if bash scripts/ci/refuse-non-loopback-mcp-bind.sh > /dev/null 2>&1; then
		echo "META-FAIL: non-loopback-bind gate did NOT reject pattern: $plant" >&2
		exit 1
	fi
	echo "  OK: gate rejected '$plant'"
done

# Soft-warn on 'localhost' bind. Gate exits 1 (treated as a violation per the gate impl).
echo "app.listen(7345, 'localhost', () => {});" > kernel/src/mcp/server/sentinel.ts
git add -A
if bash scripts/ci/refuse-non-loopback-mcp-bind.sh > /dev/null 2>&1; then
	echo "META-FAIL: non-loopback-bind gate did NOT warn on 'localhost' bind" >&2
	exit 1
fi
echo "  OK: gate warned on 'localhost' bind (DNS-resolution-ambiguous)"

# Clean state: literal 127.0.0.1 bind. Gate exits 0.
echo "app.listen(7345, '127.0.0.1', () => {});" > kernel/src/mcp/server/sentinel.ts
git add -A
if ! bash scripts/ci/refuse-non-loopback-mcp-bind.sh > /dev/null 2>&1; then
	echo "META-FAIL: non-loopback-bind gate REJECTED a clean 127.0.0.1 bind" >&2
	exit 1
fi
echo "  OK: gate accepted literal '127.0.0.1' bind"

# Also accept literal [::1]
echo "app.listen(7345, '::1', () => {});" > kernel/src/mcp/server/sentinel.ts
git add -A
if ! bash scripts/ci/refuse-non-loopback-mcp-bind.sh > /dev/null 2>&1; then
	echo "META-FAIL: non-loopback-bind gate REJECTED a clean ::1 bind" >&2
	exit 1
fi
echo "  OK: gate accepted literal '::1' bind"

echo "refuse-non-loopback-mcp-bind-meta: OK"
