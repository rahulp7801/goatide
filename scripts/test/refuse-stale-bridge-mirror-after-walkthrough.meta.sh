#!/usr/bin/env bash
# Phase 17 Plan 17-01 -- hermetic meta-test for bridge mirror regen completeness.
# Confirms refuse-stale-bridge-mirror.sh catches drift after adding
# walkthrough + configuration additions to the source-of-truth package.json.
#
# Phase 1 (positive): current mirror byte-equal to source -> gate exits 0.
# Phase 2 (negative): temporarily perturb source-of-truth package.json ->
#   gate must exit 1 (mirror is stale).
# Phase 3: restore (trap handles) + emit META PASS.
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
	echo "Run 'bash scripts/prepare_goatide.sh' or manually copy package.json + media/walkthrough/ to fix."
	exit 1
fi

# Phase 2 (negative): temporarily perturb source-of-truth; expect gate to exit 1
SRC_BACKUP=$(cat "$SRC")
trap 'printf "%s" "$SRC_BACKUP" > "$SRC"' EXIT

# Append a temp top-level field (legal JSON; not propagated to mirror)
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$SRC', 'utf8'));
p._tempMetaProbeField = 'x';
fs.writeFileSync('$SRC', JSON.stringify(p, null, '\t'));
"

if bash "$GATE" > /dev/null 2>&1; then
	echo "META FAIL -- phase 2 negative: gate did NOT detect source/mirror drift after perturbing source-of-truth"
	exit 1
fi

# Phase 3: restore (trap handles) + emit META PASS
echo "META PASS"
exit 0
