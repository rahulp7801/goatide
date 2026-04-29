#!/usr/bin/env bash
# scripts/prepare_goatide.sh — Idempotent GoatIDE brander.
#
# Constitutional purpose: re-runnable post-upstream-sync to re-apply GoatIDE
# branding to product.json and to ensure GoatIDE-owned npm scripts exist in
# package.json. Source: 01-RESEARCH.md §"Pattern 1: VSCodium-style Idempotent
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

# --- Ensure GoatIDE-owned npm scripts in package.json (if present) ----------
# Drift recovery: monthly upstream-sync may modify package.json; the brander
# re-adds GoatIDE-owned scripts so the developer never has to re-do it manually.
# Skipped silently when package.json is absent (e.g., hermetic test fixtures).
if [[ -f package.json ]]; then
  TMP_PKG=$(mktemp)
  jq --indent 2 '
      .scripts["upstream-sync"] = "bash scripts/upstream-sync.sh"
    | .scripts["ci-local"] = "bash scripts/ci/refuse-marketplace.sh && bash scripts/ci/refuse-vector-libs.sh && bash scripts/ci/refuse-vs-workbench-edits.sh && node scripts/validate-openvsx.mjs && bash scripts/test/assert-product-json-branded.sh"
  ' package.json > "$TMP_PKG"

  jq -e '.scripts["upstream-sync"] and .scripts["ci-local"]' "$TMP_PKG" >/dev/null || {
    echo "prepare_goatide.sh post-edit package.json sanity check failed." >&2
    rm -f "$TMP_PKG"
    exit 1
  }

  mv "$TMP_PKG" package.json
  echo "GoatIDE npm scripts ensured in package.json"
fi
