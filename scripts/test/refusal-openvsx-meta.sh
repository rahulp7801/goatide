#!/usr/bin/env bash
# Meta-test for scripts/validate-openvsx.mjs.
#
# Network dependency: this test makes a real HTTP request to
# https://open-vsx.org. CI runs it from ubuntu-22.04 GitHub runners which
# have outbound HTTPS; local runs require the same. There is no offline
# mode — the value of FORK-08 is that it talks to the live registry, and
# the meta-test must exercise that path.
#
# Strategy:
#   1. Create a sentinel .vscode/extensions.json under
#      scripts/__openvsx_meta_test/.vscode/ that recommends
#      foo.this-extension-does-not-exist-12345.
#   2. Run `node scripts/validate-openvsx.mjs` — assert non-zero exit
#      (Open VSX returns 404 for the synthetic id).
#   3. Cleanup the sentinel directory.
#   4. Re-run the validator — assert exit 0 (no manifests left to validate
#      on the clean repo).
#
# Note: validate-openvsx.mjs walks the filesystem, not git, so no
# `git add -N` is needed here.
set -euo pipefail

SENTINEL_DIR="scripts/__openvsx_meta_test"

cleanup() {
  rm -rf "$SENTINEL_DIR"
}
trap cleanup EXIT

# 1. Inject violation
mkdir -p "$SENTINEL_DIR/.vscode"
cat > "$SENTINEL_DIR/.vscode/extensions.json" <<'JSON'
{
  "recommendations": ["foo.this-extension-does-not-exist-12345"]
}
JSON

# 2. Validator must fire (non-zero) since the id 404s on Open VSX
EXIT_CODE=0
node scripts/validate-openvsx.mjs > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "META FAIL: validate-openvsx.mjs did not fire on unresolvable id"
  exit 1
fi

# 3. Cleanup before second run (trap will repeat at exit; safe).
rm -rf "$SENTINEL_DIR"

# 4. Validator must clear (exit 0; no manifests left)
EXIT_CODE=0
node scripts/validate-openvsx.mjs > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "META FAIL: validate-openvsx.mjs stuck red after cleanup (exit $EXIT_CODE)"
  exit 1
fi

echo "META PASS: validate-openvsx.mjs fires on unresolvable id and clears on cleanup."
