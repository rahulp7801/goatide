#!/usr/bin/env bash
# scripts/package-goatide.sh -- Phase 18 Wave 1.
# Orchestrates: prepare_goatide.sh (mirror sync) -> refuse-stale-bridge-mirror.sh (pre-package gate)
#             -> gulp vscode-<triple> (portable app folder) -> electron-builder --prepackaged (installer).
#
# Usage:
#   bash scripts/package-goatide.sh           # GA profile -> dist/GoatIDE-Setup-<arch>.exe
#   bash scripts/package-goatide.sh --test    # test profile -> dist/test/GoatIDE-Test-Setup-<arch>.exe
#
# Exit codes:
#   0 -- installer produced
#   1 -- bridge mirror stale (refuse-stale-bridge-mirror.sh fired) or unsupported platform
#   2 -- gulp failed
#   3 -- electron-builder failed
set -euo pipefail

PROFILE="ga"
if [ "${1:-}" = "--test" ]; then
	PROFILE="test"
fi

# Derive gulp target triple from host platform.
UNAME_S=$(uname -s)
UNAME_M=$(uname -m)
case "$UNAME_S-$UNAME_M" in
	Linux-x86_64)                                         TARGET_TRIPLE="linux-x64" ;;
	Darwin-x86_64)                                        TARGET_TRIPLE="darwin-x64" ;;
	Darwin-arm64)                                         TARGET_TRIPLE="darwin-arm64" ;;
	MINGW*-x86_64|MSYS*-x86_64|CYGWIN*-x86_64|Windows*-x86_64) TARGET_TRIPLE="win32-x64" ;;
	*)
		echo "[package-goatide] FATAL: unsupported host platform $UNAME_S-$UNAME_M" >&2
		exit 1
		;;
esac

# The gulp vscode-<triple> task outputs the portable app folder to the parent directory
# of the repository (path.dirname(repoPath) + '/VSCode-<triple>'), not under .build/.
# See build/gulpfile.vscode.win32.ts: buildPath = path.join(path.dirname(repoPath), 'VSCode-win32-<arch>')
# Same pattern on macOS/Linux (gulpfile.vscode.darwin.ts, gulpfile.vscode.linux.ts).
PORTABLE_APP="$(dirname "$(pwd)")/VSCode-${TARGET_TRIPLE}"

# Step 1: bridge mirror sync (VERIFY-02 fence -- installable loads real bridge, not stub).
echo "[package-goatide] step 1/4: bash scripts/prepare_goatide.sh"
if ! bash scripts/prepare_goatide.sh; then
	echo "[package-goatide] FATAL: prepare_goatide.sh failed" >&2
	exit 1
fi

# Step 1b: ensure bridge mirror has production deps (gulp's vsce.listFiles(PackageManager.Npm)
# runs 'npm list --production' from extensions/goatide-bridge/ and fails if node_modules absent).
# prepare_goatide.sh attempts 'npm ci' but warns if it fails (e.g. Node version mismatch).
# Fallback: if node_modules absent after step 1, run 'npm install --omit=dev --ignore-scripts'.
if [ ! -d "extensions/goatide-bridge/node_modules" ]; then
	echo "[package-goatide] step 1b: bridge mirror node_modules absent; running npm install --omit=dev --ignore-scripts"
	if ! (cd extensions/goatide-bridge && npm install --omit=dev --ignore-scripts); then
		echo "[package-goatide] FATAL: bridge mirror npm install failed; gulp will fail at vsce.listFiles step" >&2
		exit 1
	fi
fi

# Step 2: pre-package gate -- refuse stale mirror.
echo "[package-goatide] step 2/4: bash scripts/ci/refuse-stale-bridge-mirror.sh"
if ! bash scripts/ci/refuse-stale-bridge-mirror.sh; then
	echo "[package-goatide] FATAL: bridge mirror is stale after prepare_goatide.sh" >&2
	echo "[package-goatide] Inspect output and re-run; do not proceed to electron-builder." >&2
	exit 1
fi

# Step 3: gulp portable app folder.
echo "[package-goatide] step 3/4: npm run gulp -- vscode-${TARGET_TRIPLE}"
if ! npm run gulp -- "vscode-${TARGET_TRIPLE}"; then
	echo "[package-goatide] FATAL: gulp vscode-${TARGET_TRIPLE} failed" >&2
	exit 2
fi

# Step 4: electron-builder --prepackaged.
if [ "$PROFILE" = "test" ]; then
	CONFIG="electron-builder.test.yml"
else
	CONFIG="electron-builder.yml"
fi
echo "[package-goatide] step 4/4: npx electron-builder --prepackaged ${PORTABLE_APP} --config ${CONFIG}"
if ! npx electron-builder --prepackaged "${PORTABLE_APP}" --config "${CONFIG}"; then
	echo "[package-goatide] FATAL: electron-builder failed for profile=${PROFILE}" >&2
	exit 3
fi

echo ""
echo "[package-goatide] SUCCESS: profile=${PROFILE} target=${TARGET_TRIPLE}"
if [ "$PROFILE" = "test" ]; then
	echo "[package-goatide] artifact: dist/test/ (inspect via: ls -la dist/test/)"
else
	echo "[package-goatide] artifact: dist/ (inspect via: ls -la dist/)"
fi
