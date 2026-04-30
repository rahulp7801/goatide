#!/usr/bin/env bash
# TRAV-06 — Refuse fuzzy / similarity / "did-you-mean" fallback in retrieval code.
#
# Constitutional mandate (Mandate C, Scope-Constrained Retrieval): GoatIDE retrieval is
# graph-edge traversal — empty result is the correct response when traversal returns
# nothing. No fuzzy string match, no embedding similarity, no "did you mean" suggester
# can ever land in retrieval code. This gate scans kernel/src/graph, kernel/src/receipt,
# kernel/src/rpc for banned tokens.
#
# The banlist is conservative: every well-known fuzzy/embedding library + the common
# function names that signal a future contributor reaching for similarity. Adding to it
# is cheap; removing should require a Phase-time discussion (Mandate C does not flex).
#
# Modeled on scripts/ci/refuse-vector-libs.sh — same git-ls-files + grep -E filter for
# Windows-mingw safety, same single-rg-per-token scan inside the matched files.
#
# Exit codes:
#   0 — no banned token found
#   1 — at least one banned token found
set -euo pipefail

BANNED=(
	"levenshtein"
	"fuzzysort"
	"did_you_mean"
	"did-you-mean"
	"didYouMean"
	"dice_coefficient"
	"diceCoefficient"
	"jaro"
	"jaroWinkler"
	"cosine_similarity"
	"cosineSimilarity"
	"embedding"
	"embeddings"
	"fuzzy_match"
	"fuzzyMatch"
	"approximate_match"
	"approximateMatch"
	"ngram"
	"n_gram"
	"trigram"
)

# Files to scan: TS sources under the three retrieval-relevant trees.
# `git ls-files` so untracked sentinels from the meta-test are NOT scanned unless
# `git add -N`'d (the meta-test does this intentionally).
#
# `grep -E` (POSIX) over `rg` for the filter: ripgrep on Windows mingw silently
# drops piped stdin, the same Windows-runner footgun documented in
# refuse-vector-libs.sh.
mapfile -t FILES < <(git ls-files | grep -E '^kernel/src/(graph|receipt|rpc)/.*\.ts$' || true)

EXISTING=()
for f in "${FILES[@]}"; do
	[ -f "$f" ] && EXISTING+=("$f")
done

FOUND=0
if [ "${#EXISTING[@]}" -gt 0 ]; then
	for b in "${BANNED[@]}"; do
		HITS=$(rg --no-heading -i -F "$b" "${EXISTING[@]}" 2>/dev/null || true)
		if [ -n "$HITS" ]; then
			echo "TRAV-06 violation — banned fuzzy/similarity token '$b':"
			echo "$HITS" | head -5
			FOUND=1
		fi
	done
fi

if [ "$FOUND" -eq 0 ]; then
	echo "TRAV-06 ok — no fuzzy/similarity fallback in retrieval code."
fi
exit "$FOUND"
