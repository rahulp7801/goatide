#!/usr/bin/env bash
# Phase 17 Plan 17-01 -- hermetic meta-test for Mandate A structural fence.
# Sibling pattern to scripts/test/refuse-deep05-write.meta.sh (Phase 14).
#
# Phase 1 (positive): grep canvas/webview/ for forbidden LLM tokens -> 0 hits -> exit 0.
# Phase 2 (negative): plant temp file with '// LLM prompt(' -> grep finds it -> exit 1.
# Phase 3: restore (trap handles) + emit META PASS.
#
# Word-boundary patterns -- narrow to syntactic constructs to avoid false matches on
# benign prose like 'save completion' or 'summary generation' in code comments. The
# BANNED list is encoded as ERE word-boundary patterns so legitimate English prose
# using 'generate' or 'summary' in passing does not trigger the gate. CHANGES TO
# THIS LIST require updating the corresponding test expectation in
# test/unit/canvas/empty-state-mandate-a.test.tsx case 3 (which re-implements the
# same grep over CitationList.tsx -- keep the two in sync).
#
# BANNED token patterns (word-boundary syntactic-construct matching):
#   \bLLM\b
#   \bprompt\s*\(
#   \bsummari[sz]e\s*\(
#   \bcomplet(?:ion|e)\s*\(
#   \binference\s*\(
#   \bgenerate\s*\(
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CANVAS_DIR="$REPO_ROOT/src/vs/goatide/extensions/goatide-bridge/src/canvas/webview"
TEMP_FILE="$CANVAS_DIR/_temp-llm-probe.tsx"
HOST_CANVAS_DIR="$REPO_ROOT/src/vs/goatide/extensions/goatide-bridge/src/canvas"
HOST_TEMP_FILE="$HOST_CANVAS_DIR/_temp-llm-probe-host.ts"

# ERE word-boundary grep (case-sensitive on 'LLM'; case-insensitive via \b context on others).
# Excludes test files. Returns 0 if matches found, 1 otherwise.
grep_canvas() {
	grep -rE '\b(LLM|prompt[[:space:]]*\(|summari[sz]e[[:space:]]*\(|complet(ion|e)[[:space:]]*\(|inference[[:space:]]*\(|generate[[:space:]]*\()' \
		"$CANVAS_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null \
		| grep -v '\.test\.' || return 1
}

# Host-side canvas/*.ts scan -- top-level ONLY (webview/ already covered by grep_canvas).
# Excludes test files (already covered) and the webview/ subtree (already covered). Phase 20
# Plan 20-01 widening: catches forbidden LLM tokens in panel.ts/messages.ts/rpc.ts and the
# future canvas/authoring-flow.ts that Plan 20-03 will land. The `*.ts` glob is top-level
# only (does NOT recurse into webview/). `grep -E` (not `-rE`) because we pass explicit
# file paths via the glob.
grep_host_canvas() {
	grep -E '\b(LLM|prompt[[:space:]]*\(|summari[sz]e[[:space:]]*\(|complet(ion|e)[[:space:]]*\(|inference[[:space:]]*\(|generate[[:space:]]*\()' \
		"$HOST_CANVAS_DIR"/*.ts 2>/dev/null \
		| grep -v '\.test\.' || return 1
}

if [[ ! -d "$CANVAS_DIR" ]]; then
	echo "META FAIL -- canvas/webview/ directory not found at $CANVAS_DIR" >&2
	exit 1
fi

if [[ ! -d "$HOST_CANVAS_DIR" ]]; then
	echo "META FAIL -- canvas/ directory not found at $HOST_CANVAS_DIR" >&2
	exit 1
fi

# Phase 1 (positive): expect ZERO matches on clean tree -- BOTH webview/ AND host canvas/.
if grep_canvas > /dev/null 2>&1; then
	echo "META FAIL -- phase 1 positive: canvas/webview/ already contains LLM tokens before negative plant"
	exit 1
fi
if grep_host_canvas > /dev/null 2>&1; then
	echo "META FAIL -- phase 1 positive: canvas/*.ts (host) already contains LLM tokens before negative plant"
	exit 1
fi

# Phase 2 (negative): plant TWO probes (one per scope); expect each grep to find its probe.
trap 'rm -f "$TEMP_FILE" "$HOST_TEMP_FILE"' EXIT
printf '// LLM prompt( -- Phase 17 meta-test probe\n' > "$TEMP_FILE"
printf '// LLM prompt( -- Phase 20 meta-test probe (host scope)\n' > "$HOST_TEMP_FILE"
if ! grep_canvas > /dev/null 2>&1; then
	echo "META FAIL -- phase 2 negative: webview probe planted but grep_canvas returned no match"
	exit 1
fi
if ! grep_host_canvas > /dev/null 2>&1; then
	echo "META FAIL -- phase 2 negative: host probe planted but grep_host_canvas returned no match"
	exit 1
fi

# Phase 3: restore (trap handles cleanup)
echo "META PASS"
exit 0
