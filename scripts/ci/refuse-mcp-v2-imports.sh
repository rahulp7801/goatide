#!/usr/bin/env bash
# Phase 6 (Plan 06-01) — Refuse @modelcontextprotocol/server or .../client v2-alpha imports.
#
# Constitutional pin (Pitfall 9): GoatIDE pins the MCP SDK to v1.x via the bare-package import
#   import { McpServer } from '@modelcontextprotocol/sdk/server/...'
# The v2-alpha line ships under separate package names:
#   import { Server } from '@modelcontextprotocol/server'
#   import { Client } from '@modelcontextprotocol/client'
# The v2 SDK has unstable type signatures + breaking transport changes; this gate prevents
# accidental adoption.
#
# Exit codes:
#   0 — only v1 subpath imports found
#   1 — at least one v2-alpha import found
set -euo pipefail

BANNED_PATTERNS=(
	"from '@modelcontextprotocol/server'"
	"from \"@modelcontextprotocol/server\""
	"from '@modelcontextprotocol/client'"
	"from \"@modelcontextprotocol/client\""
	"require\(['\"]@modelcontextprotocol/server['\"]\)"
	"require\(['\"]@modelcontextprotocol/client['\"]\)"
)

# Scan kernel/src/mcp/**, plus future bridge surfaces under src/vs/goatide/**/mcp/.
mapfile -t FILES < <(git ls-files | grep -E '^(kernel/src/mcp/.*\.ts|src/vs/goatide/.*mcp.*\.ts)$' || true)

EXISTING=()
for f in "${FILES[@]}"; do
	[ -f "$f" ] && EXISTING+=("$f")
done

FOUND=0
if [ "${#EXISTING[@]}" -gt 0 ]; then
	for p in "${BANNED_PATTERNS[@]}"; do
		HITS=$(rg --no-heading -e "$p" "${EXISTING[@]}" 2>/dev/null || true)
		if [ -n "$HITS" ]; then
			echo "Phase-6 Pitfall-9 violation — v2-alpha MCP SDK import detected:"
			echo "$HITS" | head -5
			FOUND=1
		fi
	done
fi

if [ "$FOUND" -eq 0 ]; then
	echo "Phase-6 Pitfall-9 ok — only v1 SDK subpath imports in kernel/src/mcp/."
fi
exit "$FOUND"
