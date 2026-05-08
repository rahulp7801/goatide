#!/usr/bin/env bash
# Phase 7 (Plan 07-01) — Refuse silent contract-override paths.
#
# Constitutional pin: every override of a Contract lock MUST seed an Attempt with
# attempt_kind='contract_override'. Bypassing this seed (silent override) breaks the
# DRIFT-06 audit trail (07-RESEARCH.md ## Pitfall 1 + ROADMAP truth).
#
# Strategy: scan kernel/src/drift/ + bridge/src/save-gate/ TypeScript sources for any
# function definition whose name contains 'override' (case-insensitive). For every such
# function, the surrounding file MUST also contain either:
#   - the literal token `attempt_kind: 'contract_override'`
#   - the literal token `attempt_kind: "contract_override"`
#   - the function call `recordContractOverride`
# If a file declares an override-named function but contains NONE of these three sentinels,
# the gate fires — assumption is the override path bypassed the audit seed.
#
# Wave-0 (Plan 07-01): kernel/src/drift/ and bridge/src/save-gate/ may not yet exist or
# may be empty. Gate exits 0 cleanly in that case. Plans 07-06 (DRIFT-06 implementation)
# + 07-07 (bridge save-gate wiring) bring code under audit.
#
# Modeled on scripts/ci/refuse-mcp-collision.sh.
#
# Exit codes:
#   0 — no silent-override path found (or trees not yet populated)
#   1 — at least one file declares an override-named function but lacks the audit sentinels
set -euo pipefail

KERNEL_DRIFT="kernel/src/drift"
BRIDGE_SAVE_GATE="src/vs/goatide/extensions/goatide-bridge/src/save-gate"

# Gather candidate files. git ls-files for tracked-only — Pitfall 8 from 04-RESEARCH.md.
mapfile -t FILES < <(git ls-files 2>/dev/null | grep -E "^(${KERNEL_DRIFT}|${BRIDGE_SAVE_GATE})/.*\.ts$" || true)

EXISTING=()
for f in "${FILES[@]}"; do
	[ -f "$f" ] && EXISTING+=("$f")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
	echo "Phase-7 silent-override gate ok — neither kernel/src/drift/ nor bridge/src/save-gate/ tracks any TS files yet (Plans 07-06 + 07-07 ship them)."
	exit 0
fi

VIOLATIONS=0
for f in "${EXISTING[@]}"; do
	# Look for functions whose name contains 'override' (case-insensitive). The {/} braces
	# are escaped (rg ripgrep regex flavor treats {N} as quantifier); avoid them entirely
	# by anchoring on declaration syntax rather than block opener.
	OVERRIDE_FNS=$(rg --no-heading -ic -e 'function\s+\w*[oO]verride\w*\s*\(' -e 'const\s+\w*[oO]verride\w*\s*=' -e 'export\s+(default\s+)?function\s+\w*[oO]verride\w*' -e 'async\s+function\s+\w*[oO]verride\w*' "$f" 2>/dev/null || true)
	# rg -c returns count; treat zero or empty as "no override-named function".
	if [ -z "$OVERRIDE_FNS" ] || [ "$OVERRIDE_FNS" = "0" ]; then
		continue
	fi
	# File declares an override-named function. Audit sentinels must be present.
	if rg --no-heading -q -e "attempt_kind\s*:\s*['\"]contract_override['\"]" -e "recordContractOverride\s*\(" "$f" 2>/dev/null; then
		continue
	fi
	echo "Phase-7 DRIFT-06 silent-override violation — $f declares an override-named function but lacks attempt_kind:'contract_override' or recordContractOverride() call:"
	rg --no-heading -n -e 'function\s+\w*[oO]verride\w*\s*\(' -e 'const\s+\w*[oO]verride\w*\s*=' "$f" 2>/dev/null | head -5
	VIOLATIONS=1
done

if [ "$VIOLATIONS" -eq 0 ]; then
	echo "Phase-7 silent-override gate ok — every override-named function ($(echo "${EXISTING[@]}" | wc -w) file(s) scanned) seeds the contract_override Attempt."
fi
exit "$VIOLATIONS"
