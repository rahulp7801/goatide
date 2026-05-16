---
phase: 17-cross-repo-ui-polish
plan: phase
subsystem: ui + kernel-wire-schema
tags: [vscode-extension, cross-repo, walkthrough, save-gate, empty-state, hover-dispatch, cytoscape, repo_id, mandate-a, mandate-d, v2.0-closure]

# Dependency graph
requires:
  - phase: 15-graph-inspector-panel
    provides: GraphInspectorPanel singleton + webview (App.tsx, Graph.tsx, palette.ts) — POLISH-01 walkthrough step 5 references it; DEEP-06 phase-B extends it
  - phase: 16-ripple-cross-repo-migration
    provides: Migration 0008 repo_id columns + queryByRepo DAO + repo-fingerprint.ts — DEEP-06 phase-B inherits; POLISH-02 must ship before POLISH-04 (benign setting governs hover)

provides:
  - Phase 17 closes the v2.0 milestone (10/10 requirements DEEP-01..06 + POLISH-01..04)
  - DEEP-06 phase-B: goatide.openCrossRepoGraph command + graceful degradation + cross-repo edge styling (Cytoscape dashed amber-400) + kernel wire-schema repo_id projection
  - POLISH-01: contributes.walkthroughs (5 steps) + registerWalkthroughCompletion + maybeAutoOpenWalkthrough + N3 ordering invariant
  - POLISH-02: contributes.configuration 3 saveGate.* resource-scoped native dropdowns + resource-scoped getConfiguration at dispatchTier entry
  - POLISH-03: CitationList.tsx empty-state (icon + BYTE-EXACT 'No rationale recorded yet' + CTA) + Mandate A structural fence
  - POLISH-04: dispatchHover private function (status-bar + 4s auto-dismiss + 'Open full receipt' fallback) + Mandate D byte-identity matrix

affects:
  - v2.1 milestone: C1/C2/C3 distribution + multi-daemon cross-repo writes + DecisionNode authoring + walkthrough foregrounding

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 TDD: 6 RED test files authored in Plan 17-01; GREEN-flipped across Plans 17-02/03/04. Nyquist Dim 8d invariant: no new test files in downstream waves."
    - "Dual-real-body Wave 0: walkthrough-completion.ts + workspace-repos.ts ship REAL bodies in Wave 0 (tiny ~50 lines each); their tests GREEN-flip at Wave-0 close."
    - "ESM namespace immutability injection: __setCanvasModuleForTests + __resetCanvasModuleForTests pattern for dynamic-import module mock control (canvas-module.ts). Follows __resetDriftLockCacheForTests precedent."
    - "N3 ordering invariant: all registerCommand calls must precede any fire-and-forget async activation call (maybeAutoOpenWalkthrough). Documents with inline comment."
    - "onClick arrow wrapper: onClick={() => prop?.()} to discard React synthetic event before forwarding to callback (Wave-0 test asserts args.length === 0)."
    - "Drizzle materialize() Pitfall D pattern: always add new columns explicitly to field-enumeration materializer or they are silently dropped even if present in SQLite schema."
    - "mocha dual-use command registration: extract handler to standalone module (cross-repo-command.ts) + pre-register in test/setup/register-commands.ts mocha file: entry so mocha can test without activate()."
    - "Hermetic meta-test pattern: refuse-llm-in-canvas.meta.sh (Mandate A) + refuse-stale-bridge-mirror-after-walkthrough.meta.sh (Pitfall A defense) — 2 new meta-tests; 5 total for Phase 17."

key-files:
  created:
    - src/vs/goatide/extensions/goatide-bridge/src/onboarding/walkthrough-completion.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/workspace-repos.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/cross-repo-command.ts
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
    - src/vs/goatide/extensions/goatide-bridge/test/setup/register-commands.ts
    - scripts/test/refuse-llm-in-canvas.meta.sh
    - scripts/test/refuse-stale-bridge-mirror-after-walkthrough.meta.sh
    - kernel/src/test/graph/dao-repo-id.spec.ts
    - kernel/src/test/rpc/queryGraphSnapshot-repo-id.spec.ts
    - .planning/phases/17-cross-repo-ui-polish/17-VERIFICATION.md
  modified:
    - src/vs/goatide/extensions/goatide-bridge/package.json
    - src/vs/goatide/extensions/goatide-bridge/src/extension.ts
    - src/vs/goatide/extensions/goatide-bridge/src/save-gate/tier-dispatch.ts
    - src/vs/goatide/extensions/goatide-bridge/src/save-gate/canvas-module.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/CitationList.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/App.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/styles.css
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/rpc.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/panel.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/messages.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/kernelRowToCyElement.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/edgeRowToCyElement.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/wireToInspectorRow.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/Graph.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/palette.ts
    - src/vs/goatide/extensions/goatide-bridge/src/inspector/panel.ts
    - src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts
    - src/vs/goatide/extensions/goatide-bridge/test/setup/vscode-stub.ts
    - src/vs/goatide/extensions/goatide-bridge/test/setup/.mocharc.cjs
    - extensions/goatide-bridge/package.json
    - extensions/goatide-bridge/media/walkthrough/step1-canvas.md
    - extensions/goatide-bridge/media/walkthrough/step2-receipt.md
    - extensions/goatide-bridge/media/walkthrough/step3-intentdrift.md
    - extensions/goatide-bridge/media/walkthrough/step4-settings.md
    - extensions/goatide-bridge/media/walkthrough/step5-inspector.md
    - scripts/prepare_goatide.sh
    - scripts/ci/refuse-stale-bridge-mirror.sh
    - kernel/src/graph/dao.ts
    - kernel/src/rpc/methods.ts
    - kernel/src/rpc/server.ts

key-decisions:
  - "Single-DB cross-repo deployment model (Open Decision §1 lock): all v2.0 nodes carry repo_id='primary'. Multi-daemon orchestration for cross-repo writes deferred to v2.1. Cross-repo edge Cytoscape selector is infrastructure-ready but dormant in v2.0."
  - "Walkthrough auto-open without timeout (Open Decision §2): maybeAutoOpenWalkthrough fires as fire-and-forget at activate(). N3 ordering invariant: registerCommand calls precede this."
  - "Status-bar over hover provider for POLISH-04 (Open Decision §3): vscode.window.setStatusBarMessage() (4s auto-dismiss) + showInformationMessage fallback. VS Code hover providers require cursor proximity which doesn't work for background saves."
  - "Placeholder addDecisionNode CTA via showInformationMessage (Open Decision §4): goatide.canvas.addDecisionNode shows v2.1 informational message. No graph write path."
  - "refuse-llm-in-canvas.meta.sh structural Mandate A fence (Open Decision §5): permanent CI fence for canvas/ LLM import prohibition."
  - "Markdown-only walkthrough media (Open Decision §6): contributes.walkthroughs.steps[].media.markdown field; no binary media assets."
  - "Drizzle materialize() Pitfall D: always add new columns explicitly to field-enumeration materializer (dao.ts + queryEdgesAsOf mapper). Rule 1 auto-fix in Plan 17-04."
  - "ESM namespace immutability: __setCanvasModuleForTests injection pattern for canvas-module.ts dynamic-import mock control. Rule 1 auto-fix in Plan 17-02."
  - "Walkthrough foregrounding deferred to v2.1: SC3b (VS Code foregrounding behavior) is a polish item. v2.0 ships with walkthrough registered + visible in DOM."

# Metrics
duration: ~358min across 4 plans (45min Plan 17-01 + 90min Plan 17-02 + 13min Plan 17-03 + 210min Plan 17-04) + phase verify
completed: 2026-05-16
---

# Phase 17 — Cross-Repo UI + Polish Cluster Summary

**Phase 17 closes the v2.0 milestone: DEEP-06 phase-B cross-repo inspector command + repo_id wire-schema projection + POLISH-01..04 onboarding/settings/empty-state/hover — kernel 408/408 PASS, bridge 122 passing (0 new failures), 5/5 CI gates OK, 5/5 meta-tests META PASS, SC#5 5/5, autonomous CDP smoke 10/12 SCs PASS.**

## Performance

- **Duration:** ~6 hours total across 4 feature plans + 1 phase-verify plan
- **Started:** 2026-05-15
- **Completed:** 2026-05-16
- **Plans:** 5 (17-01 Wave 0, 17-02 Wave 1, 17-03 Wave 2, 17-04 Wave 3, 17-05 phase-verify)
- **Files modified:** ~50 (22 created, ~28 modified across kernel + bridge + scripts + extensions mirror)

## Overview

Phase 17 is the final phase of the v2.0 milestone. It ships two major categories of work:

**1. DEEP-06 phase-B — Cross-Repo UI:** The `goatide.openCrossRepoGraph` command enumerates workspace repositories via `workspace.workspaceFolders`, gracefully degrades in single-folder workspaces (info notification), and invokes `GraphInspectorPanel.getOrCreateForCrossRepo` for multi-root workspaces. The Cytoscape stylesheet gains an `edge[?crossRepo]` selector with dashed amber-400 styling. The kernel wire-schema was extended to project `repo_id` from SQLite rows through to bridge Zod schemas. In v2.0, all nodes carry `repo_id='primary'` (single-DB model); the cross-repo edge styling is infrastructure-ready for v2.1 multi-daemon writes.

**2. POLISH-01..04 — User-Facing Polish:**
- POLISH-01: First-run onboarding walkthrough (5 steps) with globalState completion fence (Pitfall 9 mitigation)
- POLISH-02: 3 native dropdown settings (`saveGate.destructive/highImpact/benign`) with resource scope, effective on next save
- POLISH-03: Honest empty state in Verification Canvas ("No rationale recorded yet" + Add DecisionNode CTA) with Mandate A fence
- POLISH-04: Benign-tier compact status-bar hover receipt with "Open full receipt" fallback; Mandate D matrix ensures destructive saves never de-escalate

## Accomplishments by Plan

### Plan 17-01 — Wave 0 Scaffold (commit `792ca9b0dff`..`652dd65d831`)

- 6 RED test files authored with locked case-name strings for Plans 17-02/03/04 `--grep` discovery (Nyquist Dim 8d)
- 2 files GREEN at Wave-0 close: `walkthrough-completion.test.ts` (3/3) + `workspace-repos.test.ts` (4/4) — dual-real-body pattern
- Bridge `package.json` extended with `contributes.walkthroughs` (5 steps, completionEvents step 5) + 3 `saveGate.*` resource-scoped config properties + 3 new commands (`openCrossRepoGraph`, `onboarding.complete`, `canvas.addDecisionNode`)
- Bridge mirror byte-equal; `refuse-stale-bridge-mirror.sh` extended with `diff -r media/walkthrough/` assertion; `prepare_goatide.sh` extended to propagate walkthrough markdown
- 2 new hermetic meta-tests: `refuse-llm-in-canvas.meta.sh` (Mandate A) + `refuse-stale-bridge-mirror-after-walkthrough.meta.sh` (Pitfall A defense)

### Plan 17-02 — Wave 1: POLISH-02 + POLISH-04 (commit `d491a250bdc`)

- `dispatchTier` now reads `getConfiguration('goatide.saveGate', doc.uri)` — resource-scoped at entry; Pitfall E defense: each branch reads only its designated setting
- `dispatchHover` private function: ephemeral status-bar message + 4s auto-dismiss + "Open full receipt" `showInformationMessage` fallback
- Mandate D byte-identity 4x3 matrix: `dispatchHover` routes ONLY when `tier==='silent' AND benignSetting==='hover'`; caller-count fence at 2 (1 declaration + 1 caller)
- `__setCanvasModuleForTests` injection pattern added to `canvas-module.ts` (ESM namespace immutability workaround)
- `vscode-stub.ts` extended: `UriStub` class (instanceof-capable), `EndOfLine`, `Range`, `Position`, `setStatusBarMessage`

### Plan 17-03 — Wave 2: POLISH-01 + POLISH-03 (commits `8dbbf291b97`, `18675414b37`)

- `extension.ts activate()`: N3 ordering invariant — `registerWalkthroughCompletion(context)` + `goatide.canvas.addDecisionNode` registered BEFORE `void maybeAutoOpenWalkthrough(context)` fires
- `CitationList.tsx`: info-circle SVG icon + BYTE-EXACT `'No rationale recorded yet'` heading + body paragraph + "Add DecisionNode" CTA button wired via `onAddDecisionNode` prop
- `canvas.requestAddDecisionNode` message variant: `messages.ts` + `rpc.ts` `postAddDecisionNode()` + `panel.ts` `handleMessage` routing to `goatide.canvas.addDecisionNode` command
- 5 walkthrough markdown files refined from Wave-0 placeholders to publication-quality copy (100-150 words per step)

### Plan 17-04 — Wave 3: DEEP-06 phase-B (commits `dc141c1fffa`, `f7ea6ec5155`, `20d5c62c7fb`)

- Kernel B1 first: `NodeRow` + `EdgeRow` interfaces gain `repo_id`; `materialize()` + `queryEdgesAsOf` mapper explicitly copy `raw.repo_id` (Pitfall D defense)
- Kernel `queryGraphSnapshot` handler projects `repo_id: r.repo_id` (nodes) + `repo_id: e.repo_id` (edges) onto wire
- Bridge end-to-end: `InspectorNodeSnapshotSchema` + `InspectorEdgeSnapshotSchema` gain `repo_id`; `wireToInspectorRow` threads it; `edgeRowToCyElement` computes `crossRepo: src.repo_id !== dst.repo_id`; `PALETTE.crossRepoEdge = '#fbbf24'`; `GRAPHIFY_STYLE` gains `edge[?crossRepo]` dashed selector
- `GraphInspectorPanel.getOrCreateForCrossRepo` static factory (same singleton — Pitfall 2 safe); `pendingCrossRepoRepos` state field threaded via `inspector.ready` dispatch
- `registerCrossRepoGraphCommand()` extracted to `src/inspector/cross-repo-command.ts` (dual-use: extension.ts + mocha setup); `test/setup/register-commands.ts` mocha `file:` pre-registration
- Risk §5 Phase 15 fixture migration: all 4 affected test files gain `repo_id: 'primary'`

### Plan 17-05 — Phase Verify (commits `7ca87825cce`, this doc commit)

- Full verification battery: kernel 408/408 PASS, bridge 122 passing / 16 pre-existing failures / 0 new failures, 5/5 CI gates OK, 5/5 meta-tests META PASS, SC#5 5/5 PASS, bridge mirror byte-equal
- Rule 1 auto-fix: 3 missing `repo_id` fields on hand-constructed `NodeRow` literals in `dao.queryByAnchor` + `dao.findSuccessor` + `helpers.spec.ts` sampleRow (commit `7ca87825cce`)
- Autonomous CDP smoke (phase17-smoke-cdp.cjs, commits 8c04df2b43b + 4c8dc69f7ab): 10/12 SCs PASS (SC3b walkthrough foregrounding deferred to v2.1)

## Decisions Made

1. **Single-DB cross-repo deployment model (Open Decision §1 lock):** All v2.0 nodes carry `repo_id='primary'`. The cross-repo `edge[?crossRepo]` Cytoscape selector is dormant until v2.1 multi-daemon writes ship. `kernel/src/cli/db-path.ts` NOT modified.
2. **Walkthrough auto-open without timeout (Open Decision §2):** `maybeAutoOpenWalkthrough` fires as fire-and-forget at `activate()` via `workbench.action.openWalkthrough`. N3 ordering invariant documented with inline comment.
3. **Status-bar over hover provider for POLISH-04 (Open Decision §3):** `vscode.window.setStatusBarMessage()` (4s auto-dismiss) is the correct UX for background-save receipts. VS Code hover providers require cursor proximity — incompatible with the save-gate trigger path.
4. **Placeholder addDecisionNode CTA (Open Decision §4):** `goatide.canvas.addDecisionNode` shows `showInformationMessage("GoatIDE: Adding DecisionNode is coming in v2.1...")`. No write path. DecisionNode authoring UI is a v2.1 scope item.
5. **refuse-llm-in-canvas.meta.sh structural Mandate A fence (Open Decision §5):** Permanent CI gate grepping `canvas/**` for forbidden LLM import tokens. Empty-state heading is BYTE-EXACT static literal — no template interpolation.
6. **Markdown-only walkthrough media (Open Decision §6):** `contributes.walkthroughs.steps[].media.markdown` used for all 5 steps. No binary assets needed for v2.0.
7. **Drizzle materialize() Pitfall D:** `materialize(raw)` field enumeration must explicitly copy new columns. Plan 17-04 Rule 1 auto-fix (commit `dc141c1fffa`). Plan 17-05 Rule 1 auto-fix for two additional hand-constructed literal sites (commit `7ca87825cce`).
8. **ESM namespace immutability bypass (canvas-module.ts):** `__setCanvasModuleForTests` injection helper (follows `__resetDriftLockCacheForTests` precedent). Direct property assignment on `import()` result silently fails.
9. **Walkthrough foregrounding deferred to v2.1:** SC3b (VS Code foregrounding behavior — which walkthrough is active on first launch) is a polish item. v2.0 ships with walkthrough registered + visible in Welcome panel DOM but not auto-selected over VS Code default "Setup VS Code" walkthrough.

## Risks Realized (from 17-RESEARCH.md)

| Risk | Outcome |
|------|---------|
| §1 — Deployment model reconciliation | Locked: single-DB + `repo_id='primary'`. Cross-repo writes to v2.1. Multi-daemon orchestration not needed for v2.0 read-only cross-repo stitching. |
| §2 — Mirror drift across waves | No drift. `refuse-stale-bridge-mirror.sh` exit 0 throughout all waves. `prepare_goatide.sh` extended in Wave 0 for canonical future runs. |
| §3 — Destructive enum [block, confirm] only | Locked via Mandate D fence: `saveGate.destructive` enum=[block, confirm] in `package.json`. The 4x3 byte-identity matrix test pins this. |
| §4 — Walkthrough auto-open stealing first-save focus | Mitigated via N3 ordering invariant (register handlers before fire-and-forget). Manual verification (SC9) confirmed walkthrough registered without focus theft. Foregrounding is a v2.1 item. |
| §5 — Phase 15 fixture migration scope | Completed in Plan 17-04 Task 2: all 4 affected test files extended with `repo_id: 'primary'` (edgeRowToCyElement, kernelRowToCyElement, wireToInspectorRow, slider-asof-change). |

## Pitfall Audit (17-RESEARCH.md Pitfalls 9, A-E)

| Pitfall | Mitigation | Status |
|---------|-----------|--------|
| Pitfall 9 — Walkthrough writes WorkspaceConfiguration instead of globalState | `walkthrough-completion.ts` uses `context.globalState.update` exclusively. Tests 2/3 + 3/3 assert the globalState path. No `WorkspaceConfiguration.update` call. | VERIFIED |
| Pitfall A — Bridge mirror stale after walkthrough media additions | `refuse-stale-bridge-mirror.sh` extended with `diff -r media/walkthrough/`; `refuse-stale-bridge-mirror-after-walkthrough.meta.sh` META PASS | VERIFIED |
| Pitfall B — LLM string feeds empty-state rationale block | `refuse-llm-in-canvas.meta.sh` META PASS; `CitationList.tsx` heading is BYTE-EXACT static literal `'No rationale recorded yet'` | VERIFIED |
| Pitfall C — dispatchHover registered for destructive tier | `mandate-d-destructive-no-hover.test.ts` 3/3 GREEN; 4x3 matrix snapshot byte-identity | VERIFIED |
| Pitfall D — Drizzle materialize() silently drops new columns | `materialize()` in `dao.ts` explicitly copies `repo_id: raw.repo_id`; `dao-repo-id.spec.ts` sentry GREEN; two additional hand-constructed sites fixed in Plan 17-05 | VERIFIED |
| Pitfall E — Save-gate reads cross-setting | `save-gate-resource-scope.test.ts` 2/2 GREEN; Mandate D cross-reading prohibition comment in `tier-dispatch.ts`; each composite branch reads ONLY its designated setting | VERIFIED |

## Auto-fix Log (all plans)

| Plan | Rule | Description | Commit |
|------|------|-------------|--------|
| 17-01 | Rule 1 - Bug | TypeScript formatter requires `() => { }` (space in empty arrow function bodies) | `792ca9b0dff` |
| 17-01 | Rule 1 - Bug | `refuse-stale-bridge-mirror.sh` had dead code after control-flow restructure | `f2d6b32494e` |
| 17-02 | Rule 3 - Blocking | Wrong relative import path in Wave-0 test files (`../../src/` → `../../../src/`) | `d491a250bdc` |
| 17-02 | Rule 1 - Bug | ESM namespace immutability: `canvasMod['classifyTier'] = ...` silently fails; `__setCanvasModuleForTests` injection added | `d491a250bdc` |
| 17-02 | Rule 2 - Missing | vscode-stub missing `Uri.file`, `EndOfLine`, `setStatusBarMessage`, instanceof support | `d491a250bdc` |
| 17-02 | Rule 1 - Bug | Unicode section sign in comment blocked hygiene gate | `d491a250bdc` |
| 17-02 | Rule 1 - Bug | Comment in tier-dispatch.ts mentioning function name inflated caller-count fence | `d491a250bdc` |
| 17-03 | Rule 1 - Bug | `WebviewRpc.postAddDecisionNode` used `this.postRaw` (HostRpc method; does not exist on WebviewRpc) | `18675414b37` |
| 17-03 | Rule 1 - Bug | `onClick={onAddDecisionNode}` forwarded React synthetic event as first argument | `18675414b37` |
| 17-04 | Rule 3 - Blocking | Drizzle `materialize()` silently drops `repo_id` despite SQLite column existing | `dc141c1fffa` |
| 17-04 | Rule 3 - Blocking | `activate()` never called in mocha — command not reachable via `executeCommand` | `20d5c62c7fb` |
| 17-05 | Rule 1 - Bug | 3 missing `repo_id` fields on hand-constructed `NodeRow` literals (`queryByAnchor`, `findSuccessor`, `helpers.spec.ts` sampleRow) | `7ca87825cce` |

## v2.0 Milestone Closure Note

Phase 17 is the LAST phase of the v2.0 milestone. With Phase 17 closed, the v2.0 milestone is CLOSED as of 2026-05-16.

**10/10 v2.0 requirements closed:**
- DEEP-01 (Phase 14): `graph.queryRationaleAt` kernel RPC + bitemporal rationale chain
- DEEP-02 (Phase 15): Graph Inspector Panel (Cytoscape.js time-travel inspector)
- DEEP-03 (Phase 16): Constraint Lift analysis (ripple impact + HypotheticalImpact UI)
- DEEP-04 (Phase 14): Historical conflict `IntentDriftBadge` discriminated union
- DEEP-05 (Phase 14): Session-priority lens (`rerankBySessionPriority`) + `ReadonlyKernelClient` Mandate B fence
- DEEP-06 (Phase 16 + Phase 17): Cross-repo schema migration (phase-A) + cross-repo UI (phase-B)
- POLISH-01 (Phase 17): First-run onboarding walkthrough
- POLISH-02 (Phase 17): Save-gate settings as native dropdowns with resource scope
- POLISH-03 (Phase 17): Empty-state UX ("No rationale recorded yet" + CTA)
- POLISH-04 (Phase 17): Benign-tier compact hover receipt

**Deferred to v2.1 (documented):**
- C3 Windows auto-update (Squirrel.Windows deprecated; v2.1 uses NSIS + electron-updater unified with C1+C2)
- Walkthrough foregrounding (SC3b: GoatIDE walkthrough registered + visible but not auto-selected over VS Code default on first launch)
- Multi-daemon kernel orchestration for cross-repo writes (v2.0 single-DB model is forward-compatible scaffolding)

**v2.0 shipping artifact:** Manual-install build from master at this commit. No distribution packaging in v2.0.

## v2.1 Handoff

v2.1 scope (not yet planned):

1. **C1 macOS notarization** — requires Apple Developer ID (not yet procured)
2. **C2 Windows EV code-signing** — requires EV certificate (not yet procured)
3. **C3 Windows auto-update** — NSIS + electron-updater (Squirrel.Windows deprecated; deferred 2026-05-13). Unified with C1+C2 for one clean distribution milestone.
4. **Sparkle macOS auto-update** — ships with C1
5. **Multi-daemon kernel orchestration for cross-repo writes** — the v2.0 `goatide.openCrossRepoGraph` command and `edge[?crossRepo]` Cytoscape styling are infrastructure-ready; actual cross-repo edges require writing nodes from multiple repos into a shared SQLite view or bridge-side stitching
6. **DecisionNode authoring UI** — replace the v2.0 `showInformationMessage` placeholder CTA with a real authoring flow (edit contracts file directly or inline input)
7. **Walkthrough re-trigger command** — allow users to re-open the onboarding walkthrough after first run (currently no command exposes `maybeAutoOpenWalkthrough` after `goatide.onboardingComplete` is set)
8. **Walkthrough foregrounding** — investigate `workbench.action.showWalkthrough` vs `openWalkthrough` timing to ensure GoatIDE walkthrough is foregrounded on first launch rather than VS Code's default "Setup VS Code" walkthrough

---

*Phase: 17-cross-repo-ui-polish*
*Completed: 2026-05-16*
*v2.0 milestone: CLOSED 2026-05-16 (10/10 requirements)*
