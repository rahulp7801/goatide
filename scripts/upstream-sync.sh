#!/usr/bin/env bash
# scripts/upstream-sync.sh — FORK-05 monthly upstream-sync ceremony.
#
# Constitutional purpose: bring the latest microsoft/vscode stable tag into
# the fork in a deterministic way. Sources current pin from UPSTREAM_BASE,
# fetches upstream tags, picks the latest stable, branches, merges, re-runs
# the brander, runs all four refusal/validation gates, asserts brander
# idempotency on the new tree, writes the new pin.
#
# Reference: 01-RESEARCH.md ## Code Examples §"Upstream-Sync Ceremony Outline"
# + ## Architecture Patterns §"Pattern 3: UPSTREAM_BASE as a Tracked Pin File".
set -euo pipefail

if [[ ! -f UPSTREAM_BASE ]]; then
  echo "UPSTREAM_BASE not found; cannot sync (Plan 01-03 must run first)." >&2
  exit 1
fi
# shellcheck disable=SC1091
source UPSTREAM_BASE

echo "Current pin: $TAG ($SHA)"
echo "Last synced: $SYNCED_AT by ${SYNCED_BY:-unknown}"
echo "Policy:      ${POLICY:-most-recent-stable}"
echo ""

# --- Pre-flight gates ---------------------------------------------------------
if ! git diff --quiet HEAD -- ; then
  echo "Working tree dirty. Commit or stash first." >&2
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "No 'upstream' remote configured. Run: git remote add upstream https://github.com/microsoft/vscode.git" >&2
  exit 1
fi

# --- Fetch + pick latest stable ----------------------------------------------
echo "Fetching upstream tags..."
git fetch upstream --tags --quiet

LATEST_TAG=$(git ls-remote --tags upstream 2>/dev/null \
  | grep -E 'refs/tags/[0-9]+\.[0-9]+\.[0-9]+$' \
  | awk -F/ '{print $NF}' \
  | sort -V \
  | tail -n1)

if [[ -z "$LATEST_TAG" ]]; then
  echo "Could not determine latest upstream tag; aborting." >&2
  exit 1
fi

echo "Latest stable tag: $LATEST_TAG"

if [[ "$LATEST_TAG" == "$TAG" ]]; then
  echo "Already on $TAG. Nothing to do."
  exit 0
fi

# --- Sync branch + merge ------------------------------------------------------
SYNC_BRANCH="upstream-sync-$LATEST_TAG"
echo "Syncing $TAG → $LATEST_TAG on branch $SYNC_BRANCH"
git checkout -b "$SYNC_BRANCH"
git merge --no-edit "refs/tags/$LATEST_TAG"

# --- Re-run brander (idempotent) ---------------------------------------------
echo "Re-applying GoatIDE branding..."
./scripts/prepare_goatide.sh

# --- Constitutional gates -----------------------------------------------------
echo ""
echo "Running constitutional gates..."
./scripts/ci/refuse-vs-workbench-edits.sh
./scripts/ci/refuse-marketplace.sh
./scripts/ci/refuse-vector-libs.sh
node ./scripts/validate-openvsx.mjs

# --- Brander idempotency assertion -------------------------------------------
PRODUCT_HASH_BEFORE=$(sha256sum product.json | awk '{print $1}')
PACKAGE_HASH_BEFORE=$(sha256sum package.json | awk '{print $1}')
./scripts/prepare_goatide.sh > /dev/null
PRODUCT_HASH_AFTER=$(sha256sum product.json | awk '{print $1}')
PACKAGE_HASH_AFTER=$(sha256sum package.json | awk '{print $1}')

if [[ "$PRODUCT_HASH_BEFORE" != "$PRODUCT_HASH_AFTER" ]] \
   || [[ "$PACKAGE_HASH_BEFORE" != "$PACKAGE_HASH_AFTER" ]]; then
  echo "Brander not idempotent on $LATEST_TAG — upstream may have introduced a new field; manual review required." >&2
  exit 1
fi

# --- All gates green — write new pin -----------------------------------------
NEW_SHA=$(git rev-parse "refs/tags/$LATEST_TAG^{commit}")
NEW_SYNCED_BY="${USER:-$(git config user.name)}"

cat > UPSTREAM_BASE <<EOF
TAG=$LATEST_TAG
SHA=$NEW_SHA
SYNCED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SYNCED_BY=$NEW_SYNCED_BY
POLICY=${POLICY:-most-recent-stable}
EOF

git add UPSTREAM_BASE product.json package.json
git commit -m "chore(upstream): sync to $LATEST_TAG"

echo ""
echo "Sync complete on branch $SYNC_BRANCH. Open a PR to dev."
