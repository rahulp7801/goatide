#!/usr/bin/env bash
# scripts/freshclone-smoke.sh
#
# Phase 9 Plan 09-00 (Wave 0) — placeholder driver for the fresh-clone CDP smoke
# harness. Plan 09-05 (Wave 2) fills the body with the real verification chain.
#
# Intended Wave-2 contract (per 09-RESEARCH.md section "Pattern 6 — Fresh-clone CDP
# smoke harness"):
#   1. `npm install` (idempotent on already-installed tree, fresh on clean clone)
#   2. `npm run compile` (chains transpile-client after BUILD-RT-02 lands)
#   3. `node scripts/test/freshclone-smoke-cdp.cjs` (4 CDP assertions via Playwright's
#      _electron.launch():
#        a) renderer document.title contains "Visual Studio Code"/"GoatIDE"
#        b) workbench-dev.html loaded (renderer URL probe)
#        c) kernel.lock alive in ~/.goatide/kernel/ (daemon up)
#        d) cmd palette includes the "GoatIDE: Set Session Priority" entry
#      ) under a 15-min budget controlled by ${SMOKE_TIMEOUT_S:-900}
#
# Today it exits 0 after printing a TODO sentinel; Wave 2 will replace the body
# without changing the file path. Plan 09-05 task verify greps this file for the
# "TODO Wave 2" marker before-vs-after to confirm the implementation actually
# replaced (not extended) the placeholder.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "TODO Wave 2: freshclone-smoke.sh — Plan 09-05 implements fresh-clone CDP smoke (BUILD-RT-* SC #5)"
echo "ROOT=$ROOT"
exit 0
