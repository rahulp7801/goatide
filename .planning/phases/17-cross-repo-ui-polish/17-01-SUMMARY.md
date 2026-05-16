---
phase: 17-cross-repo-ui-polish
plan: 01
subsystem: ui
tags: [vscode-extension, walkthrough, save-gate, inspector, cross-repo, testing, typescript]

# Dependency graph
requires:
  - phase: 16-ripple-cross-repo-migration
    provides: repo-fingerprint helper (kernel/src/graph/repo-fingerprint.ts) + queryByRepo DAO + DEEP-06 phase-A schema

provides:
  - Wave-0 scaffold for Phase 17 — 6 RED test files with locked case-name strings
  - walkthrough-completion.ts real body (POLISH-01 Pitfall 9 fence)
  - workspace-repos.ts real body (DEEP-06 phase-B fingerprint + enumerateWorkspaceRepos)
  - 5 walkthrough markdown placeholder files (media/walkthrough/step{1..5}-*.md)
  - bridge package.json extended with contributes.walkthroughs (5 steps) + 3 saveGate.* config properties + 3 new commands
  - Bridge mirror byte-equal (extensions/goatide-bridge/package.json + media/walkthrough/)
  - 2 new hermetic meta-tests (refuse-llm-in-canvas + refuse-stale-bridge-mirror-after-walkthrough)
  - prepare_goatide.sh extended to propagate media/walkthrough/ to mirror
  - refuse-stale-bridge-mirror.sh extended to assert media/walkthrough/* byte-equal

affects:
  - 17-02-wave1-tier-dispatch-save-gate-settings (GREEN-flips save-gate-resource-scope + mandate-d tests)
  - 17-03-wave2-citation-list-empty-state (GREEN-flips empty-state-mandate-a test)
  - 17-04-wave3-cross-repo-command (GREEN-flips cross-repo-command test)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Wave-0 RED test authoring — locked case-name strings for downstream plan --grep discovery (Nyquist Dim 8d)
    - Dual-real-body wave-0 — walkthrough-completion.ts + workspace-repos.ts ship REAL bodies in Wave 0 (tiny enough; no throw-stub split)
    - Hermetic meta-test pattern (refuse-llm-in-canvas.meta.sh + refuse-stale-bridge-mirror-after-walkthrough.meta.sh) following Phase 14/15/16 precedent

key-files:
  created:
    - src/vs/goatide/extensions/goatide-bridge/src/onboarding/walkthrough-completion.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/workspace-repos.ts
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step1-canvas.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step2-receipt.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step3-intentdrift.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step4-settings.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step5-inspector.md
    - src/vs/goatide/extensions/goatide-bridge/test/unit/walkthrough-completion.test.ts
    - src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/save-gate-resource-scope.test.ts
    - src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/mandate-d-destructive-no-hover.test.ts
    - src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/empty-state-mandate-a.test.tsx
    - src/vs/goatide/extensions/goatide-bridge/test/unit/workspace-repos.test.ts
    - src/vs/goatide/extensions/goatide-bridge/test/unit/cross-repo-command.test.ts
    - src/vs/goatide/extensions/goatide-bridge/test/unit/helpers/spyOn.ts
    - scripts/test/refuse-llm-in-canvas.meta.sh
    - scripts/test/refuse-stale-bridge-mirror-after-walkthrough.meta.sh
    - extensions/goatide-bridge/media/walkthrough/step1-canvas.md
    - extensions/goatide-bridge/media/walkthrough/step2-receipt.md
    - extensions/goatide-bridge/media/walkthrough/step3-intentdrift.md
    - extensions/goatide-bridge/media/walkthrough/step4-settings.md
    - extensions/goatide-bridge/media/walkthrough/step5-inspector.md
  modified:
    - src/vs/goatide/extensions/goatide-bridge/package.json
    - extensions/goatide-bridge/package.json
    - scripts/prepare_goatide.sh
    - scripts/ci/refuse-stale-bridge-mirror.sh

key-decisions:
  - "Dual-real-body Wave 0: walkthrough-completion.ts and workspace-repos.ts ship REAL bodies (not throw-stubs) because they are too small to justify a wave split — their corresponding tests GREEN-flip at Wave-0 close."
  - "Mirror regen via direct cp (not prepare_goatide.sh): package.json + media/walkthrough/*.md copied manually for speed; prepare_goatide.sh extended for canonical future runs."
  - "refuse-stale-bridge-mirror.sh extended with diff -r for media/walkthrough/: gate now asserts both package.json AND markdown file byte-equality between source and mirror."
  - "prepare_goatide.sh extended with conditional cp of media/walkthrough/*.md: idempotent; no-op when media dir absent (forward-compatible for any future media additions)."
  - "Formatter compliance: TypeScript hygiene gate requires () => { } (space in empty body) not () => {}. Fixed in save-gate-resource-scope.test.ts and empty-state-mandate-a.test.tsx before commit."

patterns-established:
  - "Wave-0 RED test contract: tests written against Wave-0 stubs fail with explicit 'Wave N Plan 17-NN GREEN-flips' hint messages so subsequent plan authors know which wave to fix."
  - "Factored spyOn helper: test/unit/helpers/spyOn.ts factored at 3+ test file usage threshold (Phase 15 Plan 15-03 established: inline if <3 files, factor if >=3)."

requirements-completed:
  - POLISH-01
  - POLISH-02
  - POLISH-03
  - POLISH-04
  - DEEP-06

# Metrics
duration: 45min
completed: 2026-05-15
---

# Phase 17 Plan 01: Wave-0 Stubs + RED Tests + Bridge Mirror Regen + Mandate A/D Fences Summary

**Wave-0 scaffold for Phase 17 Polish Cluster: 6 RED test files with locked case-name strings, walkthrough-completion.ts + workspace-repos.ts real bodies, bridge package.json extended with walkthroughs + 3 saveGate settings + 3 commands, mirror byte-equal, 2 new hermetic meta-tests, all 5 refuse-*.sh CI gates GREEN.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-15T00:00:00Z
- **Completed:** 2026-05-15
- **Tasks:** 5
- **Files modified:** 24

## Accomplishments

- 6 RED test files authored with verbatim describe/it case-name strings locked for Plans 17-02/03/04 --grep discovery (Nyquist Dim 8d)
- 2 test files GREEN at Wave-0 close: walkthrough-completion.test.ts (3/3) + workspace-repos.test.ts (4/4) — real bodies shipped in this wave
- Bridge package.json: 1 walkthrough (5 steps, completionEvents on step 5) + 3 saveGate.* resource-scoped config properties + 3 new commands (openCrossRepoGraph, onboarding.complete, canvas.addDecisionNode)
- Bridge mirror regen: package.json + media/walkthrough/*.md byte-equal; refuse-stale-bridge-mirror.sh extended to gate both; prepare_goatide.sh extended to propagate both
- 2 new hermetic meta-tests: refuse-llm-in-canvas.meta.sh (Mandate A structural fence) + refuse-stale-bridge-mirror-after-walkthrough.meta.sh (Pitfall C defense) — both print META PASS
- All 5 existing refuse-*.sh CI gates continue to exit 0; all 5 meta-tests (3 prior + 2 new) print META PASS

## Task Commits

1. **Task 1: Author 6 RED test files + spy helper** - `792ca9b0dff` (test)
2. **Task 2: walkthrough-completion.ts + 5 markdown placeholders** - `370d51d93b7` (feat)
3. **Task 3: workspace-repos.ts real body + Mandate B fence** - `412622b7a8a` (feat)
4. **Task 4: Extend bridge package.json + regen mirror** - `f2d6b32494e` (feat)
5. **Task 5: 2 new hermetic meta-tests** - `652dd65d831` (feat)

## Files Created/Modified

- `src/vs/goatide/extensions/goatide-bridge/src/onboarding/walkthrough-completion.ts` — POLISH-01 real body; Pitfall 9 fence (globalState.update, NOT WorkspaceConfiguration.update)
- `src/vs/goatide/extensions/goatide-bridge/src/inspector/workspace-repos.ts` — DEEP-06 phase-B real body; fingerprint() byte-equal with kernel helper
- `src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step{1..5}-*.md` — 5 walkthrough markdown placeholders (Wave 3 refines copy)
- `src/vs/goatide/extensions/goatide-bridge/test/unit/walkthrough-completion.test.ts` — 3-case GREEN suite (POLISH-01 Pitfall 9 fence)
- `src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/save-gate-resource-scope.test.ts` — 2-case RED suite (Wave 1 GREEN-flips)
- `src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/mandate-d-destructive-no-hover.test.ts` — 3-case RED suite (Wave 1 GREEN-flips)
- `src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/empty-state-mandate-a.test.tsx` — 3-case RED suite (Wave 2 GREEN-flips)
- `src/vs/goatide/extensions/goatide-bridge/test/unit/workspace-repos.test.ts` — 4-case GREEN suite (DEEP-06 phase-B fingerprint parity)
- `src/vs/goatide/extensions/goatide-bridge/test/unit/cross-repo-command.test.ts` — 3-case RED suite (Wave 3 GREEN-flips)
- `src/vs/goatide/extensions/goatide-bridge/test/unit/helpers/spyOn.ts` — factored monkey-patch spy helper (no sinon)
- `src/vs/goatide/extensions/goatide-bridge/package.json` — contributes.walkthroughs + saveGate.* + 3 new commands
- `extensions/goatide-bridge/package.json` — mirror (byte-equal)
- `extensions/goatide-bridge/media/walkthrough/*.md` — mirror markdown files
- `scripts/prepare_goatide.sh` — extended to propagate media/walkthrough/*.md to mirror
- `scripts/ci/refuse-stale-bridge-mirror.sh` — extended to assert diff -r on media/walkthrough/
- `scripts/test/refuse-llm-in-canvas.meta.sh` — Mandate A structural fence meta-test
- `scripts/test/refuse-stale-bridge-mirror-after-walkthrough.meta.sh` — bridge mirror regen completeness meta-test

## Decisions Made

- **Dual-real-body Wave 0:** walkthrough-completion.ts + workspace-repos.ts ship REAL bodies (not throw-stubs). Both files are tiny (~50 lines each); the corresponding tests GREEN-flip at Wave-0 close rather than requiring Wave-1 flip. All other tests remain RED until Plans 17-02/03/04.
- **Mirror regen via direct cp:** Quick iteration used `cp src/.../package.json extensions/goatide-bridge/package.json` + `cp media/walkthrough/*.md extensions/goatide-bridge/media/walkthrough/`. Canonical path is `bash scripts/prepare_goatide.sh` (extended in Task 4). Both approaches produce byte-equal output verified by refuse-stale-bridge-mirror.sh.
- **refuse-stale-bridge-mirror.sh control flow refactor:** Original script had `if diff; then exit 0; fi` + tail error path. Restructured to `if ! diff; then exit 1; fi` + new media/walkthrough diff + final exit 0. Removed leftover dead code (old exit 1 + error message at tail).
- **Formatter compliance: empty body spacing:** TypeScript hygiene gate (build/lib/formatter.ts using TypeScript's FormatCodeSettings with `insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true`) requires `() => { }` not `() => {}`. Fixed in 2 test files before Task 1 commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript formatter requires space inside empty arrow function bodies**
- **Found during:** Task 1 (test file authoring)
- **Issue:** Hygiene hook rejected `() => {}` pattern; formatter wants `() => { }` (space in empty body per `insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true` in FormatCodeSettings)
- **Fix:** Replaced all `() => {}` with `() => { }` in save-gate-resource-scope.test.ts and empty-state-mandate-a.test.tsx
- **Files modified:** test/unit/save-gate/save-gate-resource-scope.test.ts, test/unit/canvas/empty-state-mandate-a.test.tsx
- **Verification:** `npm run precommit` passed; hygiene hook green
- **Committed in:** 792ca9b0dff (Task 1 commit, after fix)

**2. [Rule 1 - Bug] refuse-stale-bridge-mirror.sh had dead code after restructuring**
- **Found during:** Task 4 (script restructuring)
- **Issue:** After restructuring the control flow from `if diff; then exit 0; fi ... exit 1` to `if ! diff; then exit 1; fi ... exit 0`, the original `Fix: re-run...` error message + `exit 1` remained as dead unreachable code
- **Fix:** Removed the orphaned lines at the tail of the file
- **Files modified:** scripts/ci/refuse-stale-bridge-mirror.sh
- **Verification:** `bash scripts/ci/refuse-stale-bridge-mirror.sh` exits 0 on clean tree; meta-test META PASS

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bug)
**Impact on plan:** Both auto-fixes were mechanical correctness fixes; no behavioral or scope changes.

## Issues Encountered

None beyond the formatter compliance fix documented above.

## Handoff Notes for Plans 17-02 / 17-03 / 17-04

- **Plan 17-02 (Wave 1 — tier-dispatch):** GREEN-flip targets: save-gate-resource-scope.test.ts (2 cases) + mandate-d-destructive-no-hover.test.ts (3 cases). Must add: (1) resource-scoped `vscode.workspace.getConfiguration('goatide.saveGate', doc.uri)` reads in tier-dispatch.ts; (2) `dispatchHover` function (1 declaration + 1 caller in silent branch); (3) full 4x3 matrix dispatch behavior respecting Mandate D.
- **Plan 17-03 (Wave 2 — CitationList empty state):** GREEN-flip targets: canvas/empty-state-mandate-a.test.tsx (3 cases). Must add: `onAddDecisionNode` prop to CitationList + `data-testid="empty-state-heading"` with text "No rationale recorded yet" + `data-testid="empty-state-add-decision-node"` CTA button. Must NOT introduce any LLM token patterns (refuse-llm-in-canvas.meta.sh gate).
- **Plan 17-04 (Wave 3 — cross-repo command):** GREEN-flip targets: cross-repo-command.test.ts (3 cases). Must add: `goatide.openCrossRepoGraph` registration in extension.ts + `GraphInspectorPanel.getOrCreateForCrossRepo` static method.
- **Test case name strings are LOCKED** — Plans 17-02/03/04 use `--grep` queries matching these verbatim strings. Do NOT rename.

## Next Phase Readiness

- All Wave-0 constitutional fences in place: Pitfall 9 (walkthrough completion), Mandate A (no LLM in Canvas), Mandate D (destructive saves), resource-scoped getConfiguration
- Bridge package.json source-of-truth + mirror both updated; all CI gates green
- Plans 17-02 / 17-03 / 17-04 can proceed independently (each GREEN-flips a disjoint test subset)

---
*Phase: 17-cross-repo-ui-polish*
*Completed: 2026-05-15*
