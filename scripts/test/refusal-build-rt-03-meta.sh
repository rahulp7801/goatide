#!/usr/bin/env bash
# scripts/test/refusal-build-rt-03-meta.sh
#
# Phase 9 Plan 09-00 (Wave 0) — RED stub for BUILD-RT-03.
#
# Asserts that the root node_modules @vscode/sqlite3 N-API binary lives at the
# canonical path AND that build/npm/postinstall.ts owns the copy step that
# materializes it from remote/node_modules/. v1.0 ships with the binary missing
# from root (remote/ has it; the bridge subtree mocha resolves to remote/ via npm
# workspaces, but the workbench resolves to root which 404s at runtime). The
# 2026-05-07 manual copy left the file on disk but no automation owns it — so the
# next `rm -rf node_modules && npm ci` repeats the v1.0 bug.
#
# Wave-0 stub does a STATIC two-prong check: (a) target binary present, (b)
# postinstall.ts has been patched (grep for vscode-sqlite3.node + copyFileSync).
# Wave-1 verify (Plan 09-03 task verify) does the DESTRUCTIVE re-install check.
#
# Modeled on scripts/test/refusal-bridge-rt-05-meta.sh: set -euo pipefail,
# `META PASS|FAIL|PEND` echo conventions. Phase 9 polarity: PEND exits 1.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="$ROOT/node_modules/@vscode/sqlite3/build/Release/vscode-sqlite3.node"
SOURCE="$ROOT/remote/node_modules/@vscode/sqlite3/build/Release/vscode-sqlite3.node"
POSTINSTALL="$ROOT/build/npm/postinstall.ts"

# The source binary is the prerequisite for the copy step. RESEARCH.md verified
# ~3MB N-API binary lives in remote/ after `npm install`. If it's missing, the
# stub cannot reach a meaningful conclusion — fail loudly so the investigation
# starts at the remote/ install rather than the root copy.
if [ ! -f "$SOURCE" ]; then
	echo "META FAIL: source binary missing at $SOURCE — investigate remote/ install" >&2
	exit 1
fi

if [ ! -f "$POSTINSTALL" ]; then
	echo "META FAIL: $POSTINSTALL not found — cannot evaluate BUILD-RT-03 patch state" >&2
	exit 1
fi

# Grep postinstall.ts for the BUILD-RT-03 insertion markers. Both literals must
# appear for the patch to be considered landed:
#   - `vscode-sqlite3.node` (filename literal — paths or string keys)
#   - `copyFileSync`        (the fs API call doing the copy)
# These are independent greps because Plan 09-03 may name a constant or wrap the
# copy in a helper — we don't pre-constrain the implementation shape.
set +e
grep -q 'vscode-sqlite3\.node' "$POSTINSTALL"
has_filename=$?
grep -q 'copyFileSync' "$POSTINSTALL"
has_copyfs=$?
set -e

patch_landed=0
if [ "$has_filename" -eq 0 ] && [ "$has_copyfs" -eq 0 ]; then
	patch_landed=1
fi

target_present=0
if [ -f "$TARGET" ]; then
	target_present=1
fi

if [ "$target_present" -eq 1 ] && [ "$patch_landed" -eq 1 ]; then
	echo "META PASS: root sqlite3 binary present and postinstall.ts owns the copy step (BUILD-RT-03)"
	exit 0
fi

if [ "$target_present" -eq 1 ] && [ "$patch_landed" -eq 0 ]; then
	echo "META PEND: root sqlite3 binary present from manual copy, but postinstall.ts has not been wired yet — Plan 09-03 implements (BUILD-RT-03)"
	exit 1
fi

echo "META PEND: root sqlite3 binary missing AND postinstall.ts has not been wired — Plan 09-03 implements (BUILD-RT-03)"
exit 1
