#!/usr/bin/env bash
# scripts/test/refusal-build-rt-02-meta.sh
#
# Phase 9 Plan 09-00 (Wave 0) — RED stub for BUILD-RT-02.
#
# Static-grep meta-test asserting the root package.json `compile` script chains
# `transpile-client` so a fresh `npm install && npm run compile` produces a launchable
# out/. v1.0 ships with `compile: "npm run build-bridge && npm run gulp compile"` — no
# transpile-client invocation — which is why the integration-test workflow always ran
# `npm run compile && npm run transpile-client` as a tandem and masked the gap.
# BUILD-RT-02 (Plan 09-02 / Wave 1) lands the chain in package.json.
#
# Modeled on scripts/test/refusal-bridge-rt-05-meta.sh: set -euo pipefail,
# `META PASS|FAIL|PEND` echo conventions. NOTE polarity: Phase 9 uses exit 1 for both
# PEND and FAIL (where Phase 8 used exit 0 for PEND). The shift is intentional —
# Phase 9's purpose is to RED-fail until the Wave-1 fix lands, so Plan 09-06
# phase-verify can prove every stub flipped GREEN. PEND vs FAIL is differentiated by
# the message string, not the exit code.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$ROOT/package.json"

if [ ! -f "$PKG" ]; then
	echo "META FAIL: package.json not found at $PKG" >&2
	exit 1
fi

# GREEN-state assertion: the compile script chain MUST contain `transpile-client`.
# `set +e` around the grep is necessary because `set -euo pipefail` would otherwise
# short-circuit the script on grep exit-1 (zero matches) before we can branch.
set +e
grep -E '"compile"[[:space:]]*:[[:space:]]*"[^"]*transpile-client[^"]*"' "$PKG" > /dev/null
grep_ec=$?
set -e

case "$grep_ec" in
	0)
		echo "META PASS: compile script chains transpile-client (BUILD-RT-02)"
		exit 0
		;;
	1)
		echo "META PEND: compile script does not yet chain transpile-client — Plan 09-02 implements (BUILD-RT-02)"
		exit 1
		;;
	*)
		echo "META FAIL: grep error on $PKG (exit $grep_ec)" >&2
		exit 1
		;;
esac
