#!/usr/bin/env bash
# Phase 14 (Plan 14-01) — Refuse write-RPC tokens in the DEEP-05 inspector tree.
#
# Mandate B (DEEP-05): the session-priority lens + the ReadonlyKernelClient type live
# under src/vs/goatide/extensions/goatide-bridge/src/inspector/ and MUST NOT call any
# write-RPC on KernelClient. Even mentioning these names structurally signals a future
# contributor reaching for graph mutation; the gate fires regardless of whether the token
# is in code, a string, or a comment so the intent of the fence is unambiguous.
#
# Wave-0 (Plan 14-01): inspector/ ships ReadonlyKernelClient.ts (type-only) and
# session-priority-lens.ts (throwing stub). Neither file contains any banned token.
#
# Modeled on scripts/ci/refuse-fuzzy-fallback.sh — same git-ls-files + grep -E filter
# for Windows-mingw safety, single-rg-per-token scan over fixed-string matches inside
# the matched files.
#
# Exit codes:
#   0 — no banned token found (or inspector/ has zero tracked .ts files yet)
#   1 — at least one banned token found in an inspector/ .ts file

set -euo pipefail

INSPECTOR_DIR="src/vs/goatide/extensions/goatide-bridge/src/inspector"

BANNED=(
	"atomicAccept"
	"proposeEdit"
	"recordRejection"
	"recordContractOverride"
)

# Files to scan: tracked .ts files under inspector/. `git ls-files` so untracked
# sentinels from the meta-test are NOT scanned unless `git add --intent-to-add`'d
# (the meta-test does this intentionally to prove the gate fires).
#
# `grep -E` (POSIX) over `rg` for the filter: ripgrep on Windows mingw silently
# drops piped stdin, the Windows-runner footgun documented in refuse-vector-libs.sh.
mapfile -t FILES < <(git ls-files | grep -E "^${INSPECTOR_DIR}/.*\.ts$" || true)

EXISTING=()
for f in "${FILES[@]}"; do
	[ -f "$f" ] && EXISTING+=("$f")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
	echo "DEEP-05 inspector-write gate ok — ${INSPECTOR_DIR} tracks no .ts files yet."
	exit 0
fi

FOUND=0
for b in "${BANNED[@]}"; do
	# rg -F: fixed-string match (avoids substring false-positives in long identifiers
	# but also catches the bare token in comments — that is the explicit intent of the
	# fence). Output one banner per hit; head -5 so a runaway scan stays readable.
	HITS=$(rg --no-heading -F "$b" "${EXISTING[@]}" 2>/dev/null || true)
	if [ -n "$HITS" ]; then
		echo "DEEP-05 Mandate-B violation — banned write-RPC token '$b' found in ${INSPECTOR_DIR}:"
		echo "$HITS" | head -5
		FOUND=1
	fi
done

if [ "$FOUND" -eq 0 ]; then
	echo "DEEP-05 inspector-write gate ok — no banned write-RPC tokens in ${INSPECTOR_DIR} ($(echo "${EXISTING[@]}" | wc -w) file(s) scanned)."
fi
exit "$FOUND"
