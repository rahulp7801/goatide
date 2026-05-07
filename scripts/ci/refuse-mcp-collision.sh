#!/usr/bin/env bash
# Phase 6 (Plan 06-01) — Refuse colliding MCP tool names.
#
# Plan 06-03 introduces the consume-side tool registry: every external-provider tool gets
# namespaced via `<provider>__<tool>` (double-underscore). Two providers happening to expose
# `issue_read` cannot collide (they become github__issue_read and slack__issue_read). But
# accidental duplicate registration of the same fully-namespaced name across two register()
# call sites is a real bug — this gate static-greps for it.
#
# v1 baseline: scan kernel/src/mcp/registry.ts (Plan 06-03's source-of-truth) for
# `register({provider: ..., tool: ...})` calls; collect derived names; assert no dup.
# v1.1 may evolve to AST-based scan.
#
# Exit codes:
#   0 — no duplicate registration found (or registry not present yet)
#   1 — at least one duplicate registration found
set -euo pipefail

REGISTRY="kernel/src/mcp/registry.ts"

# Plan 06-03 hasn't landed registry.ts yet — exit 0 cleanly if missing. The gate becomes
# active automatically once 06-03 ships the file.
if [ ! -f "$REGISTRY" ]; then
	echo "Phase-6 collision gate ok — kernel/src/mcp/registry.ts not yet present (Plan 06-03 ships it)."
	exit 0
fi

# Extract `<provider>__<tool>` identifiers from register({provider:'X', tool:'Y'}) calls.
# Tolerant of either single or double quotes, optional whitespace.
NAMES=$(rg --no-heading -o -e "register\(\s*\{\s*provider\s*:\s*['\"]([^'\"]+)['\"]\s*,\s*tool\s*:\s*['\"]([^'\"]+)['\"]" -r '$1__$2' "$REGISTRY" 2>/dev/null || true)

if [ -z "$NAMES" ]; then
	echo "Phase-6 collision gate ok — no register() calls found in $REGISTRY."
	exit 0
fi

DUPS=$(echo "$NAMES" | sort | uniq -d || true)
if [ -n "$DUPS" ]; then
	echo "Phase-6 MCP-02 collision violation — duplicate tool registration:"
	echo "$DUPS"
	exit 1
fi

echo "Phase-6 collision gate ok — $(echo "$NAMES" | wc -l | tr -d ' ') distinct tool names registered."
exit 0
