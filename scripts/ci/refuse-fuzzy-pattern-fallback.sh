#!/usr/bin/env bash
# Phase 7 (Plan 07-01) — Refuse fuzzy / LLM-driven pattern fallback in drift detection.
#
# Constitutional pin (Mandate C + Pitfall 7 from 07-RESEARCH.md): drift detection v1 ships
# deterministic regex / jsonpath / forbidden_import only. ZERO fuzzy matching. ZERO
# LLM-driven inference. The temptation to wire "if no pattern matches, ask Claude" is real
# and forbidden — fixture-replay even for harvester promotion is the constitutional limit.
#
# Banned imports (any of these in kernel/src/drift/ => gate fires):
#   string-similarity, levenshtein, fuse.js, fuzzysort, match-sorter,
#   @anthropic-ai/sdk, @openai/api
#
# Wave-0 (Plan 07-01): kernel/src/drift/ does not yet exist. Gate exits 0 cleanly.
# Plans 07-02..07-08 ship code under audit; the existing global refuse-fuzzy-fallback.sh
# guards the rest of the codebase, this one is the drift-tree-specific defense-in-depth.
#
# Modeled on scripts/ci/refuse-fuzzy-fallback.sh + refuse-vector-libs.sh.
#
# Exit codes:
#   0 — no banned import found in kernel/src/drift/ (or tree empty)
#   1 — at least one banned import found
set -euo pipefail

KERNEL_DRIFT="kernel/src/drift"

mapfile -t FILES < <(git ls-files 2>/dev/null | grep -E "^${KERNEL_DRIFT}/.*\.ts$" || true)

EXISTING=()
for f in "${FILES[@]}"; do
	[ -f "$f" ] && EXISTING+=("$f")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
	echo "Phase-7 fuzzy-pattern-fallback gate ok — kernel/src/drift/ not yet present (Plans 07-02..07-08 ship it)."
	exit 0
fi

# Banned import sources. Each is matched against the standard ESM import + CJS require forms.
# Pattern uses [\x27\x22] for the quote character class so the bash quoting layer doesn't
# corrupt the single-quote literal (Plan 04-08 + Phase 6 lesson — pure double-quoted rg
# patterns survive bash unscathed).
BANNED_MODS='string-similarity|levenshtein|fuse\.js|fuzzysort|match-sorter|@anthropic-ai/sdk|@openai/api'
PATTERN_FROM="from\\s+[\"\\x27]($BANNED_MODS)[\"\\x27]"
PATTERN_REQUIRE="require\\(\\s*[\"\\x27]($BANNED_MODS)[\"\\x27]"

HITS=$(rg --no-heading -n -e "$PATTERN_FROM" -e "$PATTERN_REQUIRE" "${EXISTING[@]}" 2>/dev/null || true)
if [ -n "$HITS" ]; then
	echo "Phase-7 Mandate-C / Pitfall-7 fuzzy-pattern-fallback violation — banned import in kernel/src/drift/:"
	echo "$HITS" | head -10
	exit 1
fi

echo "Phase-7 fuzzy-pattern-fallback gate ok — no fuzzy / LLM-SDK imports in kernel/src/drift/ ($(echo "${EXISTING[@]}" | wc -w) file(s) scanned)."
exit 0
