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
# IMPLEMENTATION NOTE (Phase 1.2 cross-platform fix):
# This gate uses `git ls-files | grep -vE | rg -F` rather than `rg --glob`
# tree-scan. Reasons (mirrors refuse-vector-libs.sh comment):
#   - rg's tree-scan respects platform-dependent ignore files and runner-image
#     gitignore configurations; on Ubuntu 22.04 GitHub runners it ignores
#     `scripts/__refusal_meta_market.txt`-style sentinels even though they're
#     tracked (or intent-to-added). The git-ls-files-piped pattern is
#     deterministic across linux/macos/windows-mingw.
#   - Untracked sentinels from a meta-test are NOT scanned unless they have
#     been `git add -N`'d — meta-tests intentionally do this (see
#     refusal-marketplace-meta.sh).
#   - rg on Windows mingw refuses stdin pipes; the POSIX `grep -vE` filter
#     dodges that footgun. Per-file `rg -F` invocation is unaffected by the
#     stdin bug.
set -euo pipefail

PATTERN='marketplace\.visualstudio\.com|vscode-update\.azurewebsites\.net|gallery\.vsassets\.io'

# Allowlisted paths (anchored regex; one alternation per line for readability).
# Rationale (Phase 1.1 — see RESEARCH.md ## Architecture Patterns > Pattern 2):
#   - docs/, .planning/, UPSTREAM_BASE: documentation + project state
#   - cli/CONTRIBUTING.md, extensions/copilot/CHANGELOG.md,
#     extensions/theme-seti/CONTRIBUTING.md, README.md (root):
#     doc/changelog references; informational, not runtime config.
#   - build/lib/test/fixtures/policies/{darwin,win32}/fr-fr/*,
#     build/lib/test/policyConversion.test.ts:
#     French YOLO-mode warning translation; not user-facing in GoatIDE.
#   - src/vs/workbench/contrib/chat/.../languageModelToolsService.ts:
#     YOLO-mode warning string literal mentioning Dev Containers extension URL
#     as a compromise example (not config). FORK-04: the file is in workbench
#     so it is off-limits for editing — the allowlist here is for the
#     refusal grep gate, NOT for editing rights.
#   - scripts/test/upstream-sync-dryrun.sh:
#     comment block documents the FORK-06 brander rationale; mentions the
#     literal marketplace string in a code comment, not as runtime config.
#   - scripts/prepare_goatide.sh:
#     the brander itself contains the source pattern (in a header comment
#     and as the LHS of sed -e rewrite expressions); these are the rewrite
#     RULES, not runtime config — without them the gate could never go GREEN.
#   - scripts/ci/refuse-marketplace.sh and scripts/test/refusal-marketplace-meta.sh:
#     the gate file and its own meta-test (would create circular self-match).
#   - .devcontainer/README.md (Phase 1.2 — surfaced when the gate switched to
#     git-ls-files): upstream-shipped onboarding doc that links to two VS Code
#     marketplace extensions (Resource Monitor + GitHub Codespaces) as
#     informational install instructions for upstream contributors. Not a
#     runtime gallery URL, not user-facing in GoatIDE. Documentation reference.
#   - .github/workflows/ci.yml (Phase 1.2 — surfaced when the gate switched
#     to git-ls-files): contains the literal string "marketplace.visualstudio.com"
#     in the FORK-06 step's `name:` field. This is the gate's own self-naming;
#     allowlisting prevents circular failure. The OLD rg-tree-scan implicitly
#     ignored this via `--glob '!.git/**'` matching `.github/` as a prefix; the
#     new git-ls-files pattern surfaces it, so it must be allowlisted explicitly.
# (NOTE: build/rspack/workbench-rspack.html and build/vite/workbench-vite.html
#  are NOT allowlisted — they are now branded by prepare_goatide.sh.)
ALLOWLIST_REGEX='^(docs/|\.planning/|UPSTREAM_BASE$'
ALLOWLIST_REGEX+='|cli/CONTRIBUTING\.md$'
ALLOWLIST_REGEX+='|extensions/copilot/CHANGELOG\.md$'
ALLOWLIST_REGEX+='|extensions/theme-seti/CONTRIBUTING\.md$'
ALLOWLIST_REGEX+='|README\.md$'
ALLOWLIST_REGEX+='|build/lib/test/fixtures/policies/'
ALLOWLIST_REGEX+='|build/lib/test/policyConversion\.test\.ts$'
ALLOWLIST_REGEX+='|src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService\.ts$'
ALLOWLIST_REGEX+='|scripts/test/upstream-sync-dryrun\.sh$'
ALLOWLIST_REGEX+='|scripts/prepare_goatide\.sh$'
ALLOWLIST_REGEX+='|scripts/ci/refuse-marketplace\.sh$'
ALLOWLIST_REGEX+='|scripts/test/refusal-marketplace-meta\.sh$'
ALLOWLIST_REGEX+='|\.devcontainer/README\.md$'
ALLOWLIST_REGEX+='|\.github/workflows/ci\.yml$)'

# Enumerate tracked files (and intent-to-add sentinels from meta-tests),
# strip allowlisted paths, drop tracked-but-deleted entries. Pass to rg via
# xargs because the unfiltered tree (~14k files) exceeds Windows mingw's
# argv limit when expanded into a single rg invocation; xargs batches args
# in chunks of ARG_MAX. -0/-r/-a NUL-delimit so filenames with spaces survive.
TMPLIST=$(mktemp)
trap 'rm -f "$TMPLIST"' EXIT

git ls-files -z | grep -zvE "$ALLOWLIST_REGEX" \
	| while IFS= read -r -d '' f; do
		[ -f "$f" ] && printf '%s\0' "$f"
	done > "$TMPLIST"

if [ ! -s "$TMPLIST" ]; then
	echo "FORK-06 ok — no scannable files (empty tree?)"
	exit 0
fi

# xargs -0 batches NUL-delimited filenames into multiple rg calls. Default
# regex mode (NOT -F fixed-string) so `marketplace\.visualstudio\.com|...`
# is interpreted as a regex. xargs -r/-a avoids invoking rg with zero args.
HITS=$(xargs -0 -a "$TMPLIST" rg --no-heading --color=never "$PATTERN" 2>/dev/null || true)

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
