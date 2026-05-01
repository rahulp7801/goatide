#!/usr/bin/env bash
# scripts/prepare_goatide.sh — Idempotent GoatIDE brander.
#
# Constitutional purpose: re-runnable post-upstream-sync to re-apply GoatIDE
# branding to product.json and to ensure GoatIDE-owned npm scripts exist in
# package.json. Source: 01-RESEARCH.md section"Pattern 1: VSCodium-style Idempotent
# Brander Script". Generated GUIDs are hardcoded (NOT regenerated per run);
# regenerating them would break Inno Setup upgrade detection on Windows.
#
# Idempotency guarantee: re-running on a clean tree must produce zero diff
# against product.json AND package.json. Tested by running twice and checking
# `git diff --quiet`.
set -euo pipefail

# --- Hardcoded Win32 AppId GUIDs (generated 2026-04-28 via powershell) -------
# DO NOT regenerate. Channel-distinct (Insiders, etc.) channels must use their
# own fresh GUIDs per 01-RESEARCH.md ## Open Questions #4.
GOATIDE_WIN32_X64_GUID="{337F95A8-0ABB-40A5-A399-5D87ECFF4B26}"
GOATIDE_WIN32_ARM64_GUID="{B12FDC3F-216B-4B88-B58F-0B032FBA025F}"
GOATIDE_WIN32_X86_GUID="{BC71899E-EA01-4C5F-80CD-5DC1B6AB4369}"

# --- Pre-checks --------------------------------------------------------------
command -v jq >/dev/null || {
	echo "prepare_goatide.sh requires jq (>=1.6); install via system pkg manager." >&2
	exit 1
}

[[ -f product.json ]] || { echo "product.json not found — run from repo root after upstream merge." >&2; exit 1; }

# --- Brand product.json ------------------------------------------------------
PRODUCT_JSON="product.json"
TMP=$(mktemp)

jq --indent 2 \
		--arg x64guid "$GOATIDE_WIN32_X64_GUID" \
		--arg armguid "$GOATIDE_WIN32_ARM64_GUID" \
		--arg x86guid "$GOATIDE_WIN32_X86_GUID" \
		'
		.nameShort                = "GoatIDE"
	| .nameLong                 = "GoatIDE"
	| .applicationName          = "goatide"
	| .dataFolderName           = ".goatide"
	| .win32MutexName           = "goatide"
	| .darwinBundleIdentifier   = "ai.goatide.GoatIDE"
	| .win32DirName             = "GoatIDE"
	| .win32NameVersion         = "GoatIDE"
	| .win32RegValueName        = "GoatIDE"
	| .win32AppId               = $x86guid
	| .win32x64AppId            = $x64guid
	| .win32arm64AppId          = $armguid
	| .urlProtocol              = "goatide"
	| .extensionsGallery        = {
			serviceUrl:           "https://open-vsx.org/vscode/gallery",
			itemUrl:              "https://open-vsx.org/vscode/item",
			resourceUrlTemplate:  "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
			extensionUrlTemplate: "https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest"
		}
	' "$PRODUCT_JSON" > "$TMP"

# Sanity assertion — fail loudly if upstream renamed a key (manual review needed).
jq -e '
		.nameShort == "GoatIDE"
and .applicationName == "goatide"
and .extensionsGallery.serviceUrl == "https://open-vsx.org/vscode/gallery"
and .win32x64AppId != "{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}"
' "$TMP" >/dev/null || {
	echo "prepare_goatide.sh post-edit sanity check failed — upstream product.json schema may have changed; manual review required." >&2
	rm -f "$TMP"
	exit 1
}

mv "$TMP" "$PRODUCT_JSON"
echo "GoatIDE branding applied to $PRODUCT_JSON"

# --- Ensure GoatIDE-owned npm scripts + TS pin in package.json (if present) -
# Drift recovery (Phase 1.1 / Pitfall 2 in 01.1-RESEARCH.md): monthly
# upstream-sync may pull a fresh upstream package.json that lacks GoatIDE's
# overrides block. The brander idempotently restores:
#   - GoatIDE-owned npm scripts (upstream-sync, ci-local)
#   - typescript pin at ~5.9.0 (devDependencies + overrides) — required because
#     vscode 1.117.0's vscode.d.ts uses interface idioms that TypeScript 6.x
#     rejects with duplicate-index-signature errors. See 01.1-RESEARCH.md
#     ## Architecture Patterns > Pattern 1 (Lane A).
# Skipped silently when package.json is absent (e.g., hermetic test fixtures).
if [[ -f package.json ]]; then
	TMP_PKG=$(mktemp)
	jq --indent 2 '
			.scripts["upstream-sync"] = "bash scripts/upstream-sync.sh"
		| .scripts["ci-local"] = "bash scripts/ci/refuse-marketplace.sh && bash scripts/ci/refuse-vector-libs.sh && bash scripts/ci/refuse-vs-workbench-edits.sh && node scripts/validate-openvsx.mjs && bash scripts/test/assert-product-json-branded.sh"
		| .devDependencies.typescript = "~5.9.0"
		| .overrides.typescript       = "~5.9.0"
	' package.json > "$TMP_PKG"

	jq -e '
			.scripts["upstream-sync"]
	and .scripts["ci-local"]
	and .devDependencies.typescript == "~5.9.0"
	and .overrides.typescript == "~5.9.0"
	' "$TMP_PKG" >/dev/null || {
		echo "prepare_goatide.sh post-edit package.json sanity check failed — typescript override missing or wrong version" >&2
		rm -f "$TMP_PKG"
		exit 1
	}

	mv "$TMP_PKG" package.json
	echo "GoatIDE npm scripts + TypeScript ~5.9.0 pin ensured in package.json"
fi

# --- Sync first-party bridge extension into extensions/ (if present) ---------
# Plan 01-04: src/vs/goatide/extensions/goatide-bridge/ is the source-of-truth
# (covered by FORK-04 allowlist for src/vs/goatide/**). Upstream's gulp build
# discovers built-in extensions from the repo-root extensions/ directory.
# Idempotently mirror the bridge's manifest + dist/ into extensions/goatide-bridge/
# so the canonical build picks it up without modifying the upstream gulpfile.
#
# FORK-04 note: extensions/goatide-bridge/ is OUTSIDE src/vs/, so refuse-vs-
# workbench-edits.sh does not inspect this path. extensions/ is upstream's
# extensions root and adding new first-party extensions there is the standard
# pattern (same as upstream's own extensions/ subtree).
BRIDGE_SRC="src/vs/goatide/extensions/goatide-bridge"
BRIDGE_DST="extensions/goatide-bridge"
if [[ -d "$BRIDGE_SRC" ]]; then
	mkdir -p "$BRIDGE_DST"
	cp "$BRIDGE_SRC/package.json" "$BRIDGE_DST/package.json"
	if [[ -d "$BRIDGE_SRC/dist" ]]; then
		rm -rf "$BRIDGE_DST/dist"
		cp -r "$BRIDGE_SRC/dist" "$BRIDGE_DST/dist"
	fi
	echo "GoatIDE bridge extension synced to $BRIDGE_DST"
fi
