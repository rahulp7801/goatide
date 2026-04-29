#!/usr/bin/env bash
# FORK-06 — Refuse Microsoft Marketplace references.
#
# Constitutional mandate: GoatIDE points the in-IDE extension panel at
# Open VSX, not at marketplace.visualstudio.com. Any reference to a
# Microsoft-marketplace endpoint outside /docs/ or /.planning/ fails the
# build. This is structural enforcement, not a code-review preference.
#
# Exit codes:
#   0 — clean tree, no banned references found
#   1 — at least one banned reference found (printed to stderr-friendly stdout)
#
# Allowlisted directories: docs/, .planning/, UPSTREAM_BASE
# (UPSTREAM_BASE may legitimately reference upstream-version metadata.)
set -euo pipefail

PATTERN='marketplace\.visualstudio\.com|vscode-update\.azurewebsites\.net|gallery\.vsassets\.io'

# rg returns exit 1 on no matches; we want that to mean "clean", not "fail".
HITS=$(rg --no-heading --color=never -e "$PATTERN" \
  --glob '!docs/**' \
  --glob '!.planning/**' \
  --glob '!UPSTREAM_BASE' \
  --glob '!.git/**' \
  --glob '!scripts/ci/refuse-marketplace.sh' \
  --glob '!scripts/test/refusal-marketplace-meta.sh' \
  || true)

if [ -n "$HITS" ]; then
  echo "FORK-06 violation — Microsoft Marketplace references found:"
  echo "$HITS"
  echo
  echo "GoatIDE must point the extension panel at Open VSX. Move any legitimate"
  echo "documentation references into /docs/ or /.planning/."
  exit 1
fi

echo "FORK-06 ok — no MS Marketplace references outside /docs/."
exit 0
