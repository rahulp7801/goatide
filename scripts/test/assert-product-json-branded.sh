#!/usr/bin/env bash
# scripts/test/assert-product-json-branded.sh
#
# FORK-02 — Branding assertion for product.json.
#
# Verifies that product.json at the repo root has been re-branded for GoatIDE
# (off the upstream microsoft/vscode defaults) and that the extensionsGallery
# block points at Open VSX (Pitfall 1: Marketplace leak).
#
# Wave 0 mode: product.json does not yet exist. Script must fail loudly with a
# diagnostic that names the next plan responsible for fixing it (Plan 01-03).
# Wave 1+ mode: once Plan 01-03 brands the upstream clone, every assertion
# below should pass.
#
# Reference: 01-RESEARCH.md ## Code Examples
#   §"Code-OSS Identifier Rename Map" — upstream defaults to rewrite
#   §"Open VSX `extensionsGallery` Block" — exact serviceUrl / itemUrl values
# Reference: 01-VALIDATION.md ## Wave 0 Requirements
#
# Pitfall 1 (Marketplace leak):
#   This script combined with refuse-marketplace.sh (Plan 01-01) gives two
#   independent gates. Both must pass before a build can ship.
# Pitfall 6 (GUID collision):
#   Asserts win32x64AppId / win32arm64AppId differ from the canonical upstream
#   Code-OSS GUID, so a side-by-side install of upstream Code-OSS does not
#   collide on Windows ProgID / installer-mutex.
#
# Exit codes: 0 = product.json branded. 1 = missing or unbranded.
set -euo pipefail

PRODUCT_JSON="${PRODUCT_JSON:-product.json}"

if [[ ! -f "$PRODUCT_JSON" ]]; then
  echo "FORK-02 violation: product.json missing — Plan 01-03 has not yet branded the upstream clone." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "FORK-02 violation: jq is not installed; cannot validate product.json." >&2
  echo "Install jq (https://stedolan.github.io/jq/) and re-run." >&2
  exit 1
fi

# assert_jq <jq-expression> <human-friendly description>
#
# Uses `jq -e` so the expression's truthiness IS the exit code. We deliberately
# do NOT pipe `jq -r` through grep — `jq -r '.foo'` returns the literal string
# "null" for missing keys, which would pass a naive grep. The -e flag is the
# correct semantic.
assert_jq() {
  local expr="$1"
  local desc="$2"
  if jq -e "$expr" "$PRODUCT_JSON" >/dev/null 2>&1; then
    echo "  ok: $desc"
  else
    local actual
    # Best-effort: surface what the field actually contains for diagnosis.
    # The expression itself may not be a simple path lookup, so this is a hint,
    # not a guarantee.
    actual=$(jq -r "${expr%% ==*}" "$PRODUCT_JSON" 2>/dev/null || echo "<jq error>")
    echo "FORK-02 violation: $desc — got: $actual" >&2
    exit 1
  fi
}

# --- 9+ required brand assertions ---------------------------------------------

# Identifier rename (upstream Code-OSS → GoatIDE):
assert_jq '.nameShort == "GoatIDE"'                          'nameShort is "GoatIDE"'
assert_jq '.nameLong == "GoatIDE"'                           'nameLong is "GoatIDE"'
assert_jq '.applicationName == "goatide"'                    'applicationName is "goatide"'
assert_jq '.dataFolderName == ".goatide"'                    'dataFolderName is ".goatide"'
assert_jq '.darwinBundleIdentifier == "ai.goatide.GoatIDE"'  'darwinBundleIdentifier is "ai.goatide.GoatIDE"'
assert_jq '.urlProtocol == "goatide"'                        'urlProtocol is "goatide"'

# Open VSX extensionsGallery (Pitfall 1):
# NOTE: upstream Code-OSS product.json has NO extensionsGallery block at all.
# A "blank" upstream clone fails these checks — this is correct behavior.
# Plan 01-03's brander must INJECT the block, not just rename existing keys.
assert_jq '.extensionsGallery.serviceUrl == "https://open-vsx.org/vscode/gallery"' \
  'extensionsGallery.serviceUrl points at Open VSX'
assert_jq '.extensionsGallery.itemUrl == "https://open-vsx.org/vscode/item"' \
  'extensionsGallery.itemUrl points at Open VSX'

# GUID-not-default checks (Pitfall 6: GUID collision with upstream Code-OSS):
# {D77B7E06-80BA-4137-BCF4-654B95CCEBC5} is the canonical upstream Code-OSS
# x64 AppId per 01-RESEARCH.md ## Code Examples. If we ship that GUID, our
# Windows installer will collide with anyone who has Code-OSS installed.
assert_jq '.win32x64AppId != "{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}"' \
  'win32x64AppId is NOT the upstream Code-OSS default GUID'
assert_jq '.win32x64AppId != null' \
  'win32x64AppId is set (non-null)'
assert_jq '.win32arm64AppId != null' \
  'win32arm64AppId is set (non-null)'

echo
echo "FORK-02 ok — product.json branded for GoatIDE + Open VSX."
exit 0
