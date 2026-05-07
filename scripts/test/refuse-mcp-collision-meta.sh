#!/usr/bin/env bash
# scripts/test/refuse-mcp-collision-meta.sh — Hermetic meta-test for the MCP-collision
# refusal gate (Phase 6 Plan 06-01). Plants a duplicate register({provider:'X', tool:'Y'})
# call into a temp kernel/src/mcp/registry.ts and asserts the gate exits 1; clears the
# duplicate and asserts exit 0.
#
# Modeled on scripts/test/refuse-credential-leaks-meta.sh.

set -euo pipefail

GATE="$(pwd)/scripts/ci/refuse-mcp-collision.sh"
if [[ ! -x "$GATE" ]]; then
	echo "META-FAIL: $GATE does not exist or is not executable" >&2
	exit 1
fi

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

mkdir -p "$TMP/kernel/src/mcp"
cd "$TMP"

# Plant a registry.ts with a duplicate registration. Both lines derive 'github__issue_read'
# as the fully-namespaced name; the gate must catch the duplication.
cat > kernel/src/mcp/registry.ts <<'EOF'
// Sentinel test fixture — duplicate registration on purpose.
register({ provider: 'github', tool: 'issue_read', handler: a });
register({ provider: 'slack', tool: 'thread_fetch', handler: b });
register({ provider: 'github', tool: 'issue_read', handler: c });
EOF

if bash "$GATE" > /dev/null 2>&1; then
	echo "META-FAIL: collision gate did NOT reject duplicate github__issue_read registration" >&2
	exit 1
fi
echo "  OK: gate rejected duplicate github__issue_read registration"

# Clean state: remove the duplicate. Gate must exit 0.
cat > kernel/src/mcp/registry.ts <<'EOF'
// Sentinel test fixture — clean state, no duplicates.
register({ provider: 'github', tool: 'issue_read', handler: a });
register({ provider: 'slack', tool: 'thread_fetch', handler: b });
register({ provider: 'linear', tool: 'ticket_read', handler: c });
EOF

if ! bash "$GATE" > /dev/null 2>&1; then
	echo "META-FAIL: collision gate REJECTED a clean (non-duplicated) registry" >&2
	exit 1
fi
echo "  OK: gate accepted clean registry with 3 distinct namespaced names"

# No-registry-yet state: gate must exit 0 cleanly (Phase 6 Plan 06-01 baseline).
rm -f kernel/src/mcp/registry.ts
if ! bash "$GATE" > /dev/null 2>&1; then
	echo "META-FAIL: collision gate did not exit 0 when registry.ts is absent" >&2
	exit 1
fi
echo "  OK: gate exited 0 when kernel/src/mcp/registry.ts is absent"

echo "refuse-mcp-collision-meta: OK"
