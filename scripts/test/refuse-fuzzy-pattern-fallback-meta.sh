#!/usr/bin/env bash
# scripts/test/refuse-fuzzy-pattern-fallback-meta.sh — Hermetic meta-test for the
# fuzzy-pattern-fallback refusal gate (Phase 7 Plan 07-01, Mandate C + Pitfall 7).
# Plants each banned import in kernel/src/drift/detector.ts and asserts the gate
# exits 1; clears and asserts exit 0.

set -euo pipefail

GATE="$(pwd)/scripts/ci/refuse-fuzzy-pattern-fallback.sh"
if [[ ! -x "$GATE" ]]; then
	echo "META-FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

mkdir -p "$TMP/kernel/src/drift"
mkdir -p "$TMP/scripts/ci"
cp "$GATE" "$TMP/scripts/ci/refuse-fuzzy-pattern-fallback.sh"
chmod +x "$TMP/scripts/ci/refuse-fuzzy-pattern-fallback.sh"
cd "$TMP"

git init -q
git config user.email "meta@test"
git config user.name "Meta Test"

# Each banned source must trip the gate.
BANNED=(
	"string-similarity"
	"levenshtein"
	"fuse.js"
	"fuzzysort"
	"match-sorter"
	"@anthropic-ai/sdk"
	"@openai/api"
)

for mod in "${BANNED[@]}"; do
	cat > kernel/src/drift/detector.ts <<EOF
import x from '${mod}';
export const detect = () => x;
EOF
	git add -A
	if bash scripts/ci/refuse-fuzzy-pattern-fallback.sh > /dev/null 2>&1; then
		echo "META-FAIL: fuzzy-pattern-fallback gate did NOT reject import from '${mod}'" >&2
		exit 1
	fi
	echo "  OK: gate rejected import from '${mod}'"
done

# CommonJS form must also trip the gate.
cat > kernel/src/drift/detector.ts <<'EOF'
const sim = require('string-similarity');
export const detect = () => sim;
EOF
git add -A
if bash scripts/ci/refuse-fuzzy-pattern-fallback.sh > /dev/null 2>&1; then
	echo "META-FAIL: fuzzy-pattern-fallback gate did NOT reject CommonJS require('string-similarity')" >&2
	exit 1
fi
echo "  OK: gate rejected CommonJS require('string-similarity')"

# Clean state: an honest deterministic detector with no banned imports.
cat > kernel/src/drift/detector.ts <<'EOF'
// Pure-deterministic detector — no fuzzy fallback, no LLM SDK.
import { z } from 'zod';
export function detect(): unknown[] { return []; }
EOF
git add -A
if ! bash scripts/ci/refuse-fuzzy-pattern-fallback.sh > /dev/null 2>&1; then
	echo "META-FAIL: fuzzy-pattern-fallback gate REJECTED a clean detector with no fuzzy/LLM imports" >&2
	exit 1
fi
echo "  OK: gate accepted clean deterministic detector"

# Empty-tree state: gate exits 0 cleanly.
rm -f kernel/src/drift/detector.ts
git add -A
if ! bash scripts/ci/refuse-fuzzy-pattern-fallback.sh > /dev/null 2>&1; then
	echo "META-FAIL: fuzzy-pattern-fallback gate did not exit 0 when kernel/src/drift/ has no .ts files" >&2
	exit 1
fi
echo "  OK: gate exited 0 when kernel/src/drift/ is absent"

echo "refuse-fuzzy-pattern-fallback-meta: OK"
