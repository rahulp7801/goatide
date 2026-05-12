#!/usr/bin/env bash
# Phase 12 (Plan 12-04) — Refuse a stale bridge mirror.
#
# Pitfall 9 from .planning/phases/12-robustness-hardening/12-RESEARCH.md: the bridge mirror
# at extensions/goatide-bridge/ is propagated from src/vs/goatide/extensions/goatide-bridge/
# by scripts/prepare_goatide.sh:154-178 (BRIDGE-RT-04 closure). When source changes land
# without re-running compile, the mirror drifts and the IDE-as-shipped loads stale code.
# This gate is the build-time assertion that catches the drift.
#
# Plan 12-04 narrowing: prepare_goatide.sh performs a WHOLE-FILE `cp package.json` at line
# 158 (no JSON surgery is applied to the mirror's manifest), so EVERY field — including
# `scripts` and `devDependencies` — must be byte-equal to the source-of-truth. The Wave-0
# baseline allowlisted `scripts` + `devDependencies` defensively (in case prepare_goatide.sh
# stripped fields), but inspection confirms it does not: `npm ci --omit=dev` operates on
# `node_modules/` only, never on `package.json`. The mirror's manifest is therefore an exact
# copy. Removing the allowlist closes the silent-drift hole the Wave-0 verify log surfaced
# (`scripts.test` divergence: stub `mocha` vs real `node scripts/run-mocha-electron.cjs`).
#
# Exit codes:
#   0 — mirror in sync (canonical JSON equal, all fields)
#   1 — drift detected (unified diff printed to stderr)
#   2 — input file missing
set -euo pipefail

REAL_PKG="src/vs/goatide/extensions/goatide-bridge/package.json"
STUB_PKG="extensions/goatide-bridge/package.json"

if [ ! -f "$REAL_PKG" ]; then
	echo "refuse-stale-bridge-mirror: missing source-of-truth package.json at $REAL_PKG" >&2
	exit 2
fi
if [ ! -f "$STUB_PKG" ]; then
	echo "refuse-stale-bridge-mirror: missing mirror package.json at $STUB_PKG" >&2
	exit 2
fi

# Canonicalize each package.json: pretty-print with stable key order at every nesting level.
# node is guaranteed available; jq is NOT (Windows git-bash + fresh CI may lack it).
canonicalize() {
	local path="$1"
	node -e '
		const fs = require("fs");
		function sortRecursive(value) {
			if (Array.isArray(value)) {
				return value.map(sortRecursive);
			}
			if (value !== null && typeof value === "object") {
				const out = {};
				for (const key of Object.keys(value).sort()) {
					out[key] = sortRecursive(value[key]);
				}
				return out;
			}
			return value;
		}
		const raw = fs.readFileSync(process.argv[1], "utf8");
		const pkg = JSON.parse(raw);
		process.stdout.write(JSON.stringify(sortRecursive(pkg), null, 2) + "\n");
	' "$path"
}

REAL_CANON=$(mktemp)
STUB_CANON=$(mktemp)
trap 'rm -f "$REAL_CANON" "$STUB_CANON"' EXIT

canonicalize "$REAL_PKG" > "$REAL_CANON"
canonicalize "$STUB_PKG" > "$STUB_CANON"

if diff -u "$STUB_CANON" "$REAL_CANON" > /dev/null; then
	echo "OK: bridge mirror in sync (stub vs real package.json, byte-equal across all fields)"
	exit 0
fi

echo "refuse-stale-bridge-mirror: drift detected between $STUB_PKG and $REAL_PKG (byte-equal expected across all fields)" >&2
echo "" >&2
echo "--- $STUB_PKG (canonical)" >&2
echo "+++ $REAL_PKG (canonical)" >&2
diff -u "$STUB_CANON" "$REAL_CANON" >&2 || true
echo "" >&2
echo "Fix: re-run \`bash scripts/prepare_goatide.sh\` to regenerate the mirror, or run \`npm run compile\` which chains build-bridge → prepare_goatide.sh." >&2
exit 1
