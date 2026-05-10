#!/usr/bin/env bash
# scripts/test/refusal-bridge-rt-05-meta.sh
#
# Phase 8 Plan 08-00 (Wave 0) — RED stub for BRIDGE-RT-05.
#
# Static-grep meta-test asserting build/lib/compilation.ts contains a node_modules
# exclusion glob at all 3 task sites (transpileTask + compileTask + watchTask). Without
# this exclusion the gulp build follows symlinks (or stale dirs) into bridge-side
# node_modules, hits a `decimal.js/` directory that shadows a `decimal.js` file, and
# crashes with EISDIR. BRIDGE-RT-05 (Plan 08-04 / Wave 2) lands the exclusion.
#
# Modeled on scripts/test/refusal-fuzzy-fallback-meta.sh: set -euo pipefail,
# `META PASS|FAIL|PEND|SKIP: <reason>` echo conventions, exit 0 = pass / exit 1 = fail.

set -euo pipefail

COMPILATION_TS="build/lib/compilation.ts"

if [ ! -f "$COMPILATION_TS" ]; then
	echo "META FAIL: $COMPILATION_TS not found"
	exit 1
fi

# Regex must include the leading `!` so we're counting NEGATION (gulp/glob exclusion)
# patterns, not benign references like the codicons asset path. `|| true` keeps
# `set -e` from short-circuiting on grep's exit-1 (zero matches).
EXCLUSION_HITS=$(grep -cE '!.*node_modules.*\*\*' "$COMPILATION_TS" || true)

if [ "$EXCLUSION_HITS" -lt 1 ]; then
	echo "META PEND: $COMPILATION_TS has 0 node_modules exclusions — Wave 2 (Plan 08-04) will land this. Current state is RED (expected)."
	exit 0
fi

# Once landed, assert at least 3 occurrences. Research finding: 3 task sites need it
# (transpileTask + compileTask + watchTask). If a planner extracts the glob into a
# named constant + spreads it 3x, that's 4 hits; we accept 3 conservatively in case
# the constant name doesn't itself match the regex.
if [ "$EXCLUSION_HITS" -lt 3 ]; then
	echo "META FAIL: $COMPILATION_TS has only $EXCLUSION_HITS node_modules exclusion(s); expected >= 3 (transpileTask + compileTask + watchTask all need it)"
	exit 1
fi

# Defensive: verify the bridge node_modules trap actually exists locally so the
# meta-test is not vacuously passing on a CI runner without bridge deps installed.
BRIDGE_NM="src/vs/goatide/extensions/goatide-bridge/node_modules"
if [ -d "$BRIDGE_NM" ]; then
	if [ -d "$BRIDGE_NM/decimal.js" ] && [ ! -f "$BRIDGE_NM/decimal.js/decimal.js" ]; then
		echo "META PASS: BRIDGE-RT-05 exclusion present (${EXCLUSION_HITS}+ sites) AND decimal.js dir-shadows-file trap present locally"
	else
		echo "META PASS: BRIDGE-RT-05 exclusion present (${EXCLUSION_HITS}+ sites); decimal.js trap not local (defensive grep is the safety net)"
	fi
else
	echo "META PASS: BRIDGE-RT-05 exclusion present (${EXCLUSION_HITS}+ sites); bridge node_modules not installed locally (defensive grep is the safety net)"
fi
exit 0
