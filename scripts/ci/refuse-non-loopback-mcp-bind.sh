#!/usr/bin/env bash
# Phase 6 (Plan 06-01) — Refuse non-loopback bind addresses in the MCP server tree.
#
# Constitutional pin (Pitfall 10): the MCP HTTP server MUST bind 127.0.0.1 (or [::1])
# LITERALLY. NEVER 0.0.0.0 (any-interface IPv4 — public-facing), NEVER :: (any-interface
# IPv6 — public-facing), NEVER 'localhost' (DNS-resolution-ambiguous; some Node/Express
# combinations resolve to 0.0.0.0 first). This gate static-greps kernel/src/mcp/server/**
# for those banned bind strings.
#
# Modeled on refuse-fuzzy-fallback.sh — same git-ls-files + grep filter pattern for
# Windows-mingw safety.
#
# Exit codes:
#   0 — no banned bind address found (or no MCP server tree yet)
#   1 — at least one banned bind address found
set -euo pipefail

# Banned bind tokens. The literal string forms are what app.listen / server.listen take —
# we grep for the quoted form to avoid catching incidental 0.0.0.0 mentions in comments
# unrelated to bind addresses (every real bind passes a quoted string).
BANNED_PATTERNS=(
	"'0\.0\.0\.0'"
	"\"0\.0\.0\.0\""
	"'::'"
	"\"::\""
)

# Scan only kernel/src/mcp/server/** TypeScript sources. The bridge half of MCP work
# (Plans 06-06 et al.) doesn't bind sockets so it's exempt.
mapfile -t FILES < <(git ls-files | grep -E '^kernel/src/mcp/server/.*\.ts$' || true)

EXISTING=()
for f in "${FILES[@]}"; do
	[ -f "$f" ] && EXISTING+=("$f")
done

FOUND=0
if [ "${#EXISTING[@]}" -gt 0 ]; then
	for p in "${BANNED_PATTERNS[@]}"; do
		HITS=$(rg --no-heading -e "$p" "${EXISTING[@]}" 2>/dev/null || true)
		if [ -n "$HITS" ]; then
			echo "Phase-6 Pitfall-10 violation — banned non-loopback bind address '$p':"
			echo "$HITS" | head -5
			FOUND=1
		fi
	done
fi

# Soft-warn on 'localhost' (not a hard ban — some test fixtures legitimately reference
# the string 'http://localhost' as an Origin allowlist entry). Only warn when 'localhost'
# appears adjacent to a .listen( call, which is the bind-address footgun.
if [ "${#EXISTING[@]}" -gt 0 ]; then
	LOCALHOST_BIND=$(rg --no-heading -e "\.listen\([^)]*'localhost'" -e '\.listen\([^)]*"localhost"' "${EXISTING[@]}" 2>/dev/null || true)
	if [ -n "$LOCALHOST_BIND" ]; then
		echo "Phase-6 Pitfall-10 warning — 'localhost' as bind address resolves DNS-ambiguously; prefer literal '127.0.0.1':"
		echo "$LOCALHOST_BIND" | head -5
		FOUND=1
	fi
fi

if [ "$FOUND" -eq 0 ]; then
	echo "Phase-6 Pitfall-10 ok — no non-loopback bind in kernel/src/mcp/server/."
fi
exit "$FOUND"
