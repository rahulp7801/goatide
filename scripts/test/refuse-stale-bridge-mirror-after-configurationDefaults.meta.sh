#!/usr/bin/env bash
# Phase 19 Plan 19-01 WALK-01 -- hermetic meta-test for bridge mirror byte-equality
# after the contributes.configurationDefaults patch lands in Wave 1.
#
# Research source: 19-RESEARCH.md Wave-0 Imperative #3. Pattern reference:
# scripts/test/refuse-stale-bridge-mirror-after-walkthrough.meta.sh (Phase 17 Wave 0).
#
# 3-phase test:
#   Phase 1 (positive): current mirror byte-equal to source -> gate exits 0.
#   Phase 2 (negative): temporarily perturb source-of-truth package.json -> gate exits 1.
#   Phase 3: restore (trap handles) + emit META PASS.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/src/vs/goatide/extensions/goatide-bridge/package.json"
GATE="$REPO_ROOT/scripts/ci/refuse-stale-bridge-mirror.sh"

if [[ ! -f "$SRC" ]]; then
	echo "META FAIL -- source-of-truth package.json not found at $SRC" >&2
	exit 1
fi
if [[ ! -x "$GATE" ]]; then
	echo "META FAIL -- $GATE does not exist or is not executable" >&2
	exit 1
fi

# Phase 1 (positive): current mirror byte-equal to source -> exit 0
if ! bash "$GATE" > /dev/null 2>&1; then
	echo "META FAIL -- phase 1 positive: mirror is stale BEFORE meta-test starts"
	echo "Fix: bash scripts/prepare_goatide.sh"
	exit 1
fi

# Phase 2 (negative): perturb source-of-truth; expect gate to exit 1
SRC_BACKUP=$(cat "$SRC")
trap 'printf "%s" "$SRC_BACKUP" > "$SRC"' EXIT

node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$SRC', 'utf8'));
p.contributes = p.contributes || {};
p.contributes.configurationDefaults = p.contributes.configurationDefaults || {};
p.contributes.configurationDefaults._phase19MetaProbeField = 'x';
fs.writeFileSync('$SRC', JSON.stringify(p, null, '\t'));
"

if bash "$GATE" > /dev/null 2>&1; then
	echo "META FAIL -- phase 2 negative: gate did NOT detect source/mirror drift after perturbing source-of-truth"
	exit 1
fi

# Phase 3: restore (trap handles) + emit META PASS
echo "META PASS"
exit 0
