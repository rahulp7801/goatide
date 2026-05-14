#!/usr/bin/env bash
# scripts/test/refuse-cytoscape-in-mirror.meta.sh — Phase 15 Plan 15-01 SC#4 regression gate.
#
# Phase 15 adds cytoscape + cytoscape-fcose + @types/cytoscape to the bridge's
# devDependencies. esbuild bundles cytoscape into dist/inspector/index.js (webview IIFE);
# the bridge mirror (extensions/goatide-bridge/) installs ONLY production deps via
# `npm ci --omit=dev`, so the cytoscape* packages must NEVER appear under
# extensions/goatide-bridge/node_modules/. If they do, two regressions land:
#   (1) the mirror's installed-size balloons by ~3MB for code never executed in the host
#   (2) refuse-stale-bridge-mirror.sh + future prod-deps audits will see drift
#
# Sibling pattern to scripts/test/refuse-deep05-write.meta.sh (Phase 14 Wave-0 fence).
# Single-line META PASS / META FAIL output for easy CI grep continuity.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
MIRROR_NMM="${REPO_ROOT}/extensions/goatide-bridge/node_modules"

# Phase 1 — positive control: assert the mirror's node_modules has no cytoscape* directory.
# If node_modules doesn't exist at all (fresh clone before prepare_goatide.sh runs), the
# check is vacuously true.
if [ -d "$MIRROR_NMM" ]; then
	if ls "$MIRROR_NMM" 2>/dev/null | grep -qE '^cytoscape'; then
		echo "META FAIL: cytoscape* found in $MIRROR_NMM (SC#4 violation — devDeps leaked into mirror)" >&2
		ls "$MIRROR_NMM" | grep -E '^cytoscape' >&2
		exit 1
	fi
	if ls "$MIRROR_NMM" 2>/dev/null | grep -qE '^@types$'; then
		if [ -d "$MIRROR_NMM/@types/cytoscape" ]; then
			echo "META FAIL: @types/cytoscape found in $MIRROR_NMM (SC#4 violation — devDeps leaked)" >&2
			exit 1
		fi
	fi
fi

# Phase 2 — defensive: also confirm cytoscape is in src-of-truth devDependencies, NOT
# dependencies. If it ever migrates to dependencies, `npm ci --omit=dev` in
# prepare_goatide.sh WILL install it into the mirror's node_modules and trip Phase 1 next
# run; catching the placement now avoids the lossy detour.
SRC_PKG="${REPO_ROOT}/src/vs/goatide/extensions/goatide-bridge/package.json"
if [ ! -f "$SRC_PKG" ]; then
	echo "META FAIL: source-of-truth package.json missing: $SRC_PKG" >&2
	exit 1
fi
if grep -qE '"cytoscape":' "$SRC_PKG" && ! grep -E -A 200 '"devDependencies"' "$SRC_PKG" | grep -qE '"cytoscape":'; then
	echo "META FAIL: cytoscape is in dependencies (must be in devDependencies)" >&2
	exit 1
fi

echo "META PASS"
exit 0
