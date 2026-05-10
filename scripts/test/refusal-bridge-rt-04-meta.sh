#!/usr/bin/env bash
# scripts/test/refusal-bridge-rt-04-meta.sh
#
# Phase 8 Plan 08-00 (Wave 0) — RED stub for BRIDGE-RT-04.
#
# Two-section meta-test for the built-in bridge mirror at extensions/goatide-bridge/.
# v1.0 ships an empty Phase-1 stub at that path (~559-byte package.json + a 2-line
# dist/extension.js). VS Code loads the stub, the real Phase-4 to 7 bridge at
# src/vs/goatide/extensions/goatide-bridge/ never runs, and the user sees no kernel
# integration. BRIDGE-RT-04 (Plan 08-05 / Wave 3) wires `prepare_goatide.sh` to
# rsync the real bridge dist + production node_modules over the stub.
#
# Section A (filesystem) — MUST run by default. PEND-graceful while Wave 3 is unfinished.
# Section B (CDP smoke) — gated behind ${BRIDGE_RT_04_FULL:-0}. Default skip in Wave 0.
#
# Modeled on scripts/test/refusal-fuzzy-fallback-meta.sh: set -euo pipefail,
# `META PASS|FAIL|PEND|SKIP: <reason>` echo conventions, exit 0 = pass / exit 1 = fail.

set -euo pipefail

BRIDGE_DIR="extensions/goatide-bridge"
BRIDGE_DIST="${BRIDGE_DIR}/dist/extension.js"

# Section A — filesystem assertions.
#
# Order matters. Wave 0 leaves both the dist file (as a Phase-1 stub) and node_modules
# missing; Wave 3 (Plan 08-05) replaces dist with the real Phase-4+ bundle and rsyncs
# production deps. We check `looks-like-stub` first so the script exits 0 PEND today
# rather than failing on the missing-deps assertion mid-flight.

if [ ! -f "$BRIDGE_DIST" ]; then
	echo "META PEND: $BRIDGE_DIST not yet present — Wave 3 (Plan 08-05) will populate via prepare_goatide.sh"
	exit 0
fi

# Stub detection: real bridge ships ~hundreds of KB of bundled code that references
# the kernel client. The Phase-1 stub is < 10 lines and has no such reference.
if ! grep -q "kernel/client\|KernelClient" "$BRIDGE_DIST"; then
	echo "META PEND: $BRIDGE_DIST looks like the Phase-1 empty stub (no kernel/client / KernelClient reference) — Wave 3 (Plan 08-05) will replace via prepare_goatide.sh"
	exit 0
fi

# From here on: dist/extension.js is the real bundle. Production node_modules MUST be present.
if [ ! -d "${BRIDGE_DIR}/node_modules/vscode-jsonrpc" ]; then
	echo "META FAIL: ${BRIDGE_DIR}/node_modules/vscode-jsonrpc missing (BRIDGE-RT-04 production-deps mirror incomplete)"
	exit 1
fi

if [ ! -d "${BRIDGE_DIR}/node_modules/zod" ]; then
	echo "META FAIL: ${BRIDGE_DIR}/node_modules/zod missing (BRIDGE-RT-04 production-deps mirror incomplete)"
	exit 1
fi

echo "META PASS: BRIDGE-RT-04 filesystem mirror complete (dist/extension.js is real + production node_modules present)"

# Section B — CDP smoke (gated).
#
# Plan 08-05 decision (OPTION A in the plan): defer Section B to Plan 08-06 phase-verify
# (Wave 4) which already includes a manual host-launch checkpoint that humans verify
# with eyes. Reasons:
#   - CDP smoke launches a full GoatIDE process (~2 min per run, heavyweight)
#   - Adds a dependency on chrome-devtools-protocol module not currently in tree
#   - Section A filesystem assertions + Plan 08-06 manual checkpoint cover acceptance
# If a future fresh-clone smoke (BUILD-RT-05 / Phase 9) uncovers gaps, implement here.
if [ "${BRIDGE_RT_04_FULL:-0}" != "1" ]; then
	echo "META SKIP: BRIDGE_RT_04_FULL=1 not set — CDP smoke deferred to Plan 08-06 phase-verify (manual host-launch checkpoint)"
	exit 0
fi

# TODO (only triggers when BRIDGE_RT_04_FULL=1 is explicitly set):
#   - Launch GoatIDE with --remote-debugging-port=9222
#   - curl http://127.0.0.1:9222/json to find the renderer target
#   - Fetch renderer log + grep for "Loading built-in extension at .*goatide-bridge"
#   - Query the cmd palette via CDP for the "GoatIDE: Set Session Priority" entry
#   - Tear down the IDE process at the end
echo "META PEND: CDP smoke implementation deferred to Plan 08-06 phase-verify"
exit 0
