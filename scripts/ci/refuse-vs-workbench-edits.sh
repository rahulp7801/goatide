#!/usr/bin/env bash
# FORK-04 — Refuse edits to upstream src/vs/** outside the allowlist.
#
# Constitutional mandate: keep the fork tree isolated. New GoatIDE code
# lives in src/vs/goatide/** so monthly upstream rebases stay tractable.
# The ONE allowlisted exception is src/vs/code/electron-main/app.ts — the
# kernel-spawn hook. Any other edit to src/vs/** outside src/vs/goatide/**
# is a structural violation.
#
# Diff base: $UPSTREAM_BASE.SHA (the pinned microsoft/vscode commit).
# This file is created in Plan 01-03. Until then, we exit 0 silently — the
# repo has no upstream tree to diff against, so there is nothing to enforce.
#
# Exit codes:
#   0 — no diff base yet (Wave 0) OR clean diff
#   1 — at least one non-allowlisted edit under src/vs/**
set -euo pipefail

if [ ! -f UPSTREAM_BASE ]; then
	echo "FORK-04 ok — UPSTREAM_BASE not yet present (Phase 1 not bootstrapped); skipping."
	exit 0
fi

# shellcheck source=/dev/null
source UPSTREAM_BASE

if [ -z "${SHA:-}" ]; then
	echo "FORK-04 violation — UPSTREAM_BASE exists but does not export SHA."
	exit 1
fi

# All files changed in src/vs/** between the pinned upstream SHA and HEAD.
# (POSIX grep used over rg for stdin-via-pipe — Windows mingw bash silently
# drops piped stdin to ripgrep; same fix as refuse-vector-libs.sh.)
DIFF=$(git diff --name-only "$SHA"..HEAD -- 'src/vs/' | grep -E '^src/vs/' || true)

# Strip allowlisted paths.
# monaco.d.ts (Phase 1.2): generated build artifact, NOT authored upstream code.
# `gulp monacodts` regenerates it from src/vs/editor/**; the output is
# TypeScript-version-dependent and Phase 1.1's TS-pin downgrade (~5.9.0)
# causes 3 EditorOption type narrowings vs. upstream's 6.0.x preview output.
# Allowlisting documents that this file is regenerated, not hand-edited.
# Future upstream-syncs may show fresh diffs here when upstream adds editor
# options; that's expected and benign — re-run `npx gulp monacodts && commit`.
VIOLATIONS=$(echo "$DIFF" \
	| grep -v -E '^src/vs/goatide/' \
	| grep -v -E '^src/vs/code/electron-main/app\.ts$' \
	| grep -v -E '^src/vs/monaco\.d\.ts$' \
	|| true)

if [ -n "$VIOLATIONS" ]; then
	echo "FORK-04 violation — non-allowlisted edits to upstream src/vs/**:"
	echo "$VIOLATIONS"
	echo
	echo "Allowlist:"
	echo "  - src/vs/goatide/**           (new fork-isolated code)"
	echo "  - src/vs/code/electron-main/app.ts  (kernel-spawn hook)"
	echo "  - src/vs/monaco.d.ts          (generated build artifact, TS-version-dependent)"
	echo
	echo "Move new code into src/vs/goatide/ to keep upstream rebases tractable."
	exit 1
fi

echo "FORK-04 ok — fork-isolated code stays out of vs/workbench/**."
exit 0
