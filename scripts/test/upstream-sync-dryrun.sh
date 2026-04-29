#!/usr/bin/env bash
# scripts/test/upstream-sync-dryrun.sh
#
# FORK-05 — Upstream-sync ceremony static-analysis + brander-idempotency test.
#
# This is a FIXTURE test, not a live sync. It validates that
# scripts/upstream-sync.sh has the four canonical ceremony steps and that
# scripts/prepare_goatide.sh is idempotent on a pre-branded fixture. No
# network access, no fetch from microsoft/vscode.
#
# Wave 0 mode: scripts/upstream-sync.sh and scripts/prepare_goatide.sh do not
# yet exist. Script must fail loudly pointing at Plan 01-03.
# Wave 1+ mode: once Plan 01-03 lands the brander + sync ceremony, every
# assertion passes.
#
# Reference: 01-RESEARCH.md ## Code Examples §"Upstream-Sync Ceremony Outline"
# Reference: 01-VALIDATION.md — canonical FORK-05 verification gate
#
# The four canonical ceremony steps that must be present in upstream-sync.sh:
#   1. `source UPSTREAM_BASE`     — read the previous pin (TAG, SHA)
#   2. invoke `prepare_goatide.sh` — re-run the brander after merge
#   3. invoke `refuse-vs-workbench-edits.sh` — FORK-04 isolation gate
#   4. write a new UPSTREAM_BASE   — TAG=... pin for the next sync
#
# The idempotency check runs prepare_goatide.sh inside a hermetic git fixture
# whose product.json is already post-branded. A second run must produce a
# clean diff. If re-running the brander modifies product.json, the brander is
# non-idempotent — which means upstream-sync would loop forever or produce
# spurious diffs each cycle.
#
# Exit codes: 0 = ceremony has all four steps + brander is idempotent.
#             1 = anything else.
set -euo pipefail

UPSTREAM_SYNC="${UPSTREAM_SYNC:-scripts/upstream-sync.sh}"
PREPARE_GOATIDE="${PREPARE_GOATIDE:-scripts/prepare_goatide.sh}"

# --- 1. Prerequisites --------------------------------------------------------
if [[ ! -f "$UPSTREAM_SYNC" ]]; then
  echo "FORK-05 violation: $UPSTREAM_SYNC not found — Plan 01-03 has not yet authored the sync ceremony." >&2
  exit 1
fi

if [[ ! -f "$PREPARE_GOATIDE" ]]; then
  echo "FORK-05 violation: $PREPARE_GOATIDE not found — Plan 01-03 has not yet authored the brander." >&2
  exit 1
fi

# --- 2. Static-analysis assertions (loose: presence, not logic) -------------
# These greps are intentionally loose. They assert the canonical pattern is
# present in the script — the actual logic (does it correctly merge upstream,
# does it bail on conflicts, etc.) is covered by Plan 01-05's live verification.

if ! grep -q 'source UPSTREAM_BASE\|\. UPSTREAM_BASE\|\. \./UPSTREAM_BASE' "$UPSTREAM_SYNC"; then
  echo "FORK-05 violation: $UPSTREAM_SYNC does not source UPSTREAM_BASE" >&2
  exit 1
fi
echo "  ok: upstream-sync.sh sources UPSTREAM_BASE"

if ! grep -q 'prepare_goatide\.sh' "$UPSTREAM_SYNC"; then
  echo "FORK-05 violation: $UPSTREAM_SYNC does not invoke prepare_goatide.sh after merge" >&2
  exit 1
fi
echo "  ok: upstream-sync.sh invokes prepare_goatide.sh after merge"

if ! grep -q 'refuse-vs-workbench-edits\.sh' "$UPSTREAM_SYNC"; then
  echo "FORK-05 violation: $UPSTREAM_SYNC does not run the FORK-04 isolation gate after merge" >&2
  exit 1
fi
echo "  ok: upstream-sync.sh runs refuse-vs-workbench-edits.sh"

# Must rewrite a new UPSTREAM_BASE pin: at minimum, mention UPSTREAM_BASE +
# a TAG= line in the same script.
if ! { grep -q 'UPSTREAM_BASE' "$UPSTREAM_SYNC" && grep -q 'TAG=' "$UPSTREAM_SYNC"; }; then
  echo "FORK-05 violation: $UPSTREAM_SYNC does not write a new UPSTREAM_BASE pin (no TAG= literal found)" >&2
  exit 1
fi
echo "  ok: upstream-sync.sh writes a new UPSTREAM_BASE pin"

# --- 3. Brander idempotency on a hermetic fixture ---------------------------
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT

git -C "$FIXTURE" init -q
git -C "$FIXTURE" config user.email a@b
git -C "$FIXTURE" config user.name  test
git -C "$FIXTURE" config commit.gpgsign false 2>/dev/null || true

mkdir -p "$FIXTURE/scripts"
cp "$UPSTREAM_SYNC"    "$FIXTURE/scripts/"
cp "$PREPARE_GOATIDE"  "$FIXTURE/scripts/"

# Synthetic UPSTREAM_BASE pin (older tag/SHA — the brander does not consult
# this, but the sync ceremony does, so it has to be present and parseable).
cat > "$FIXTURE/UPSTREAM_BASE" <<'EOF'
TAG=1.118.0
SHA=0000000000000000000000000000000000000000
SYNCED_AT=2026-01-01T00:00:00Z
SYNCED_BY=fixture-test
EOF

# Pre-branded product.json: matches what the brander OUTPUTS. Running the
# brander against this fixture should be a no-op (idempotent).
cat > "$FIXTURE/product.json" <<'EOF'
{
  "nameShort": "GoatIDE",
  "nameLong": "GoatIDE",
  "applicationName": "goatide",
  "dataFolderName": ".goatide",
  "darwinBundleIdentifier": "ai.goatide.GoatIDE",
  "win32MutexName": "goatide",
  "win32DirName": "GoatIDE",
  "win32NameVersion": "GoatIDE",
  "win32RegValueName": "GoatIDE",
  "win32x64AppId": "{A1B2C3D4-0001-4000-8000-000000000001}",
  "win32arm64AppId": "{A1B2C3D4-0002-4000-8000-000000000002}",
  "urlProtocol": "goatide",
  "extensionsGallery": {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item",
    "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
    "extensionUrlTemplate": "https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest"
  }
}
EOF

git -C "$FIXTURE" add -A
git -C "$FIXTURE" commit -q -m "fixture initial"

# Run the brander inside the fixture. If it produces ANY diff on product.json,
# it is non-idempotent and the sync ceremony will leak phantom changes every
# cycle.
(
  cd "$FIXTURE"
  bash scripts/prepare_goatide.sh >/dev/null 2>&1 || {
    echo "FORK-05 violation: prepare_goatide.sh failed when run on a pre-branded fixture (exit non-zero)" >&2
    exit 1
  }
  if ! git diff --quiet product.json; then
    echo "FORK-05 violation: prepare_goatide.sh is NOT idempotent — re-running on a pre-branded fixture produced a diff:" >&2
    git --no-pager diff product.json >&2
    exit 1
  fi
)
echo "  ok: prepare_goatide.sh is idempotent on a pre-branded fixture"

echo
echo "FORK-05 ok — upstream-sync.sh ceremony has all four required steps (source UPSTREAM_BASE, run brander, run FORK-04 gate, write new pin) and prepare_goatide.sh is idempotent on a pre-branded fixture."
exit 0
