#!/usr/bin/env bash
# scripts/test/refusal-build-rt-04-meta.sh
#
# Phase 9 Plan 09-00 (Wave 0) — RED stub for BUILD-RT-04.
#
# Asserts that the kernel/ subpackage has a postinstall hook that materializes
# an Electron-ABI-compatible better-sqlite3 binary AND that the binary actually
# loads under the Node runtime (Section B). v1.0 ships kernel/node_modules with
# the better-sqlite3 binary built against Node 22 ABI (127) — Electron 39 expects
# ABI 140 — so the daemon crashes on first `require('better-sqlite3')` under
# Electron-as-Node. BUILD-RT-04 (Plan 09-04 / Wave 1) lands the kernel postinstall
# fetching the prebuilt binary for the matching Electron ABI.
#
# Section A — Static checks (always run; fast):
#   1. kernel/package.json exists
#   2. kernel/package.json scripts.postinstall is defined OR
#      kernel/scripts/install-electron-prebuild.cjs exists
#
# Section B — Runtime checks (gated):
#   1. Node load:     `node -e "require('better-sqlite3').prepare('SELECT 1').get()"`
#   2. Electron load: only runs if BUILD_RT_04_FULL=1 (matches Phase-8 precedent
#      for refusal-bridge-rt-04-meta.sh Section B). Requires Electron on PATH —
#      without that, the stub flakes on CI runners that have no Electron available.
#
# Modeled on scripts/test/refusal-bridge-rt-04-meta.sh: set -euo pipefail,
# `META PASS|FAIL|PEND` echo conventions. Phase 9 polarity: PEND exits 1.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KERNEL="$ROOT/kernel"
KERNEL_PKG="$KERNEL/package.json"
PREBUILD_SCRIPT="$KERNEL/scripts/install-electron-prebuild.cjs"

# Section A — Static checks.
if [ ! -f "$KERNEL_PKG" ]; then
	echo "META FAIL: $KERNEL_PKG not found — kernel subpackage missing" >&2
	exit 1
fi

# Check (a) postinstall hook in package.json scripts AND/OR (b) the installer cjs file.
# Either signal is sufficient for "postinstall wired". JSON parse via fs.readFileSync
# instead of require() because Git Bash on Windows mangles absolute paths (drive-letter
# `/c/...`) such that node's require() treats them as relative — fs.readFileSync accepts
# the mangled form correctly.
has_postinstall_script=$(KERNEL_PKG="$KERNEL_PKG" node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync(process.env.KERNEL_PKG,'utf8')); process.stdout.write(p.scripts && p.scripts.postinstall ? '1' : '0');")
has_prebuild_cjs=0
if [ -f "$PREBUILD_SCRIPT" ]; then
	has_prebuild_cjs=1
fi

if [ "$has_postinstall_script" = "0" ] && [ "$has_prebuild_cjs" -eq 0 ]; then
	echo "META PEND: kernel/postinstall not wired — Plan 09-04 implements (BUILD-RT-04)"
	exit 1
fi

# Section A passes. Section B Node-load check is always cheap; run it now.
# `cd "$KERNEL"` ensures `require('better-sqlite3')` resolves against kernel/node_modules.
set +e
node_load_output=$(cd "$KERNEL" && node -e "require('better-sqlite3').prepare('SELECT 1').get()" 2>&1)
node_load_ec=$?
set -e

if [ "$node_load_ec" -ne 0 ]; then
	echo "META FAIL: kernel postinstall script present but better-sqlite3 doesn't load under node — check ABI mismatch" >&2
	echo "Node load output:" >&2
	echo "$node_load_output" >&2
	exit 1
fi

# Section B Electron-load check is gated. Without BUILD_RT_04_FULL=1, we stop here
# with a PASS for the Node half — same gating pattern as refusal-bridge-rt-04.
if [ "${BUILD_RT_04_FULL:-0}" != "1" ]; then
	echo "META PASS: kernel postinstall present + better-sqlite3 loads under node (BUILD-RT-04)"
	echo "META SKIP: BUILD_RT_04_FULL=1 not set — Electron-as-Node load deferred to Plan 09-06 phase-verify"
	exit 0
fi

# Section B (full) — Electron-as-Node load.
# Resolves the Electron binary the build uses (.build/electron/) and runs it as
# Node via the standard --eval mode. The Electron binary path matches the Plan
# 06-08 prepare_goatide pattern.
ELECTRON_BIN_CANDIDATES=(
	"$ROOT/.build/electron/GoatIDE.exe"
	"$ROOT/.build/electron/Code - OSS.exe"
	"$ROOT/.build/electron/electron"
	"$ROOT/.build/electron/electron.exe"
)

ELECTRON_BIN=""
for cand in "${ELECTRON_BIN_CANDIDATES[@]}"; do
	if [ -f "$cand" ]; then
		ELECTRON_BIN="$cand"
		break
	fi
done

if [ -z "$ELECTRON_BIN" ]; then
	echo "META PEND: BUILD_RT_04_FULL=1 set but no .build/electron binary found — run `npm run electron` first to materialize" >&2
	exit 1
fi

set +e
electron_load_output=$(cd "$KERNEL" && ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" -e "require('better-sqlite3').prepare('SELECT 1').get()" 2>&1)
electron_load_ec=$?
set -e

if [ "$electron_load_ec" -ne 0 ]; then
	echo "META FAIL: better-sqlite3 loads under node but FAILS under Electron-as-Node — ABI mismatch (Node ABI vs Electron ABI)" >&2
	echo "Electron load output:" >&2
	echo "$electron_load_output" >&2
	exit 1
fi

echo "META PASS: kernel postinstall present + better-sqlite3 loads under BOTH node AND Electron-as-Node (BUILD-RT-04 SC #3)"
exit 0
