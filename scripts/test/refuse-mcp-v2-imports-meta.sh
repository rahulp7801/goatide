#!/usr/bin/env bash
# scripts/test/refuse-mcp-v2-imports-meta.sh — Hermetic meta-test for the v2-imports refusal
# gate (Phase 6 Plan 06-01, Pitfall 9). Plants a v2-alpha import line into a tracked file
# under kernel/src/mcp/ and asserts the gate exits 1; clears and asserts exit 0.
#
# Modeled on scripts/test/refuse-credential-leaks-meta.sh.

set -euo pipefail

GATE="$(pwd)/scripts/ci/refuse-mcp-v2-imports.sh"
if [[ ! -x "$GATE" ]]; then
	echo "META-FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

# This gate uses `git ls-files` so we must run inside a temp git repo with the planted file
# tracked (git add). Mirrors the refusal-fuzzy-fallback meta-test pattern.
TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

mkdir -p "$TMP/kernel/src/mcp/server"
mkdir -p "$TMP/scripts/ci"
cp "$GATE" "$TMP/scripts/ci/refuse-mcp-v2-imports.sh"
chmod +x "$TMP/scripts/ci/refuse-mcp-v2-imports.sh"
cd "$TMP"

git init -q
git config user.email "meta@test"
git config user.name "Meta Test"

PLANTS=(
	"import { Server } from '@modelcontextprotocol/server';"
	"import { Client } from '@modelcontextprotocol/client';"
	"const x = require('@modelcontextprotocol/server');"
	"const y = require('@modelcontextprotocol/client');"
)

for plant in "${PLANTS[@]}"; do
	echo "$plant" > kernel/src/mcp/server/sentinel.ts
	git add -A
	if bash scripts/ci/refuse-mcp-v2-imports.sh > /dev/null 2>&1; then
		echo "META-FAIL: v2-imports gate did NOT reject pattern: $plant" >&2
		exit 1
	fi
	echo "  OK: gate rejected '${plant:0:48}...'"
done

# Clean state: replace with a v1 SDK subpath import.
cat > kernel/src/mcp/server/sentinel.ts <<'EOF'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
EOF
git add -A
if ! bash scripts/ci/refuse-mcp-v2-imports.sh > /dev/null 2>&1; then
	echo "META-FAIL: v2-imports gate REJECTED a clean v1-only import file" >&2
	exit 1
fi
echo "  OK: gate accepted clean v1 SDK subpath imports"

echo "refuse-mcp-v2-imports-meta: OK"
