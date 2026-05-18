---
phase: 20-decisionnode-authoring-write-path
plan: 01
subsystem: wave-0-fences-red-stubs
tags: [auth-01, auth-02, auth-03, auth-04, mandate-a, mandate-b, mandate-d, red-stubs, ci-fences, regression-gates]

# Dependency graph
requires:
  - phase: 14
    provides: refuse-deep05-write.sh DEEP-05 BANNED-array fence pattern (Mandate B)
  - phase: 17
    provides: refuse-llm-in-canvas.meta.sh Mandate A fence + mandate-d-destructive-no-hover.test.ts 4x3 matrix pattern
  - phase: 19
    provides: bridge test-discovery + electron-as-node mocha runner (run-mocha-electron.cjs)
provides:
  - "scripts/ci/refuse-deep05-write.sh BANNED array gains 'createDecisionNode' as the 5th entry (fence-before-surface for AUTH-04)"
  - "scripts/test/refuse-deep05-write.meta.sh Phase 3 positive-control block proving the new BANNED entry fires the gate"
  - "scripts/test/refuse-llm-in-canvas.meta.sh widened to scan host-side canvas/*.ts in addition to canvas/webview/"
  - "kernel/src/test/rpc/createDecisionNode.spec.ts RED stub (flipped GREEN by Plan 20-02 commit 6768e7985d5)"
  - "src/vs/goatide/extensions/goatide-bridge/test/unit/kernel/createDecisionNode.test.ts regression gate for KernelClient.createDecisionNode"
  - "3 canvas authoring-flow RED stubs (mandate-a, happy-path, cta-anchor) tracking Plan 20-03 contract"
  - "2 dispatchHover Reject regression gates (reject-button, reject-confirm) protecting Plan 20-04 work"
  - "mandate-d-destructive-no-hover.test.ts extended with recordRejectionCalls column (0 in every cell -- structural Mandate D extension)"
affects:
  - "Plan 20-02 (already landed) -- its kernel RPC + bridge method work satisfies createDecisionNode RED stubs"
  - "Plan 20-03 (pending) -- 3 authoring-flow stubs encode the contract that canvas/authoring-flow.ts must satisfy"
  - "Plan 20-04 (already landed) -- its dispatchHover Reject branch satisfies the 2 reject stubs"
  - "Plan 20-05 (Phase 20 closure verification) -- all 6 plan tasks now closed; can verify"

# Tech tracking
tech-stack:
  added: []  # no new deps; reuses existing mocha + electron-as-node + vitest harnesses
  patterns:
    - "Fence-before-surface (Mandate B Phase 14 lineage) -- BANNED array entry lands BEFORE the symbol exists in production code, so the moment a contributor adds the literal token to inspector/ the gate fires"
    - "Multi-scope grep fence (Phase 20 extension to Phase 17 pattern) -- refuse-llm-in-canvas.meta.sh now runs grep_canvas (webview/) AND grep_host_canvas (top-level canvas/*.ts) so each subtree's fence is provably independent"
    - "RED stub with dynamic-import + clear assert.fail diagnostic -- failing test message references the GREEN-flip target plan; future contributors immediately know what to land"
    - "Matrix-test column extension via Edit (not Write) -- mandate-d-destructive-no-hover.test.ts extended in-place to add recordRejectionCalls column without disturbing the existing 4x3 expected-vs-observed deep-equality structure"
    - "Retroactive RED-stub authoring -- Tasks 4 and 6 are authored AFTER their GREEN-flip plans (20-02, 20-04) have already landed; the tests serve as regression gates rather than guides (TDD philosophy preserved: the spec still encodes the contract)"

key-files:
  created:
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/kernel/createDecisionNode.test.ts (Task 6 / 25037a87eff)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-mandate-a.test.ts (Task 5 / 13e68bc1eff)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-happy-path.test.ts (Task 5 / 13e68bc1eff)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-cta-anchor.test.ts (Task 5 / 13e68bc1eff)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/dispatchHover-reject-button.test.ts (Task 6 / 767eeb81f6f)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/dispatchHover-reject-confirm.test.ts (Task 6 / 767eeb81f6f)"
    - "kernel/src/test/rpc/createDecisionNode.spec.ts (Task 3 RED stub; committed by Plan 20-02 in 6768e7985d5 -- see Deviations)"
  modified:
    - "scripts/ci/refuse-deep05-write.sh (Task 1 / 454080f2eb8 -- BANNED array +createDecisionNode)"
    - "scripts/test/refuse-deep05-write.meta.sh (Task 1 / 454080f2eb8 -- Phase 3 positive control)"
    - "scripts/test/refuse-llm-in-canvas.meta.sh (Task 2 / cdea35d6667 -- host-side canvas/*.ts scope)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/mandate-d-destructive-no-hover.test.ts (Task 6 / 767eeb81f6f -- recordRejectionCalls column added; LOCKED_CALLER_COUNT_WAVE1=2 preserved)"

key-decisions:
  - "Plan executed in TWO sessions due to parallel-execution merge -- Tasks 1, 2, 3 landed in a prior session (commits 454080f2eb8, cdea35d6667, 6768e7985d5); Tasks 4, 5, 6 landed in this continuation session (commits 25037a87eff, 13e68bc1eff, 767eeb81f6f). The intervening Plan 20-02 + Plan 20-04 work means Tasks 4 and 6 are authored as IMMEDIATELY GREEN regression gates rather than RED stubs (TDD philosophy preserved -- the spec still encodes the contract)."
  - "Task 3 (kernel/src/test/rpc/createDecisionNode.spec.ts) NOT recreated in this session -- Plan 20-02 already tracked it in commit 6768e7985d5 alongside the GREEN-flip implementation. Per Plan 20-02 SUMMARY decision 'track Plan 20-01 Wave-0 stub here', the stub is reachable from git history and serves its regression-gate role."
  - "Task 4 + Task 6 spec contracts preserved verbatim even though immediately GREEN -- if a future refactor removes the createDecisionNode method, the 'Reject' action, or the recordRejection wiring, these tests RED-flip and block the regression."
  - "Mandate D matrix extension preserves LOCKED_CALLER_COUNT_WAVE1=2 (Pitfall F caller-count fence). The matrix test still passes 3/3 because dispatchHover's body changed but the identifier count in tier-dispatch.ts is unchanged."

patterns-established:
  - "Pattern: retroactive RED-stub authoring -- when parallel-execution merge orders Wave-1/Wave-2 work before its Wave-0 stubs, the stubs are authored after the fact as IMMEDIATELY GREEN regression gates. The failure message still references the original GREEN-flip plan so the historical contract is documented in the test source."
  - "Pattern: matrix-test extension column -- add the new tracked metric to BOTH the observed map (per-cell counter increment) AND the expected map (default 0 in every cell unless the contract permits non-zero). deepStrictEqual continues to enforce exact equality without disturbing existing cells."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: ~25min (Session 1: ~15min for Tasks 1-3; Session 2: ~9min for Tasks 4-6 + verification + SUMMARY)
completed: 2026-05-18
---

# Phase 20 Plan 01: Wave-0 Fences + RED Stubs Summary

**Lands the Mandate B BANNED-array extension for `createDecisionNode`, widens the Mandate A LLM-in-canvas fence to host-side `canvas/*.ts`, and authors 7 RED test stubs (1 kernel vitest + 6 bridge mocha) closing all Wave-0 contracts for AUTH-01..04. Mandate D matrix gains a `recordRejectionCalls` column preserving the destructive-cells-zero invariant.**

## Performance

- **Duration:** ~25 min total (Session 1 ~15 min for Tasks 1-3; Session 2 ~9 min for Tasks 4-6)
- **Started:** 2026-05-18 (Session 1) / 2026-05-18T02:06:52Z (Session 2 continuation)
- **Completed:** 2026-05-18T02:15:30Z
- **Tasks:** 6 (all closed)
- **Files modified:** 4 modified + 6 created (7 if counting the kernel spec tracked in commit 6768e7985d5)
- **Commits:** 6 total — `454080f2eb8`, `cdea35d6667`, `6768e7985d5` (kernel spec tracked here), `25037a87eff`, `13e68bc1eff`, `767eeb81f6f`

## Accomplishments

- **Mandate B fence-before-surface landed** — `refuse-deep05-write.sh` BANNED array gains `createDecisionNode` as the 5th entry. The gate fires (exit 1) if any `.ts` file under `inspector/` contains the literal token. Phase 3 positive-control block in the meta-test proves the new entry fires the gate end-to-end.
- **Mandate A canvas fence widened** — `refuse-llm-in-canvas.meta.sh` now scans BOTH `canvas/webview/` (existing scope) AND host-side top-level `canvas/*.ts` (new scope). Pitfall C pre-flight grep confirmed PREFLIGHT CLEAN on the existing host files (panel.ts, messages.ts, rpc.ts). Phase 2 negative-control plants two probes (one per scope) and asserts each grep function catches its corresponding probe.
- **7 RED test stubs landed (one kernel vitest + 6 bridge mocha):**
  - `kernel/src/test/rpc/createDecisionNode.spec.ts` (tracked in commit `6768e7985d5`; now GREEN after Plan 20-02)
  - `test/unit/kernel/createDecisionNode.test.ts` — bridge KernelClient regression gate (GREEN after Plan 20-02)
  - 3 `test/unit/canvas/authoring-flow-*.test.ts` stubs — STAY RED until Plan 20-03 lands `canvas/authoring-flow.ts`
  - 2 `test/unit/save-gate/dispatchHover-reject-*.test.ts` regression gates (GREEN after Plan 20-04)
- **Mandate D matrix extension** — `mandate-d-destructive-no-hover.test.ts` 4x3 matrix gains `recordRejectionCalls` column. Every cell asserts `recordRejectionCalls === 0` because the matrix does not simulate user clicks on the post-hoc Reject button. Caller-count fence (`LOCKED_CALLER_COUNT_WAVE1 = 2`) preserved.
- **All gates GREEN at plan close:** 12/13 `refuse-*.sh` CI gates pass (1 pre-existing FORK-04 failure documented elsewhere); 4/4 meta-tests `META PASS`; kernel + bridge tsc compile GREEN; bridge unit suite shows the new RED stubs failing exactly as designed.

## Task Commits

Each task committed atomically:

1. **Task 20-01-01: Extend `refuse-deep05-write.sh` BANNED array + meta-test Phase 3 positive control** — `454080f2eb8` (test)
2. **Task 20-01-02: Extend `refuse-llm-in-canvas.meta.sh` to cover host-side `canvas/*.ts` (Pitfall C pre-flight clean)** — `cdea35d6667` (test)
3. **Task 20-01-03: Author kernel RED stub `createDecisionNode.spec.ts`** — `6768e7985d5` (test bundled into Plan 20-02's GREEN-flip commit; see Deviations below)
4. **Task 20-01-04: Author bridge RED stub `test/unit/kernel/createDecisionNode.test.ts`** — `25037a87eff` (test)
5. **Task 20-01-05: Author 3 bridge RED stubs for `canvas/authoring-flow.ts`** — `13e68bc1eff` (test)
6. **Task 20-01-06: Author 2 bridge RED stubs for `dispatchHover` Reject + extend Mandate D matrix** — `767eeb81f6f` (test)

**Plan metadata commit:** (created with this SUMMARY.md + STATE/ROADMAP updates)

## Files Created/Modified

- `scripts/ci/refuse-deep05-write.sh` — BANNED array gains `createDecisionNode` 5th entry with explanatory comment line. Other entries byte-identical.
- `scripts/test/refuse-deep05-write.meta.sh` — Phase 3 positive-control block + extended trap cleanup for `FIXTURE2`. Existing Phase 1/2 blocks byte-identical.
- `scripts/test/refuse-llm-in-canvas.meta.sh` — `HOST_CANVAS_DIR` variable, `grep_host_canvas` function, parallel directory existence check, Phase 1 expansion to run BOTH grep functions, Phase 2 plants TWO probes.
- `kernel/src/test/rpc/createDecisionNode.spec.ts` — Vitest spec spawning in-process kernel server, dynamic-import of `CreateDecisionNodeRequest`, round-trip persists DecisionNode via dao.seed. Tracked in commit `6768e7985d5` (Plan 20-02).
- `src/vs/goatide/extensions/goatide-bridge/test/unit/kernel/createDecisionNode.test.ts` — KernelClient prototype check + monkey-patched `sendWithTimeout` spy verifying route through `CreateDecisionNodeRequest`. Regression gate.
- `src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-mandate-a.test.ts` — Asserts `showInputBox.opts.value === ''` on first call (Mandate A no-prefill).
- `src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-happy-path.test.ts` — Multi-step happy path (QuickPick -> InputBox -> confirm -> kernel.createDecisionNode) with `repo_id: 'primary'` Phase 21 forward-compat.
- `src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-cta-anchor.test.ts` — Anchor auto-populate from `prefilledAnchorPath` (OQ#4).
- `src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/dispatchHover-reject-button.test.ts` — Asserts showInformationMessage actions include BOTH 'Reject' AND 'Open full receipt' when (silent, false, hover).
- `src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/dispatchHover-reject-confirm.test.ts` — Asserts click 'Reject' + modal 'Reject' confirm fires kernel.recordRejection with `note: 'user_post_hoc_reject_benign_hover'`. `showWarningMessage` mocked with undefined-safe restore pattern (mirror Phase 14 mcp banner tests).
- `src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/mandate-d-destructive-no-hover.test.ts` — `recordRejectionCalls` column added to both `expectedMap` and `resultMap` shapes. Per-cell counter increments via `recordRejection: async () => { recordRejectionCalls++; }` in the kernel mock. Every cell expects `recordRejectionCalls: 0` (matrix doesn't simulate user clicks). Caller-count fence + secondary it() blocks unchanged.

## Decisions Made

1. **Plan executed in two sessions due to parallel-execution merge** — A prior session landed Tasks 1, 2 directly and authored Task 3's kernel RED stub on disk uncommitted. While that session was paused, Plans 20-02 + 20-04 ran in parallel (under `gsd-executor` agents sharing the same `.git/index`); Plan 20-02 picked up the uncommitted Task 3 stub and committed it alongside its own GREEN-flip work. The session 1 executor saw this as "contamination" and stopped early. This continuation session resumed with Tasks 4, 5, 6 against a known-clean working tree.

2. **Tasks 4 and 6 authored as IMMEDIATELY GREEN regression gates** — Because Plan 20-02 already landed `KernelClient.createDecisionNode` (commit `3e7198ca2bd`) and Plan 20-04 already landed the dispatchHover Reject branch (commit `61bb7a1973a`), the tests authored in Tasks 4 + 6 pass immediately. Per TDD philosophy, the spec still encodes the contract — if a future refactor removes the method or the Reject button, the tests RED-flip. The test source comments explicitly call out the retroactive authoring so the GREEN-flip-target plan history is documented.

3. **Task 3 NOT re-authored in this session** — `kernel/src/test/rpc/createDecisionNode.spec.ts` is fully tracked in commit `6768e7985d5` (Plan 20-02's GREEN-flip commit). Recreating it would be redundant and would risk diverging from the version that paired with the GREEN-flip implementation. The Plan 20-02 SUMMARY explicitly documents the tracking decision under its Deviations section.

4. **showWarningMessage undefined-safe restore pattern** — The electron-as-node test harness doesn't natively define `vscode.window.showWarningMessage`. The dispatchHover-reject-confirm.test.ts restore-block deletes the property when the original was `undefined`, mirroring the Phase 14 `integration/mcp/liveness-banner-ext.test.ts` pattern.

5. **Mandate D matrix recordRejectionCalls === 0 in every cell** — The matrix test simulates dispatchTier once per cell with `showInformationMessage` returning `undefined` (the default). The Reject branch in dispatchHover only fires when the user clicks 'Reject' AND confirms the modal — neither happens in the matrix scenario. The destructive cells stay 0 by structural impossibility (dispatchHover is only reachable on `(silent, false, 'hover')`). User-click simulation is the dispatchHover-reject-confirm.test.ts case, which is a separate it().

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 3 RED stub tracked by Plan 20-02 instead of Plan 20-01**

- **Found during:** Session 2 continuation -- discovered while inspecting git history for task ordering
- **Issue:** The original Plan 20-01 session authored `kernel/src/test/rpc/createDecisionNode.spec.ts` to disk but never committed it before stopping. During the same wall-clock window, the parallel Plan 20-02 executor picked up the uncommitted file as part of its working tree, committed it alongside the kernel RPC + handler in commit `6768e7985d5`. The Plan 20-02 SUMMARY explicitly documents this under its Deviations section ("track Plan 20-01 Wave-0 stub here").
- **Fix:** No corrective action needed. The stub IS tracked in git history under Plan 20-02's commit; its regression-gate role is intact. Recreating it under a Plan 20-01 commit would diverge from the version that paired with the GREEN-flip implementation. This SUMMARY references commit `6768e7985d5` for the artifact, mirroring Plan 20-02's reference back to Plan 20-01's authorship.
- **Files modified:** None in this session (the kernel spec exists at HEAD via commit `6768e7985d5`)
- **Verification:** `git show 6768e7985d5 --stat | grep createDecisionNode.spec.ts` shows the file landed; `cd kernel && npm test -- --grep "createDecisionNode"` shows 1 PASS (GREEN regression gate).
- **Committed in:** `6768e7985d5` (Plan 20-02 commit; documented here for traceability)

**2. [Rule 3 - Blocking] `showWarningMessage` may be undefined in electron-as-node test harness**

- **Found during:** Task 6 first verification run -- dispatchHover-reject-confirm.test.ts failed with `TypeError: Cannot read properties of undefined (reading 'bind')` at `vscode.window.showWarningMessage.bind(vscode.window)`.
- **Issue:** The electron-as-node test runner doesn't natively define `vscode.window.showWarningMessage`. The default `.bind(vscode.window)` pattern (which works for `showInformationMessage` and `setStatusBarMessage` because those ARE defined) throws when applied to an undefined property.
- **Fix:** Used the undefined-safe restore pattern from `test/integration/mcp/liveness-banner-ext.test.ts`: store the original via `(vscode.window as unknown as { showWarningMessage?: unknown }).showWarningMessage` (which is `undefined`), monkey-patch with the mock, and restore via `delete (vscode.window as unknown as ...).showWarningMessage` if the original was `undefined`.
- **Files modified:** `src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/dispatchHover-reject-confirm.test.ts`
- **Verification:** Re-ran `npm test -- --grep "dispatchHover|Mandate D"` → 5/5 PASS.
- **Committed in:** `767eeb81f6f` (Task 6 commit -- fix included in the same commit as the file authoring)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations are continuity / harness-compatibility issues, not scope creep. Deviation 1 documents the cross-plan artifact tracking; deviation 2 documents a test-harness workaround that mirrors existing Phase 14 patterns. No production code touched; no Wave-0 contracts diluted.

## Issues Encountered

### Pre-existing FORK-04 gate failure (out of scope)

- **Observation:** `scripts/ci/refuse-vs-workbench-edits.sh` reports `src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts` as a non-allowlisted upstream edit. Last touched by commit `049bdcf2868` (Plan 10-04, well predates Phase 20). Same observation documented in Plan 20-04 SUMMARY.
- **Impact on Plan 20-01:** None. Plan 20-01 only touched `scripts/` + `kernel/src/test/` + `src/vs/goatide/extensions/goatide-bridge/test/`. The workbench file is untouched by this plan.
- **Resolution:** Already-deferred FORK-04 item; no action.

### Pre-existing bridge test suite environmental failures (out of scope)

- **Observation:** Bridge `npm test` full-suite run reports ~16 pre-existing failing tests (Phase 7 drift-flow ×6, POLISH-01 walkthrough ×1, CANV-01 ×4, DriftFindings ×2, HypotheticalImpact ×3) due to jsdom `HTMLCanvasElement.prototype.getContext` not implemented. Confirmed pre-existing in Plan 20-02 + Plan 20-04 SUMMARYs. None reference the new test surfaces from Plan 20-01.
- **Impact on Plan 20-01:** None — the new RED stubs are discoverable and produce the expected failure messages; the 3 authoring-flow stubs RED with `'canvas/authoring-flow.js module not found -- Plan 20-03 (Wave 2) must create it'`, the dispatchHover stubs are GREEN as regression gates, the kernel client stub is GREEN, the Mandate D matrix is GREEN.
- **Resolution:** Out of scope per execute-plan.md SCOPE BOUNDARY rule. Pre-existing environmental gap. Recorded here for visibility.

## Verification Evidence

| Gate | Result | Notes |
|---|---|---|
| `scripts/ci/refuse-deep05-write.sh` | PASS | Exit 0 — inspector/ has zero banned tokens |
| `scripts/test/refuse-deep05-write.meta.sh` | PASS | META PASS — Phase 1/2/3 positive controls all fire correctly |
| `scripts/test/refuse-llm-in-canvas.meta.sh` | PASS | META PASS — both grep_canvas (webview/) and grep_host_canvas (canvas/*.ts) scopes verified |
| `scripts/test/refuse-stale-bridge-mirror-after-walkthrough.meta.sh` | PASS | META PASS |
| `scripts/test/refuse-stale-bridge-mirror-after-configurationDefaults.meta.sh` | PASS | META PASS |
| Other 11 CI `refuse-*.sh` gates | PASS | All exit 0 (refuse-vs-workbench-edits.sh FAIL is pre-existing FORK-04 issue out of scope) |
| Kernel tsc `npx tsc -p . --noEmit` | PASS | Zero errors (silent stdout) |
| Bridge tsc `npx tsc -p . --noEmit` | PASS | Zero errors (silent stdout) |
| Caller-count fence | PASS | `grep -c "\bdispatchHover\b" tier-dispatch.ts` == 2 (1 declaration + 1 caller from dispatchTier) |
| Mandate D matrix test (4x3 cells × recordRejectionCalls column) | PASS | 3/3 it() blocks pass with extended column |
| Plan 20-01 new test surfaces | PASS as designed | 2 GREEN regression gates (kernel client + 2 dispatchHover), 3 RED stubs (authoring-flow waiting on Plan 20-03), 1 GREEN kernel spec (was Task 3, tracked in 6768e7985d5) |
| `git status --short` | PASS | Clean working tree |
| Phase 19 SC3b CDP smoke regression check | (not re-run -- this plan only adds test files; no runtime impact possible) | Plan 20-04 SUMMARY confirmed 13/13 EXIT 0 on the same code state plus Plan 20-04's tier-dispatch.ts edits |

## User Setup Required

None — no external service configuration required.

## Next Plan Readiness

- **Ready for Plan 20-03 (canvas/authoring-flow.ts + extension.ts command swap):**
  - The 3 authoring-flow RED stubs encode the SC#1c/1d/1e contracts verbatim. Plan 20-03 must:
    - Create `src/vs/goatide/extensions/goatide-bridge/src/canvas/authoring-flow.ts` exporting `runAddDecisionNodeFlow(context, kernel, panel, opts?)`.
    - Pass `value: ''` to the first `showInputBox` call (Mandate A SC#1c).
    - Support multi-step flow: anchor pick (`showQuickPick`) → rationale input (`showInputBox`) → confirmation (`showInformationMessage`) → `kernel.createDecisionNode(...)` call with `repo_id: 'primary'` (SC#1d).
    - Honor `opts.prefilledAnchorPath` to bypass anchor picker when present (SC#1e).
  - The kernel write path (Plan 20-02) is live. Plan 20-03 needs only to wire the canvas-side authoring flow.

- **Ready for Plan 20-05 (Phase 20 closure verification):**
  - All 6 Plan 20-01 tasks closed. The "missing Plan 20-01 RED stubs" issue documented in Plan 20-04 SUMMARY is now resolved.
  - Plan 20-05 can run its phase-VERIFICATION harness against the full set of Plan 20-01..04 surfaces with no Wave-0 gaps.

- **Phase-level invariants intact:** Mandate D structural fence GREEN (extended); Mandate B fence GREEN; Mandate A canvas fence GREEN (widened); caller-count fence GREEN (LOCKED_CALLER_COUNT_WAVE1=2 preserved).

---
*Phase: 20-decisionnode-authoring-write-path*
*Plan: 01*
*Completed: 2026-05-18*

## Self-Check: PASSED

Verification of claims in this SUMMARY:

- All 6 created bridge test files present on disk (Task 4-6 deliverables) — verified via `git status --short` empty and `git log` showing each commit
- Task 3 kernel spec `kernel/src/test/rpc/createDecisionNode.spec.ts` present in HEAD tree (tracked via commit `6768e7985d5`)
- Task 1-2 fence-script edits present in HEAD tree (`454080f2eb8`, `cdea35d6667`)
- 6 task commits all visible in `git log --oneline -10` — `454080f2eb8`, `cdea35d6667`, `6768e7985d5`, `25037a87eff`, `13e68bc1eff`, `767eeb81f6f`
- All CI gates + meta-tests verified GREEN at SUMMARY-time (see Verification Evidence table)
- Caller-count fence: `grep -c "\bdispatchHover\b" src/vs/goatide/extensions/goatide-bridge/src/save-gate/tier-dispatch.ts` returns 2 — confirmed
