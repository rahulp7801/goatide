#!/usr/bin/env bash
# Phase 7 (Plan 07-01) — Refuse unbounded ripple walk.
#
# Constitutional pin (Pitfall 4 + DRIFT-05 ROADMAP truth): the ripple analysis 3-hop cap
# is non-negotiable. A ContractNode connected to a hub library produces a 125,000-node
# blast radius at 4 hops; the 1-second SC-#5 budget cannot accommodate that. This gate
# static-greps kernel/src/drift/ripple*.ts for `max_hops: <integer>` literals and asserts
# every hit has integer <= 3.
#
# Wave-0 (Plan 07-01): kernel/src/drift/ripple*.ts does not yet exist. Gate exits 0
# cleanly. Plan 07-04 lands the ripple module; this gate engages then.
#
# Modeled on scripts/ci/refuse-non-loopback-mcp-bind.sh.
#
# Exit codes:
#   0 — every max_hops literal is <= 3 (or no ripple file exists yet)
#   1 — at least one max_hops literal exceeds 3
set -euo pipefail

KERNEL_DRIFT="kernel/src/drift"

mapfile -t FILES < <(git ls-files 2>/dev/null | grep -E "^${KERNEL_DRIFT}/(ripple|constraint-lift).*\.ts$" || true)

EXISTING=()
for f in "${FILES[@]}"; do
	[ -f "$f" ] && EXISTING+=("$f")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
	echo "Phase-7 unbounded-ripple-walk gate ok — kernel/src/drift/(ripple|constraint-lift)*.ts not yet present (Plan 07-04 ships it)."
	exit 0
fi

VIOLATIONS=0
for f in "${EXISTING[@]}"; do
	# Capture every `max_hops: <N>` integer literal. rg -o emits the matched substring;
	# the trailing pipe extracts the integer for the > 3 comparison.
	mapfile -t HITS < <(rg --no-heading -no -e 'max_hops\s*:\s*[0-9]+' "$f" 2>/dev/null || true)
	for hit in "${HITS[@]}"; do
		# hit format: <line>:max_hops: <N>  → extract trailing integer
		N=$(echo "$hit" | grep -oE '[0-9]+$' || echo 0)
		if [ "$N" -gt 3 ]; then
			echo "Phase-7 DRIFT-05 unbounded-ripple-walk violation — $f: $hit (max_hops=$N exceeds 3-hop cap)"
			VIOLATIONS=1
		fi
	done
done

if [ "$VIOLATIONS" -eq 0 ]; then
	echo "Phase-7 unbounded-ripple-walk gate ok — every max_hops literal in kernel/src/drift/(ripple|constraint-lift)*.ts is <= 3."
fi
exit "$VIOLATIONS"
