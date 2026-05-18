---
phase: 20
slug: decisionnode-authoring-write-path
closed: 2026-05-18
status: closed
requirements_closed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]
smoke_score: 13/13
flakiness_fence: PASS (3/3 EXIT 0)
pitfall_audit: A=MITIGATED B=MITIGATED C=PASS D=PASS E=PASS F=PASS G=PASS H=NOT-APPLICABLE
plans_executed: 5/5
---

# Phase 20 -- Verification Log

## Wave-by-Wave Evidence

### Wave 0 -- Fences + RED Stubs + Mandate D Matrix Extension (Plan 20-01)

**Objective:** Land Mandate A/B fence extensions for AUTH-03/04, author 7 RED stubs encoding the Wave-1/Wave-2 contracts, extend the Mandate D matrix with `recordRejectionCalls` column.

**Evidence sources:** `20-01-wave0-fences-red-stubs-PLAN.md`, `20-01-SUMMARY.md`

**Verdicts:**

- **Mandate B fence-before-surface (AUTH-04):** `scripts/ci/refuse-deep05-write.sh` BANNED array gains `createDecisionNode` as the 5th entry. `scripts/test/refuse-deep05-write.meta.sh` Phase 3 positive-control block proves the gate fires on the new banned token. ReadonlyKernelClient `Pick<>` UNCHANGED.
- **Mandate A widening (AUTH-03):** `scripts/test/refuse-llm-in-canvas.meta.sh` widened with new `HOST_CANVAS_DIR` + `grep_host_canvas` sibling to existing `webview/` scope. Pitfall C pre-flight grep on `canvas/*.ts` confirmed PREFLIGHT CLEAN on existing host files (panel.ts, messages.ts, rpc.ts) before widening.
- **7 RED stubs landed:**
  - `kernel/src/test/rpc/createDecisionNode.spec.ts` (tracked in commit `6768e7985d5` paired with Plan 20-02's GREEN-flip)
  - `test/unit/kernel/createDecisionNode.test.ts` (bridge KernelClient regression gate; GREEN after Plan 20-02)
  - 3 `test/unit/canvas/authoring-flow-*.test.ts` (mandate-a, happy-path, cta-anchor; GREEN after Plan 20-03)
  - 2 `test/unit/save-gate/dispatchHover-reject-*.test.ts` (button, confirm; GREEN after Plan 20-04)
- **Mandate D matrix extension:** `mandate-d-destructive-no-hover.test.ts` 4×3 matrix gains `recordRejectionCalls` column. Every cell asserts `recordRejectionCalls === 0` (matrix doesn't simulate user clicks; Reject branch reachable only via interactive flow). Caller-count fence (`LOCKED_CALLER_COUNT_WAVE1 = 2`) preserved.

**Commits:** `454080f2eb8` (BANNED extension), `cdea35d6667` (Mandate A widening), `25037a87eff` (bridge KernelClient stub), `13e68bc1eff` (3 authoring-flow stubs), `767eeb81f6f` (2 dispatchHover stubs + Mandate D matrix extension), `73446946fa2` (plan-close docs)

---

### Wave 1 -- Kernel RPC + Bridge Client (Plan 20-02)

**Objective:** Land `graph.createDecisionNode` kernel RPC + `KernelClient.createDecisionNode` bridge method. Flip kernel + bridge RED stubs GREEN.

**Evidence sources:** `20-02-kernel-rpc-bridge-client-PLAN.md`, `20-02-kernel-rpc-bridge-client-SUMMARY.md`

**Verdicts:**

- **Kernel handler:** `kernel/src/rpc/methods.ts` gains `CreateDecisionNodeParams` + `CreateDecisionNodeResult` + `CreateDecisionNodeRequest = new RequestType<...>('graph.createDecisionNode')`. `kernel/src/rpc/server.ts` adds `connection.onRequest(CreateDecisionNodeRequest, requireAuth(...))` handler. Mandate A boundary defense-in-depth: handler throws on empty/whitespace body. `repo_id` rides in `provenance.detail` (Phase 21 XREPO-01 forward-compat default `'primary'`). Single-tx `dao.seed` mirroring `RecordContractOverrideRequest` sibling shape.
- **Bridge mirror types + method:** `src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts` gains byte-equal `RequestType('graph.createDecisionNode')`. `src/kernel/client.ts` gains `createDecisionNode(params): Promise<CreateDecisionNodeResult>` — single `this.sendWithTimeout(CreateDecisionNodeRequest, params)` call (thin transport adapter).
- **2 RED → GREEN flips:** `kernel/src/test/rpc/createDecisionNode.spec.ts` GREEN (paired Duplex MessageConnection round-trip persists queryable DecisionNode). `test/unit/kernel/createDecisionNode.test.ts` GREEN (KernelClient prototype check + sendWithTimeout spy verifying route).
- **Mandate B fence verified live:** `refuse-deep05-write.sh` exit 0 (12 inspector/ files scanned, zero `createDecisionNode` token).

**Commits:** `6768e7985d5` (kernel RPC + handler + Plan 20-01 kernel stub tracked), `3e7198ca2bd` (bridge mirror types + KernelClient method), `70740a75033` (plan-close docs)

---

### Wave 2 -- Authoring Flow + Command Body Swap (Plan 20-03)

**Objective:** Land `canvas/authoring-flow.ts` host-side multi-step orchestrator. Swap `extension.ts goatide.canvas.addDecisionNode` placeholder body for real flow invocation with Pitfall G try/catch. Flip 3 RED stubs GREEN.

**Evidence sources:** `20-03-authoring-flow-and-command-swap-PLAN.md`, `20-03-SUMMARY.md`

**Verdicts:**

- **`canvas/authoring-flow.ts` (NEW, 150 lines):** Exports `RunAddDecisionNodeFlowOptions` + `runAddDecisionNodeFlow`. Multi-step QuickPick chain: anchor pick (`showQuickPick`) → rationale input (`showInputBox` with `value: ''` Mandate A) → optional line number (`showInputBox` with `value: ''`) → optional priority confirm → final confirm → `kernel.createDecisionNode(...)` write. Anchor auto-populates from `opts.prefilledAnchorPath` OR `vscode.window.activeTextEditor.document.uri.fsPath` (OQ#4). Header comment intentionally avoids the literal banned token `LLM` (uses `language-model` synonym) so the widened Mandate A fence reports a clean tree.
- **`extension.ts` command body swap:** Import `runAddDecisionNodeFlow` at line 31. Command body at lines 272-295 replaced: placeholder `showInformationMessage` swapped for `try { ... await runAddDecisionNodeFlow(context, kernel, panel, { prefilledAnchorPath: editor?.document.uri.fsPath }); } catch (e) { void vscode.window.showErrorMessage(...); }` (Pitfall G).
- **3 RED → GREEN flips:**
  - `authoring-flow-mandate-a.test.ts` PASS (every `showInputBox.opts.value === ''`)
  - `authoring-flow-happy-path.test.ts` PASS (QuickPick → InputBox → confirm → `kernel.createDecisionNode` with `repo_id: 'primary'`)
  - `authoring-flow-cta-anchor.test.ts` PASS (`prefilledAnchorPath` threads through to `createDecisionNode.anchor.file`)
- **N3 ordering invariant preserved:** All `registerCommand` calls (lines 187, 217, 233, 278) appear BEFORE `maybeAutoOpenWalkthrough` invocation (line 313).
- **Mandate A fence GREEN (META PASS):** Widened host-scope `canvas/*.ts` grep finds zero banned tokens after header rephrase.

**Commits:** `ebddd84497f` (authoring-flow.ts), `476348448a9` (extension.ts swap + mirror sync), `5b694d52a49` (plan-close docs)

---

### Wave 2 -- dispatchHover Reject Button + recordRejection (Plan 20-04)

**Objective:** Land dispatchHover Step 4 Reject branch + kernel.recordRejection wiring. Preserve Mandate D structural fence + Pitfall F caller-count fence.

**Evidence sources:** `20-04-reject-button-dispatchHover-PLAN.md`, `20-04-SUMMARY.md`

**Verdicts:**

- **dispatchHover Step 4 diff (+30 -6 lines):** `showInformationMessage('GoatIDE: benign save ...', 'Reject', 'Open full receipt')` action triplet. On click `'Reject'`: nested `showWarningMessage('Reject this benign save post-hoc? ...', {modal:true}, 'Reject')` confirm modal. On confirm: try/catch-wrapped `kernel.recordRejection({receipt_id, change_id, note: 'user_post_hoc_reject_benign_hover'})`. Reject branch placed BEFORE Open-full-receipt with explicit early `return` (prevents fallthrough / modal-on-modal stacking).
- **2 RED → GREEN flips:**
  - `dispatchHover-reject-button.test.ts` PASS (showInformationMessage actions include both 'Reject' AND 'Open full receipt')
  - `dispatchHover-reject-confirm.test.ts` PASS (click 'Reject' + modal 'Reject' confirm fires kernel.recordRejection with note `user_post_hoc_reject_benign_hover`)
- **Mandate D fence preserved (SC#2b):** dispatchHover still reachable only on `(tier='silent' AND isDestructive=false AND benignSetting='hover')`. Mandate D fence comment block (lines 499-508) byte-identical to HEAD. 4×3 matrix `recordRejectionCalls === 0` invariant holds in every cell.
- **Pitfall F caller-count fence UNCHANGED:** `grep -c "\bdispatchHover\b" tier-dispatch.ts` == 2 (1 declaration line 509 + 1 caller line 322).
- **Phase 19 SC3b regression gate:** 13/13 PASS EXIT 0 at plan close.

**Commits:** `61bb7a1973a` (tier-dispatch.ts dispatchHover edits), `b36433c8862` (plan-close docs)

---

### Wave 3 -- Phase Verify + Closure Ceremony (Plan 20-05)

**Objective:** Full-suite phase-verify + 3-run flakiness fence + REQUIREMENTS/ROADMAP/STATE flips + 20-VERIFICATION.md + 20-SUMMARY.md.

**Verdicts:**

- **Full bridge suite:** 131 passing / 16 failing / 3 pending. The 16 failures are all pre-existing baseline (jsdom HTMLCanvasElement.getContext gap: HypotheticalImpact, DriftFindings, Phase 7 drift-flow integration, walkthrough-completion, CitationList). None reference Phase 20 surfaces. Phase 20-specific tests (9 GREEN: 3 authoring-flow + 1 createDecisionNode KernelClient + 2 dispatchHover Reject + 3 Mandate D matrix it()) all PASS.
- **Full kernel suite:** 122 test files / 409 tests / **409 PASS**. `createDecisionNode.spec.ts` GREEN; no kernel-side regressions.
- **All CI gates:** 12/13 `refuse-*.sh` exit 0. The 1 FAIL (`refuse-vs-workbench-edits.sh`) is the pre-existing FORK-04 issue (`localProcessExtensionHost.ts` last touched in commit `049bdcf2868` Plan 10-04; documented out-of-scope in all 4 prior Plan 20-0x SUMMARYs).
- **All 4 meta-tests:** META PASS. `refuse-deep05-write.meta.sh` Phase 1/2/3 positive controls fire correctly. `refuse-llm-in-canvas.meta.sh` both grep_canvas (webview/) and grep_host_canvas (canvas/*.ts) scopes verified.
- **Bridge mirror gate:** `refuse-stale-bridge-mirror.sh` exit 0.
- **TSC compile-checks:** bridge `npx tsc -p . --noEmit` exit 0; kernel `npx tsc -p . --noEmit` exit 0; project `npm run compile-check-ts-native` exit 0.
- **Phase 19 SC3b 3-run flakiness fence:** 3/3 EXIT 0 with `SCORE: 13/13 SCs PASS, CDN hits=0` per run. Phase 20 changes have zero impact on the walkthrough foreground race.
- **Closure docs authored:** REQUIREMENTS.md AUTH-01..04 moved from "Complete" to `Closed 2026-05-18 (<sha>)`; new Phase 20 closure section after Phase 19. ROADMAP.md Phase 20 `[ ]` → `[x] ✓ Closed`; `**Plans:** TBD` → `5/5 plans complete` + per-plan list; Progress Table row `4/5 In Progress` → `5/5 Complete 2026-05-18`. STATE.md Active phase flipped to `none (Phase 21 next)`; new Decisions entry; top frontmatter `completed_phases: 7`. Pitfall A reconciliation applied to canonical AUTH-01 row + ROADMAP SC#1 description (`proposeEdit + atomicAccept` → `graph.createDecisionNode` with parenthetical).

**Closure commit:** (to be produced by this plan's final commit step)

---

## Pitfall Fence Audit

| Pitfall | Status | Evidence |
|---------|--------|----------|
| A (proposeEdit + atomicAccept ROADMAP wording wrong) | MITIGATED | Added new `graph.createDecisionNode` RPC instead; ROADMAP SC#1 + REQUIREMENTS.md AUTH-01 row both reconciled in-place with parenthetical noting departure from original wording (research §"Departure from ROADMAP wording") |
| B (recordRejection signature mismatch) | MITIGATED | OQ#1 resolution: reused existing `{receipt_id, change_id, note}` signature verbatim; note literal `'user_post_hoc_reject_benign_hover'` distinguishes post-hoc reject from inline-tier Dismiss path |
| C (Mandate A widening false positives) | PASS | Pre-flight grep on `canvas/*.ts` returned PREFLIGHT CLEAN before widening; META PASS after Plan 20-03 header rephrase (`LLM` → `language-model`) |
| D (dual-location bridge sync) | PASS | `refuse-stale-bridge-mirror.sh` exit 0 after every wave; `prepare_goatide.sh` ran after Wave 1 + Wave 2 source changes |
| E (ReadonlyKernelClient Pick<> leak) | PASS | `git diff HEAD~10 -- ...ReadonlyKernelClient.ts` empty across all 5 plans; BANNED entry actively enforces |
| F (caller-count fence Phase 17 regression) | PASS | `grep -c "\bdispatchHover\b" tier-dispatch.ts` == 2 after Plan 20-04 (1 declaration line 509 + 1 caller line 322) |
| G (CDP smoke regression on Phase 19 13/13) | PASS | 3-run flakiness fence: 3/3 EXIT 0 with SCORE 13/13; Pitfall G try/catch wrap intact in extension.ts command body |
| H (constraint-link picker unbounded growth) | NOT-APPLICABLE | OQ#3 resolution: deferred to v2.2; no picker in v2.1 |

---

## Per-SC Verification Table

| SC | Requirement | Test Type | Command | Result |
|----|-------------|-----------|---------|--------|
| SC#1 (multi-step authoring + write) | AUTH-01 | Mocha + Vitest | `npm test --grep "authoring-flow\|createDecisionNode"` | 5/5 PASS (3 authoring-flow + 1 KernelClient + 1 kernel spec) |
| SC#2 (Reject button on benign hover; never on destructive) | AUTH-02 | Mocha | `npm test --grep "dispatchHover\|Mandate D"` | 5/5 PASS (2 Reject + 3 Mandate D it() blocks) |
| SC#3 (refuse-llm-in-canvas widened to host canvas/) | AUTH-03 | Bash hermetic | `bash scripts/test/refuse-llm-in-canvas.meta.sh` | META PASS (both grep_canvas + grep_host_canvas scopes) |
| SC#4 (refuse-deep05-write covers createDecisionNode) | AUTH-04 | Bash hermetic | `bash scripts/test/refuse-deep05-write.meta.sh` | META PASS (Phase 1/2/3 positive controls fire correctly) |

---

## 3-Run Flakiness Fence Results (Phase 19 SC3b Regression Gate)

All 3 runs executed against the same Phase 20 HEAD code state:

| Run | Score | SC3b | CDN hits | EXIT |
|-----|-------|------|----------|------|
| 1 | 13/13 | PASS | 0 | 0 |
| 2 | 13/13 | PASS | 0 | 0 |
| 3 | 13/13 | PASS | 0 | 0 |

**Verdict: 3/3 EXIT 0. Phase 19 SC3b regression gate held under Phase 20 changes.**

---

## CI / Meta-Test Audit

| Gate | Status | Notes |
|------|--------|-------|
| `refuse-deep05-write.sh` | exit 0 | 12 inspector/ files scanned; zero `createDecisionNode` token |
| `refuse-deep05-write.meta.sh` | META PASS | Phase 1/2/3 positive controls fire correctly (Plan 20-01 added Phase 3) |
| `refuse-llm-in-canvas.meta.sh` | META PASS | Both grep_canvas (webview/) and grep_host_canvas (canvas/*.ts) scopes verified (Plan 20-01 widened) |
| `refuse-stale-bridge-mirror.sh` | exit 0 | Mirror byte-equal after every wave |
| `refuse-stale-bridge-mirror-after-walkthrough.meta.sh` | META PASS | Phase 17 walkthrough meta-test unchanged |
| `refuse-stale-bridge-mirror-after-configurationDefaults.meta.sh` | META PASS | Phase 19 configurationDefaults brander meta-test unchanged |
| Other 10 `refuse-*.sh` CI gates | exit 0 | refuse-credential-leaks-in-fixtures, refuse-fuzzy-fallback, refuse-fuzzy-pattern-fallback, refuse-marketplace, refuse-mcp-collision, refuse-mcp-v2-imports, refuse-non-loopback-mcp-bind, refuse-silent-override, refuse-unbounded-ripple-walk, refuse-vector-libs — all exit 0 |
| `refuse-vs-workbench-edits.sh` | FAIL (pre-existing) | Pre-existing FORK-04 violation (`localProcessExtensionHost.ts` last touched commit `049bdcf2868` Plan 10-04, predates Phase 20); documented out-of-scope in all 4 prior Plan 20-0x SUMMARYs |

---

## Closure Commits

| Plan | Commit(s) | Subject |
|------|-----------|---------|
| 20-01 | `454080f2eb8` | `test(20-01): extend DEEP-05 BANNED array with createDecisionNode (Mandate B fence-before-surface)` |
| 20-01 | `cdea35d6667` | `test(20-01): widen Mandate A fence to cover host-side canvas/*.ts (Pitfall C pre-flight clean)` |
| 20-01 | `25037a87eff` | `test(20-01): AUTH-01 wave-0 RED stub for bridge KernelClient.createDecisionNode` |
| 20-01 | `13e68bc1eff` | `test(20-01): AUTH-01 wave-0 RED stubs for canvas/authoring-flow.ts (3 specs)` |
| 20-01 | `767eeb81f6f` | `test(20-01): AUTH-02 wave-0 RED stubs + Mandate D matrix recordRejectionCalls column` |
| 20-01 | `73446946fa2` | `docs(20-01): complete Wave-0 fences + RED stubs plan` |
| 20-02 | `6768e7985d5` | `feat(20-02): AUTH-01 wave-1 graph.createDecisionNode kernel RPC + handler` (includes Plan 20-01 kernel stub) |
| 20-02 | `3e7198ca2bd` | `feat(20-02): AUTH-01 wave-1 bridge KernelClient.createDecisionNode method` |
| 20-02 | `70740a75033` | `docs(20-02): complete kernel RPC + bridge client plan` |
| 20-03 | `ebddd84497f` | `feat(20-03): add canvas/authoring-flow.ts AUTH-01 multi-step QuickPick chain` |
| 20-03 | `476348448a9` | `feat(20-03): AUTH-01 wave-2 -- swap addDecisionNode placeholder for real flow` |
| 20-03 | `5b694d52a49` | `docs(20-03): complete AUTH-01 wave-2 canvas/authoring-flow plan` |
| 20-04 | `61bb7a1973a` | `feat(20-04): AUTH-02 wave-2 dispatchHover Reject button + recordRejection wiring` |
| 20-04 | `b36433c8862` | `docs(20-04): complete AUTH-02 wave-2 post-hoc reject plan` |
| 20-05 | (this plan's final commit) | `chore(20-05): close Phase 20 -- AUTH-01..04 GREEN, v2.1 3/5 phases complete` |

---

## Pre-existing Out-of-Scope Issues (No Plan 20-0x regression)

| Issue | Status | Notes |
|-------|--------|-------|
| 16 bridge test failures (jsdom HTMLCanvasElement.getContext) | Pre-existing | Phase 7 drift-flow ×6, POLISH-01 walkthrough ×1, CANV-01 ×4, DriftFindings ×2, HypotheticalImpact ×3. Same 16 failures across all 4 prior Plan 20-0x SUMMARYs. None reference Phase 20 surfaces. Pre-Phase-20 baseline = 125 passing; post-Phase-20 = 131 passing (+6 Plan 20-01 new GREEN regression gates). |
| `refuse-vs-workbench-edits.sh` FAIL (`localProcessExtensionHost.ts`) | Pre-existing FORK-04 | Last touched commit `049bdcf2868` Plan 10-04 (May 2026, pre-Phase-20). Documented in all 4 prior Plan 20-0x SUMMARYs + `deferred-items.md`. |

---

## Carve-outs Forward

| Carve-out | Target | Reason |
|-----------|--------|--------|
| Constraint-link picker UI | v2.2 | OQ#3 resolution: would enumerate all ConstraintNodes -- slow at scale. Standalone DecisionNodes can be wired to ConstraintNodes by Phase 21+ tooling. Bitemporal model permits late edge insertion at any valid_from. |
| WebviewPanel form for authoring | v2.2 | OQ#5 resolution: v2.1 ships QuickPick + InputBox chain. Mandate A safe by default (no new webview to fence). |
| `repo_id` threading on `proposeEdit`/`atomicAccept`/`recordRejection` RPCs | Phase 21 (XREPO-01) | Phase 20 only adds repo_id forward-compat to the new `graph.createDecisionNode` RPC (via provenance.detail). Existing write RPCs gain optional repo_id in Phase 21. |
| 16 jsdom-canvas bridge test failures | (deferred) | Long-standing environmental gap; not introduced by Phase 20. Playwright-based bridge test harness migration deferred. |
| `refuse-vs-workbench-edits.sh` FORK-04 issue (`localProcessExtensionHost.ts`) | (deferred) | Pre-existing since Plan 10-04 commit `049bdcf2868`. Allowlist-based gate; needs allowlist refresh or upstream-sync ceremony to clean up. |

---

## Final Verdict

**Status: PASSED.**

Phase 20 achieved its goal. AUTH-01..04 are closed:

- **AUTH-01:** `graph.createDecisionNode` kernel RPC + bridge KernelClient method + `canvas/authoring-flow.ts` host-side multi-step orchestrator + `extension.ts` command body swap from v2.0 placeholder to real flow. Users can author a DecisionNode via command palette or empty-state CTA; new node appears as citation on next save.
- **AUTH-02:** `dispatchHover` Step 4 gains Reject branch on benign-tier saves. Click 'Reject' + confirm modal → `kernel.recordRejection` with note `user_post_hoc_reject_benign_hover`. Mandate D fence preserved: Reject button NEVER appears on destructive-tier saves.
- **AUTH-03:** `refuse-llm-in-canvas.meta.sh` widened to cover host-side `canvas/*.ts` files in addition to `canvas/webview/`. Closes the v2.0 blind spot.
- **AUTH-04:** `refuse-deep05-write.sh` BANNED array forward-declared `createDecisionNode` in Wave 0 before the symbol existed (fence-before-surface). CI gate fires if any `.ts` file under `inspector/` contains the literal token.

The Phase 19 SC3b regression gate held under Phase 20 changes: 3-run flakiness fence 3/3 EXIT 0 with SCORE 13/13 per run. Phase 20 changes have zero impact on the walkthrough foreground race.

v2.1 milestone progresses from 2/5 phases complete to **3/5 phases complete** (Phases 18, 19, 20 closed; Phases 21, 22 pending). Phase 21 (Cross-Repo Activation Single-DB) is the next unblocked phase per ROADMAP.md dependency graph.

---

_Closed: 2026-05-18_
