#!/usr/bin/env bash
# scripts/test/refusal-close-01-abi-rebuild-meta.sh
#
# Phase 13 Plan 13-00 (Wave 0) — RED meta-test for CLOSE-01.
#
# Asserts that running `npm install` at the repo root (and ONLY at the root — no
# manual `cd kernel && npm install` step) produces a `kernel/dist/main.js` that
# loads `better-sqlite3` without a NODE_MODULE_VERSION mismatch under the project's
# Electron-as-Node runtime.
#
# v1.0/v1.2 ships with kernel/postinstall wiring (Phase 9 Plan 09-04) that fetches
# the Electron-ABI prebuild. CLOSE-01 (Plan 13-01) closes the remaining gap where
# the root `npm install` does NOT trigger `kernel/npm install`, meaning a true fresh
# clone never materializes the Electron-compatible sqlite3 binary without the manual
# two-step dance documented in MEMORY.md "GoatIDE working launch recipe".
#
# Execution model:
#   1. Creates a throwaway scratch dir under $TMPDIR.
#   2. `git clone . $SCRATCH` (shallow clone from working tree).
#   3. In the clone: `npm install` at root (no manual kernel step).
#   4. Spawn `kernel/dist/main.js` via Electron-as-Node (resolves .build/electron/
#      binary the same way freshclone-smoke-cdp.cjs does — Phase 9 BUILD-RT-04).
#   5. Assert: `require('better-sqlite3')` succeeds with no NODE_MODULE_VERSION
#      mismatch on stderr.
#   6. Exit 0 iff assertion passes; exit 1 with a descriptive error otherwise.
#
# Expected current behavior (RED):
#   Step 4 should fail because root `npm install` alone does not run the kernel
#   postinstall that fetches the Electron-ABI prebuilt binary.  The error will be
#   a NODE_MODULE_VERSION mismatch (Node 22 ABI 127 vs Electron 39 ABI 140), OR
#   kernel/dist/ will be empty/missing because the clone's root npm install did not
#   build the kernel bundle.
#
# After Plan 13-01 lands (CLOSE-01 fix), exit 0.
#
# Modeled on refusal-build-rt-04-meta.sh: set -euo pipefail, META PASS|FAIL|PEND
# echo conventions. Exit 1 for both FAIL and PEND (Phase 13 polarity — RED until fixed).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# --- Resolve Electron binary (same as freshclone-smoke-cdp.cjs) ----------------
resolve_electron_bin() {
	case "$(uname -s)" in
		MINGW*|MSYS*|CYGWIN*|Windows_NT)
			echo "$ROOT/.build/electron/GoatIDE.exe"
			;;
		Darwin)
			local product_name
			product_name=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('$ROOT/product.json','utf8')); process.stdout.write(p.nameLong||'GoatIDE');" 2>/dev/null || echo 'GoatIDE')
			echo "$ROOT/.build/electron/${product_name}.app/Contents/MacOS/goatide"
			;;
		*)
			echo "$ROOT/.build/electron/goatide"
			;;
	esac
}

ELECTRON_BIN="$(resolve_electron_bin)"

# Pre-flight: Electron binary must exist (CLOSE-01 meta-test is about npm install,
# not about electron provisioning — skip to appropriate error if missing).
if [ ! -f "$ELECTRON_BIN" ]; then
	echo "META PEND: Electron binary not found at $ELECTRON_BIN — run 'npm install && npm run electron' to provision binary first (this is a pre-condition for CLOSE-01 testing, not the CLOSE-01 gap itself)" >&2
	exit 1
fi

# --- Clone step ----------------------------------------------------------------
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/goatide-close01-meta.XXXXXXXX")
CLONE_DIR="$SCRATCH/goatide-close01-meta"
trap 'rm -rf "$SCRATCH"' EXIT

echo "META: Cloning repo into $CLONE_DIR ..."
git clone --depth=1 "$ROOT" "$CLONE_DIR" 2>&1

# --- Root npm install (NO manual kernel step) -----------------------------------
echo "META: Running 'npm install' at repo root (no kernel subdirectory step) ..."
cd "$CLONE_DIR"
npm install --prefer-offline 2>&1

# --- Assert kernel/dist/main.js exists ----------------------------------------
KERNEL_MAIN="$CLONE_DIR/kernel/dist/main.js"
if [ ! -f "$KERNEL_MAIN" ]; then
	echo "META FAIL: $KERNEL_MAIN does not exist after root npm install — CLOSE-01 gap: root npm install does not build/provision kernel" >&2
	exit 1
fi

# --- Assert better-sqlite3 loads under Electron-as-Node without ABI mismatch --
echo "META: Testing better-sqlite3 load under Electron-as-Node ..."

# Use the Electron binary from the ORIGINAL repo's .build/electron/ (the clone
# won't have its own downloaded Electron binary after a plain npm install).
# This is correct: CLOSE-01 is about the sqlite3 binary in kernel/node_modules,
# not about which Electron launches the IDE.
set +e
ELECTRON_LOAD_OUTPUT=$(
	cd "$CLONE_DIR/kernel" && \
	ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" -e \
		"var Database=require('better-sqlite3'); var db=new Database(':memory:'); console.log('ABI-OK:' + db.prepare('SELECT 1 AS v').get().v);" \
		2>&1
)
ELECTRON_LOAD_EC=$?
set -e

# Check for ABI mismatch in the output (the canonical error signature).
if echo "$ELECTRON_LOAD_OUTPUT" | grep -qi "NODE_MODULE_VERSION"; then
	echo "META FAIL (expected RED on master): better-sqlite3 ABI mismatch detected under Electron-as-Node:" >&2
	echo "$ELECTRON_LOAD_OUTPUT" >&2
	echo "" >&2
	echo "This is the CLOSE-01 gap: root 'npm install' does not trigger kernel postinstall" >&2
	echo "that fetches the Electron-ABI (140) prebuilt binary. Plan 13-01 fixes this." >&2
	exit 1
fi

if [ "$ELECTRON_LOAD_EC" -ne 0 ]; then
	echo "META FAIL: better-sqlite3 failed to load under Electron-as-Node (non-ABI error):" >&2
	echo "$ELECTRON_LOAD_OUTPUT" >&2
	exit 1
fi

# Verify ABI-OK marker in output.
if ! echo "$ELECTRON_LOAD_OUTPUT" | grep -q "ABI-OK:"; then
	echo "META FAIL: Electron-as-Node load returned unexpected output (ABI-OK marker missing):" >&2
	echo "$ELECTRON_LOAD_OUTPUT" >&2
	exit 1
fi

echo "META PASS: better-sqlite3 loads under Electron-as-Node without ABI mismatch (CLOSE-01)"
echo "Electron load output: $(echo "$ELECTRON_LOAD_OUTPUT" | grep 'ABI-OK')"
exit 0
