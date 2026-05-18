---
phase: 20-decisionnode-authoring-write-path
plan: 05
subsystem: decisionnode-authoring + post-hoc-reject + mandate-fences
tags: [auth-01, auth-02, auth-03, auth-04, decisionnode, authoring-flow, quickpick-chain, kernel-rpc, dispatchHover, reject-button, recordRejection, mandate-a, mandate-b, mandate-d, ci-fence-extensions]

# Dependency graph
requires:
  - phase: 19-walkthrough-foregrounding-fix
    provides: "13/13 CDP smoke baseline (WALK-01 GREEN); SC3b is the regression gate any Phase 20 changes must preserve"
  - phase: 17-cross-repo-ui-polish-cluster
    provides: "goatide.canvas.addDecisionNode v2.0 placeholder command (POLISH-03); dispatchHover function (POLISH-04); Mandate D 4x3 matrix test; refuse-llm-in-canvas.meta.sh; mandate-d-destructive-no-hover.test.ts"
  - phase: 14-foundation-rpcs
    provides: "kernel.recordRejection RPC + signature (RecordRejectionParams: receipt_id, change_id, note); ReadonlyKernelClient Pick<> pattern (DEEP-05); refuse-deep05-write.sh BANNED-array fence pattern (Mandate B)"
  - phase: 04-verification-canvas
    provides: "vscode-jsonrpc 8.2.1 bridge <-> kernel transport (graph.* RPC namespace); CanvasShowPayload schema; tier-dispatch.ts save-gate spine"
  - phase: 02-bitemporal-graph-substrate
    provides: "GraphDAO.seed + DecisionPayload Zod schema (kind/body/anchor/derived_under_priority/cite_eligible/detail)"
provides:
  - "graph.createDecisionNode kernel RPC -- typed JSON-RPC RequestType + connection.onRequest handler under requireAuth wrapper"
  - "KernelClient.createDecisionNode bridge method -- Promise-returning wrapper round-tripping CreateDecisionNodeParams"
  - "canvas/authoring-flow.ts host-side multi-step QuickPick orchestrator: anchor pick -> rationale (value: '') -> optional priority -> confirm -> kernel write"
  - "extension.ts goatide.canvas.addDecisionNode command body swap: v2.0 placeholder replaced by runAddDecisionNodeFlow with Pitfall-G try/catch"
  - "dispatchHover Step 4 Reject branch: showInformationMessage 'Reject' action + showWarningMessage modal confirm + kernel.recordRejection wiring (note literal 'user_post_hoc_reject_benign_hover')"
  - "refuse-llm-in-canvas.meta.sh widened: new HOST_CANVAS_DIR + grep_host_canvas scope (Mandate A covers canvas/*.ts in addition to canvas/webview/)"
  - "refuse-deep05-write.sh BANNED array extended: createDecisionNode added as 5th entry (fence-before-surface; Wave 0)"
  - "Mandate D matrix extension: 4x3 cells gain recordRejectionCalls column with === 0 invariant"
  - "AUTH-01..04 CLOSED: DecisionNode write path + post-hoc Reject + Mandate A/B fence extensions all live"
affects:
  - "Phase 21 (Cross-Repo Activation): XREPO-01 will extend existing write RPCs with optional repo_id parameter; the new graph.createDecisionNode RPC already accepts repo_id via provenance.detail (forward-compat default 'primary')"
  - "v2.2 work: constraint-link picker UI (OQ#3 deferral); WebviewPanel authoring form (OQ#5 deferral)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fence-before-surface (Mandate B): BANNED-array entry lands BEFORE the symbol exists in production code; the moment a contributor adds the literal token to inspector/, the gate fires"
    - "Multi-scope grep fence (Mandate A extension to Phase 17 pattern): refuse-llm-in-canvas.meta.sh runs grep_canvas (webview/) AND grep_host_canvas (canvas/*.ts) so each subtree's fence is provably independent"
    - "Multi-step QuickPick chain (vs WebviewPanel form): authoring uses vscode.window.showInputBox/showQuickPick/showInformationMessage primitives -- Mandate-A-safe by default (no new webview to fence)"
    - "Rationale-first ordering in QuickPick chains: collect required free-text field BEFORE optional inputs so cancellation short-circuits without burdening the user"
    - "Pitfall G try/catch around command body: runtime errors in runAddDecisionNodeFlow surface via showErrorMessage instead of throwing into activation"
    - "Banned-token-aware comments in canvas/*.ts: comments must avoid literal banned tokens (LLM, prompt(, etc.) because the Mandate A fence is grep-based; use synonyms (language-model) instead"
    - "Post-hoc reject button in save-gate: showInformationMessage with multi-action triplet + nested showWarningMessage modal {modal:true} for destructive-decision confirm"
    - "try/catch scope minimal around recordRejection: modal cancellation is normal flow (undefined return); RPC failure is the only error path worth logging"
    - "Matrix-test column extension via Edit: add new tracked metric to BOTH expected and observed maps without disturbing existing cell structure (deepStrictEqual continues to enforce exact equality)"
    - "Retroactive RED-stub authoring: when parallel-execution merge orders Wave-1/Wave-2 work before its Wave-0 stubs, the stubs are authored after the fact as IMMEDIATELY GREEN regression gates; the failure message still references the original GREEN-flip target plan so the historical contract is documented in the test source"

key-files:
  created:
    - "src/vs/goatide/extensions/goatide-bridge/src/canvas/authoring-flow.ts (Plan 20-03; 150 lines; runAddDecisionNodeFlow + RunAddDecisionNodeFlowOptions; multi-step QuickPick chain)"
    - "kernel/src/test/rpc/createDecisionNode.spec.ts (Plan 20-01 stub tracked in Plan 20-02 commit; round-trip persistence)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/kernel/createDecisionNode.test.ts (Plan 20-01; KernelClient regression gate)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-mandate-a.test.ts (Plan 20-01; Mandate A textarea-empty assertion)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-happy-path.test.ts (Plan 20-01; multi-step chain happy path)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/authoring-flow-cta-anchor.test.ts (Plan 20-01; OQ#4 prefilledAnchorPath thread-through)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/dispatchHover-reject-button.test.ts (Plan 20-01; SC#2a button-presence)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/dispatchHover-reject-confirm.test.ts (Plan 20-01; SC#2c click+confirm wiring)"
    - ".planning/phases/20-decisionnode-authoring-write-path/20-VERIFICATION.md (Plan 20-05; wave-by-wave evidence + per-SC table + Pitfall audit + flakiness fence)"
    - ".planning/phases/20-decisionnode-authoring-write-path/20-SUMMARY.md (Plan 20-05; this file)"
  modified:
    - "kernel/src/rpc/methods.ts (Plan 20-02; +38 lines CreateDecisionNodeRequest + interfaces)"
    - "kernel/src/rpc/server.ts (Plan 20-02; +56 lines onRequest handler under requireAuth)"
    - "src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts (Plan 20-02; +33 lines bridge mirror wire types)"
    - "src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts (Plan 20-02; +16 lines KernelClient.createDecisionNode method)"
    - "src/vs/goatide/extensions/goatide-bridge/src/extension.ts (Plan 20-03; +19 -7 lines import + command body swap)"
    - "src/vs/goatide/extensions/goatide-bridge/src/save-gate/tier-dispatch.ts (Plan 20-04; +30 -6 lines dispatchHover Step 4 Reject branch)"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/save-gate/mandate-d-destructive-no-hover.test.ts (Plan 20-01; recordRejectionCalls column extension)"
    - "scripts/ci/refuse-deep05-write.sh (Plan 20-01; BANNED array +createDecisionNode 5th entry)"
    - "scripts/test/refuse-deep05-write.meta.sh (Plan 20-01; Phase 3 positive control)"
    - "scripts/test/refuse-llm-in-canvas.meta.sh (Plan 20-01; HOST_CANVAS_DIR + grep_host_canvas widening)"
    - ".planning/REQUIREMENTS.md (Plan 20-05; AUTH-01..04 moved to Closed section + v2.1 Traceability rows updated + Pitfall A canonical AUTH-01 wording reconciled)"
    - ".planning/ROADMAP.md (Plan 20-05; Phase 20 checkbox [x] + Plans 5/5 + Progress Table row + Pitfall A SC#1 reconciled)"
    - ".planning/STATE.md (Plan 20-05; Active phase flipped to 'none (Phase 21 next)' + new Decisions entry + top frontmatter bumped to completed_phases:7)"

key-decisions:
  - "5-plan partition with parallel Wave 2: Plans 20-03 (authoring flow) and 20-04 (Reject button) touch disjoint files (canvas/authoring-flow.ts + extension.ts vs save-gate/tier-dispatch.ts) so they ran in the same wave. Plan 20-05 (Wave 3) depends on both. Total wall-clock: ~2 plans saved vs strictly-sequential."
  - "OQ#1 (recordRejection signature reuse): Reused existing {receipt_id, change_id, note} RPC verbatim. Note literal 'user_post_hoc_reject_benign_hover' distinguishes post-hoc reject from inline-tier Dismiss path. Zero kernel-side changes for AUTH-02."
  - "OQ#2 (new write RPC name): Used createDecisionNode (mirrors RecordContractOverrideRequest naming convention). Added to refuse-deep05-write.sh BANNED array in Wave 0 -- fence-before-surface intact."
  - "OQ#3 (constraint-link picker deferred): Out of v2.1 scope (would enumerate all ConstraintNodes -- slow at scale). DecisionNode authored with body + anchor + optional derived_under_priority only. Constraint linkage deferred to v2.2; bitemporal model permits late edge insertion at any valid_from."
  - "OQ#4 (no CanvasShowPayload schema change): Anchor auto-populated from vscode.window.activeTextEditor.document.uri.fsPath (and opts.prefilledAnchorPath from empty-state CTA). No new anchor_path field on CanvasShowPayload -- zero Zod schema diff."
  - "OQ#5 (QuickPick chain, not WebviewPanel): v2.1 ships QuickPick + InputBox multi-step flow. Mandate A safe by default (no new webview to fence). WebviewPanel form deferred to v2.2."
  - "repo_id rides in provenance.detail, NOT payload.anchor: payload.anchor is the per-file/symbol pointer driving resolveAnchor at query time; repo_id is workspace-level scoping in provenance bookkeeping. Phase 21 XREPO-01 forward-compat default 'primary'."
  - "NO edge write in createDecisionNode handler: kernel handler validates + persists only. No constraint-link edge inserted (OQ#3 deferred). Mandate B no business logic beyond Zod payload validation + provenance attachment."
  - "Mandate A boundary check at handler entry: Even though canvas/authoring-flow.ts enforces showInputBox.value === '' upstream, kernel handler defensively throws on empty/whitespace body. Defense-in-depth -- future regression of bridge fence would be caught at the kernel boundary."
  - "Rationale-first ordering in QuickPick chain: Plan 20-01 happy-path test expected rationale FIRST, optional line SECOND. Initial Plan 20-03 implementation followed Code Example 2 (anchor -> line -> rationale) which made the happy-path test consume the rationale into the optional line prompt. Fixed by reordering -- matches the test contract AND UX principle of required-field-up-front."
  - "Mandate A header comment uses 'language-model' (not 'LLM'): refuse-llm-in-canvas.meta.sh fence is grep-based at file level. Even a comment containing the literal banned token trips the gate. Synonym preserves intent."
  - "Reject precedence + early return: dispatchHover Reject branch placed BEFORE Open-full-receipt with explicit return. User clicking Reject is a decision; preventing fallthrough avoids accidental modal-on-modal stacking."
  - "try/catch scope minimal around recordRejection: Only the RPC call is wrapped. showWarningMessage modal returning undefined is normal user-cancel flow (handled via if (confirmed === 'Reject') predicate, not exception path)."
  - "Pitfall A reconciliation (REQUIREMENTS.md + ROADMAP.md): Canonical AUTH-01 row + ROADMAP Phase 20 SC#1 description edited in-place: 'via proposeEdit + atomicAccept RPCs' -> 'via the new graph.createDecisionNode kernel RPC' + parenthetical noting departure from original ROADMAP wording. Phase 20 research §Pitfall A identified the original wording as technically wrong."
  - "Retroactive RED-stub authoring (Plan 20-01 Tasks 4-6): Because parallel-execution merge ordered Plans 20-02 and 20-04 BEFORE Plan 20-01's bridge stubs, those stubs were authored as IMMEDIATELY GREEN regression gates. TDD philosophy preserved -- the spec still encodes the contract; failure message references original GREEN-flip plan; future refactor removing the surface RED-flips the test."
  - "Mandate D matrix recordRejectionCalls === 0 in every cell: Matrix test simulates dispatchTier once per cell with showInformationMessage returning undefined (default dismissal). Reject branch only fires on explicit user click+confirm, which the matrix doesn't simulate. Destructive cells stay 0 by structural impossibility (dispatchHover only reachable on (silent, false, 'hover'))."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
metrics:
  duration: "Plan 20-01 ~25min + 20-02 ~17min + 20-03 ~9min + 20-04 ~13min + 20-05 ~30min = ~94 min total across 2-3 sessions"
  completed: "2026-05-18"
  tasks_completed: 12  # 6 (20-01) + 2 (20-02) + 2 (20-03) + 1 (20-04) + 2 (20-05; 1 obs + 1 closure)
  files_changed: 18    # See key-files
  commits_phase: 16    # 14 task/feat/test/docs commits across Plans 20-01..04 + 1 plan-close (20-05) + plan-meta docs commits
---

# Phase 20: DecisionNode Authoring Write Path -- Summary

**One-liner:** Users author DecisionNodes via the command palette or empty-state CTA through a multi-step QuickPick chain backed by the new `graph.createDecisionNode` kernel RPC; benign-tier saves gain a post-hoc Reject button wired to `kernel.recordRejection`; Mandate A and B fences widen to cover the new write surface before any code reaches `inspector/`.

---

## What Shipped

### AUTH-01: DecisionNode authoring write path (Plans 20-02 + 20-03)

The v2.0 `goatide.canvas.addDecisionNode` placeholder command (which showed an informational "coming in v2.1" message) is replaced with a real write path. Invoking the command (from the command palette OR the Verification Canvas empty-state CTA) launches a multi-step QuickPick chain:

1. **Anchor pick** — auto-populates from `opts.prefilledAnchorPath` (when launched from the empty-state CTA) or `vscode.window.activeTextEditor.document.uri.fsPath`; presents `showQuickPick` only when 2+ anchor candidates exist (single-candidate auto-select).
2. **Rationale input** — `showInputBox` with `value: ''` (Mandate A: never pre-populate from kernel data or language-model output).
3. **Optional line number** — `showInputBox` with `value: ''` and `validateInput` (cancellation short-circuits).
4. **Optional priority confirm** — `showQuickPick` for the optional `derived_under_priority` field.
5. **Final confirm** — `showInformationMessage` summary.
6. **Kernel write** — `kernel.createDecisionNode({ body, anchor, derived_under_priority?, repo_id: 'primary' })`.

The kernel handler (`graph.createDecisionNode` RPC under `requireAuth`) mirrors the `RecordContractOverrideRequest` sibling shape: single-tx `dao.seed` with Mandate A boundary defense (throws on empty/whitespace body) + Zod payload validation + provenance attachment. `repo_id` rides in `provenance.detail` (Phase 21 XREPO-01 forward-compat default `'primary'`). The bridge `KernelClient.createDecisionNode` is a thin transport adapter (single `sendWithTimeout` call).

The `extension.ts` command body wraps `runAddDecisionNodeFlow` in try/catch (Pitfall G): runtime errors surface as `showErrorMessage` instead of throwing into bridge activation. N3 ordering invariant preserved (all `registerCommand` calls precede `maybeAutoOpenWalkthrough`).

**Departure from original ROADMAP wording (Pitfall A):** The original AUTH-01 description called for `atomic write via existing proposeEdit + atomicAccept RPCs`. Phase 20 research §Pitfall A identified this as technically wrong — those RPCs operate on file diffs and create Attempt nodes (not DecisionNodes). The new `graph.createDecisionNode` RPC is the correct primitive. The REQUIREMENTS.md AUTH-01 canonical row and ROADMAP.md Phase 20 SC#1 description were both reconciled in-place by Plan 20-05.

### AUTH-02: Post-hoc Reject button on benign-tier saves (Plans 20-01 + 20-04)

`dispatchHover` Step 4 (the benign-tier post-save status-bar/info-notification path established in Phase 17 POLISH-04) gains a `'Reject'` action button alongside the existing `'Open full receipt'` button. Click `'Reject'` → nested `showWarningMessage('Reject this benign save post-hoc? ...', { modal: true }, 'Reject')` confirmation modal. On confirm: try/catch-wrapped `kernel.recordRejection({ receipt_id, change_id, note: 'user_post_hoc_reject_benign_hover' })`.

The note literal `'user_post_hoc_reject_benign_hover'` (OQ#1+OQ#2 resolution: reuse existing RPC verbatim) distinguishes the post-hoc benign reject path from the inline-tier Dismiss path (which uses free-form `decision.note`). The Reject branch is placed BEFORE Open-full-receipt with explicit early `return` — user clicking Reject is a decision, not a navigation prefix; preventing fallthrough avoids accidental modal-on-modal stacking.

**Mandate D fence preserved:** The Reject button NEVER appears on destructive-tier saves. `dispatchHover` is structurally reachable ONLY on `(tier='silent' AND isDestructive=false AND benignSetting='hover')`. The 4×3 matrix test (`mandate-d-destructive-no-hover.test.ts`) was extended in Plan 20-01 with a `recordRejectionCalls` column; the invariant `recordRejectionCalls === 0` holds in every cell (the matrix doesn't simulate user clicks; Reject reachable only via interactive flow). Pitfall F caller-count fence (`LOCKED_CALLER_COUNT_WAVE1 = 2`) is UNCHANGED: `grep -c "\\bdispatchHover\\b" tier-dispatch.ts` returns 2 (1 declaration line 509 + 1 caller line 322).

### AUTH-03: Mandate A fence widened to host-side canvas/*.ts (Plan 20-01)

`scripts/test/refuse-llm-in-canvas.meta.sh` gains a new `HOST_CANVAS_DIR` (`src/vs/goatide/extensions/goatide-bridge/src/canvas/`) and a `grep_host_canvas` function sibling to the existing `grep_canvas` (which covered only `canvas/webview/`). Phase 1 positive control runs both grep functions; Phase 2 negative control plants two probes (one per scope) and asserts each function catches its corresponding probe. META PASS verified after Pitfall C pre-flight grep confirmed PREFLIGHT CLEAN on existing host files (panel.ts, messages.ts, rpc.ts).

This closes the v2.0 blind spot: the new `canvas/authoring-flow.ts` host file (Plan 20-03) was born under the widened fence and required only a header-comment rephrase (literal `LLM` → `language-model` synonym) to clear the gate.

### AUTH-04: Mandate B fence-before-surface for createDecisionNode (Plan 20-01)

`scripts/ci/refuse-deep05-write.sh` BANNED array gains `createDecisionNode` as the 5th entry (Phase 14 lineage preserved). `scripts/test/refuse-deep05-write.meta.sh` gains a Phase 3 positive-control block with a `_fixture-violation-createDecisionNode.ts` round-trip proving the gate fires when the literal token appears in an `inspector/` file.

`ReadonlyKernelClient` `Pick<>` (Phase 14 DEEP-05) is UNCHANGED across all 5 plans (Pitfall E: never grants write capability to inspector tree; `git diff HEAD~10 -- ...ReadonlyKernelClient.ts` empty). Fence-before-surface holds: the BANNED entry landed in Wave 0 (commit `454080f2eb8`) BEFORE Plan 20-02 introduced the literal in kernel/bridge code (commits `6768e7985d5` + `3e7198ca2bd`).

---

## Requirements Closed

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | 20 -- DecisionNode Authoring Write Path | Closed 2026-05-18 |
| AUTH-02 | 20 -- DecisionNode Authoring Write Path | Closed 2026-05-18 |
| AUTH-03 | 20 -- DecisionNode Authoring Write Path | Closed 2026-05-18 |
| AUTH-04 | 20 -- DecisionNode Authoring Write Path | Closed 2026-05-18 |

---

## Key Decisions

1. **5-plan partition with parallel Wave 2** — Plans 20-03 (authoring flow + command swap) and 20-04 (Reject button) touch disjoint files; they ran in the same wave. Plan 20-05 (this plan) depends on both. ~2 plans of wall-clock saved vs strictly-sequential.

2. **OQ#1: recordRejection signature reuse** — Existing `{receipt_id, change_id, note}` RPC reused verbatim; note literal `'user_post_hoc_reject_benign_hover'` distinguishes the post-hoc path. Zero kernel-side changes for AUTH-02.

3. **OQ#2: new write RPC name = `createDecisionNode`** — Mirrors `RecordContractOverrideRequest` naming. Added to refuse-deep05-write.sh BANNED array in Wave 0 (fence-before-surface).

4. **OQ#3: constraint-link picker deferred to v2.2** — Would enumerate all ConstraintNodes (slow at scale). v2.1 ships with body + anchor + optional priority only. Bitemporal model permits late edge insertion at any valid_from.

5. **OQ#4: no CanvasShowPayload schema change** — Anchor auto-populates from `vscode.window.activeTextEditor.document.uri.fsPath` (and `opts.prefilledAnchorPath` from CTA). Zero Zod schema diff.

6. **OQ#5: QuickPick chain, not WebviewPanel** — Mandate A safe by default; no new webview to fence. WebviewPanel form deferred to v2.2.

7. **Pitfall A reconciliation** — REQUIREMENTS.md canonical AUTH-01 row + ROADMAP.md Phase 20 SC#1 description both edited in-place to replace `proposeEdit + atomicAccept` with `graph.createDecisionNode` plus parenthetical noting the departure from original ROADMAP wording. Documentation now consistent with what actually shipped.

8. **Pitfall G mitigation** — `extension.ts` new command body wraps `runAddDecisionNodeFlow` in try/catch. Top-level import does not throw at activation. Phase 19 SC3b 3-run flakiness fence (3/3 EXIT 0) proves zero impact on walkthrough foreground race.

9. **Mandate B fence-before-surface verified** — BANNED entry landed before the symbol existed (commit `454080f2eb8` precedes `6768e7985d5`/`3e7198ca2bd`). Future contributor adding `createDecisionNode` token to inspector/ trips the gate immediately.

10. **Retroactive RED-stub authoring** — Plan 20-01 Tasks 4-6 authored after Plans 20-02/20-04 landed (parallel-execution merge ordering). Stubs preserve TDD philosophy as immediately-GREEN regression gates; failure messages reference original GREEN-flip target plans.

---

## Test Counts

| Category | Result | Notes |
|----------|--------|-------|
| New GREEN tests | 7 | 1 kernel spec + 1 bridge KernelClient + 3 authoring-flow + 2 dispatchHover Reject |
| Extended GREEN test | 1 | Mandate D matrix gains recordRejectionCalls column (matrix STAYS GREEN throughout) |
| Widened CI gate | 1 | refuse-llm-in-canvas.meta.sh (new HOST_CANVAS_DIR scope) |
| Extended CI meta-test | 1 | refuse-deep05-write.meta.sh (Phase 3 positive control for createDecisionNode) |
| Baseline preserved | All Phase 14-19 tests | 16 pre-existing bridge failures (jsdom HTMLCanvasElement.getContext gap) NOT regressions; same 16 across all 4 Plan 20-0x SUMMARYs |
| Kernel full suite | 409/409 PASS | Including new createDecisionNode.spec.ts |
| Bridge Phase 20 tests | 9/9 PASS | 3 authoring-flow + 1 createDecisionNode + 2 dispatchHover Reject + 3 Mandate D matrix it() |
| Phase 19 SC3b smoke | 13/13 PASS x 3 runs | 3-run flakiness fence: 3/3 EXIT 0 |
| CI gates | 12/13 OK | 1 FAIL (refuse-vs-workbench-edits.sh) is pre-existing FORK-04 issue out-of-scope |
| Hermetic meta-tests | 4/4 META PASS | refuse-deep05-write, refuse-llm-in-canvas, both bridge mirror meta-tests |

---

## v2.1 Milestone Progress

| Phase | Status | Requirements |
|-------|--------|-------------|
| 18 -- E2E Verification Gate | Closed 2026-05-17 | VERIFY-01..05 |
| 19 -- Walkthrough Foregrounding Fix | Closed 2026-05-17 | WALK-01 |
| **20 -- DecisionNode Authoring Write Path** | **Closed 2026-05-18** | **AUTH-01..04** |
| 21 -- Cross-Repo Activation (Single-DB) | Not started | XREPO-01..03 |
| 22 -- Distribution (C1/C2/C3) | Not started (cert-gated) | C1, C2, C3 |

**v2.1 milestone: 3/5 phases complete.**

---

## Next Phase

**Phase 21: Cross-Repo Activation (Single-DB Multi-Repo)** — XREPO-01: existing write RPCs (`proposeEdit`, `atomicAccept`, `recordRejection`) accept optional `repo_id` parameter defaulting to `'primary'` (single-DB model preserved; multi-daemon per-repo deferred to v2.2). XREPO-02: new `WorkspaceRepoState` bridge module enumerates `vscode.workspace.workspaceFolders`, fingerprints each repo via `repo-fingerprint.ts` SHA-256 helper; `tier-dispatch.ts` threads active repo_id onto every write. XREPO-03: real cross-repo edges render in Graph Inspector when a save in repo-A cites a node in repo-B's graph; the dormant `edge[?crossRepo]` Cytoscape selector (Phase 17) fires for the first time.

The new `graph.createDecisionNode` RPC already accepts `repo_id` via `provenance.detail` (forward-compat default `'primary'`) — Phase 21 will activate cross-repo writes against the same primitive.

---

_Closed: 2026-05-18_

## Self-Check: PASSED

Verification of claims in this SUMMARY (executed at SUMMARY-time):

- `.planning/phases/20-decisionnode-authoring-write-path/20-VERIFICATION.md` — FOUND (authored by Plan 20-05 Task 2)
- `.planning/phases/20-decisionnode-authoring-write-path/20-SUMMARY.md` — FOUND (this file)
- `.planning/REQUIREMENTS.md` — Phase 20 closure section present after Phase 19; v2.1 Traceability AUTH-01..04 marked `Closed 2026-05-18 (<sha>)`
- `.planning/ROADMAP.md` — Phase 20 entry `[x] ✓ Closed`; Plans 5/5; Progress Table row `Complete | 2026-05-18`; SC#1 reconciled
- `.planning/STATE.md` — Active phase `none (Phase 21 next)`; new Decisions entry at top; frontmatter `completed_phases: 7`
- All 14 task/feat/test/docs commits referenced in Closure Commits table visible in `git log --oneline -30`
- Full kernel suite: 409/409 PASS confirmed at Task 1 verification
- Bridge Phase 20-filtered tests: 9/9 PASS confirmed at Task 1 verification
- Phase 19 SC3b 3-run flakiness fence: 3/3 EXIT 0 confirmed at Task 1 verification
- 12/13 CI gates OK; 4/4 meta-tests META PASS; bridge tsc + kernel tsc + project compile-check-ts-native GREEN
- Pitfall E: `git diff HEAD~10 -- ...ReadonlyKernelClient.ts` empty (byte-identical)
- Pitfall F: `grep -c "\\bdispatchHover\\b" tier-dispatch.ts` == 2
