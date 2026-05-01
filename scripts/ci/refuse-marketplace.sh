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

# Allowlisted with rationale (Phase 1.1):
#   - cli/CONTRIBUTING.md, extensions/copilot/CHANGELOG.md,
#     extensions/theme-seti/CONTRIBUTING.md, README.md (root):
#     doc/changelog references; informational, not runtime config.
#   - build/lib/test/fixtures/policies/{darwin,win32}/fr-fr/*,
#     build/lib/test/policyConversion.test.ts:
#     French YOLO-mode warning translation; not user-facing in GoatIDE.
#   - src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts:
#     YOLO-mode warning string literal mentioning Dev Containers extension URL
#     as a compromise example (not config). FORK-04: this file is in workbench
#     so it is off-limits for editing — the allowlist here is for the
#     refusal grep gate, NOT for editing rights.
#   - scripts/test/upstream-sync-dryrun.sh:
#     comment block documents the FORK-06 brander rationale; mentions the
#     literal marketplace string in a code comment, not as runtime config.
#   - scripts/prepare_goatide.sh:
#     the brander itself contains the source pattern (in a header comment
#     and as the LHS of sed -e rewrite expressions); these are the rewrite
#     RULES, not runtime config — without them the gate could never go GREEN.
# (Source: 01.1-RESEARCH.md ## Architecture Patterns > Pattern 2 lines 246-253;
#  01-05-phase-verify-evidence.md ## Known Phase-1 Escalations > FORK-06.)
# (NOTE: build/rspack/workbench-rspack.html and build/vite/workbench-vite.html
#  are NOT allowlisted — they are now branded by prepare_goatide.sh.)

# rg returns exit 1 on no matches; we want that to mean "clean", not "fail".
HITS=$(rg --no-heading --color=never -e "$PATTERN" \
	--glob '!docs/**' \
	--glob '!.planning/**' \
	--glob '!UPSTREAM_BASE' \
	--glob '!.git/**' \
	--glob '!scripts/ci/refuse-marketplace.sh' \
	--glob '!scripts/test/refusal-marketplace-meta.sh' \
	--glob '!cli/CONTRIBUTING.md' \
	--glob '!extensions/copilot/CHANGELOG.md' \
	--glob '!extensions/theme-seti/CONTRIBUTING.md' \
	--glob '!README.md' \
	--glob '!build/lib/test/fixtures/policies/**' \
	--glob '!build/lib/test/policyConversion.test.ts' \
	--glob '!src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts' \
	--glob '!scripts/test/upstream-sync-dryrun.sh' \
	--glob '!scripts/prepare_goatide.sh' \
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
