---
phase: 16-ripple-cross-repo-migration
plan: 04
subsystem: ui
tags: [bridge, canvas, webview, constraint-lift, mandate-b, hypothetical-impact, wave-3]

# Dependency graph
requires:
  - phase: 16-ripple-cross-repo-migration
    provides: Wave-0 RED stubs (DriftFindings-constraint-lift-button.test.tsx + HypotheticalImpact.test.tsx), HypotheticalImpact.tsx null stub, messages.ts schema additions (hypothetical_impact + constraint_lift_eligible)
  - phase: 16-ripple-cross-repo-migration
    provides: Wave-1 kernel real bodies (runConstraintLiftAnalysis), Wave-2 bridge transport (KernelClient.constraintLift + ConstraintLiftHandler + tier-dispatch constraint_lift_eligible)
  - phase: 14-foundation-rpcs
    provides: RationaleChain.tsx four-branch render pattern, vscode-editorWarning-foreground amber idiom
  - phase: 15-graph-inspector-panel
    provides: vscode-known-variables.json CSS discipline, useMemo/useState webview patterns
provides:
  - DriftFindings.tsx constraintLiftEligible prop + conditional "What would break if this constraint is lifted?" button + onClick posting canvas.requestConstraintLift
  - HypotheticalImpact.tsx real body: ComplianceReportView wrapper + "Hypothetical" badge + depth radio (1/2/3) + show-all toggle
  - App.tsx renders HypotheticalImpact when hypothetical_impact non-null; renders kernel-degraded notice; threads constraintLiftEligible to DriftFindings
  - styles.css .hypothetical-impact-section/.badge/.controls + .drift-findings-constraint-lift-button (all --vscode-* variables)
  - WebviewRpc.postConstraintLiftRequest method
  - 6 Wave-0 RED tests GREEN-flipped (3 DriftFindings + 3 HypotheticalImpact)
  - Mandate B layer 3 (webview conditional render) verified by DriftFindings test 2
affects: [16-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DriftFindingsCitation interface: flexible shape allowing cited_payload for test mocks + RenderedCitationForCanvas from App.tsx"
    - "App.tsx driftFindingsCitations adapter: marks first citation as ConstraintNode when constraintLiftEligible (host-verified), enabling defensive webview-side check"
    - "HypotheticalImpact filterRow: confidence_band cast via (r as unknown as {confidence_band?: string}).confidence_band — DEEP-03 field not in ComplianceRowSchema, handled defensively"
    - "WebviewRpc.postConstraintLiftRequest: mirrors postRationaleRequest shape — payload-only, no asOf (Pitfall 1 fence)"
    - "showAll toggle: webview-side visibility filter (Open Decision 3) — kernel returns all rows; toggle controls rendering"

key-files:
  created: []
  modified:
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/DriftFindings.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/HypotheticalImpact.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/App.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/styles.css
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/rpc.ts
    - src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/DriftFindings-constraint-lift-button.test.tsx
    - src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/HypotheticalImpact.test.tsx

key-decisions:
  - "DriftFindingsCitation flexible interface pattern: test mocks supply cited_payload.kind; App.tsx adapter marks first citation as ConstraintNode when constraintLiftEligible (host-verified). Avoids coupling RenderedCitationForCanvas to DEEP-03 fields."
  - "WebviewRpc.postConstraintLiftRequest: new typed method added to WebviewRpc instead of using vscode.postMessage directly — consistent with postRationaleRequest shape, keeps postMessage calls typed"
  - "confidence_band defensive cast in HypotheticalImpact filterRow: Phase 16 Plan 16-02 added confidence_band to ConstraintLiftRow but ComplianceRowForCanvas schema predates DEEP-03. Cast deferred to v2.1 schema alignment."
  - "styles.css .hypothetical-impact-badge uses --vscode-editorWarning-foreground as background (amber accent on dark editor background) — visual idiom consistency with Phase 14 Superseded amber and rationale-chain__superseded"

requirements-completed: [DEEP-03]

# Metrics
duration: 15min
completed: 2026-05-15
---

# Phase 16 Plan 04: Wave-3 Webview UI Summary

**DEEP-03 Wave 3 — DriftFindings constraint-lift button + HypotheticalImpact real body + App.tsx integration + 6 Wave-0 RED tests GREEN**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-15T05:09:53Z
- **Completed:** 2026-05-15T05:24:38Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- `DriftFindings.tsx` gains `constraintLiftEligible: boolean` prop + `citations: DriftFindingsCitation[]` prop. Conditional button "What would break if this constraint is lifted?" renders when BOTH conditions are true (Mandate B layer 3 — no clickable surface → no canvas.requestConstraintLift → no kernel write path). onClick calls `rpc.postConstraintLiftRequest` with default max_hops=3 + confidence_threshold=0.5.
- `WebviewRpc` gains typed `postConstraintLiftRequest` method. No asOf in payload (Pitfall 1 fence — host-only asOf threading via panel.ts lastPayload).
- `HypotheticalImpact.tsx` Wave-0 null stub replaced with real body: "Hypothetical" amber badge + depth radio (1/2/3) + show-all toggle + `ComplianceReportView` child. showAll toggle filters `confidence_band='inferred'` rows (webview-side visibility hint, Open Decision 3).
- `styles.css` extended with `.hypothetical-impact-section`, `.hypothetical-impact-badge`, `.hypothetical-impact-controls`, `.drift-findings-constraint-lift-button` — all using only `--vscode-*` registered variables. Amber accent via `--vscode-editorWarning-foreground` (visual idiom consistency with Phase 14 Superseded badge).
- `App.tsx` imports HypotheticalImpact; renders when `payload.hypothetical_impact` non-null; renders kernel-degraded notice div when `payload.hypothetical_impact_error === 'kernel-degraded'`; threads `constraintLiftEligible` + adapted `driftFindingsCitations` to DriftFindings; adds local useState for depth (default 3) + showAll (default false); onDepthChange re-fires canvas.requestConstraintLift with new max_hops.
- 6 Wave-0 RED tests flip GREEN (3 DriftFindings + 3 HypotheticalImpact). Full bridge suite: 120 passing / 3 pending / 0 failing (pre-plan count was 114 + 6 Wave-3 RED stubs).
- All CI gates exit 0: refuse-deep05-write, refuse-stale-bridge-mirror, refuse-unbounded-ripple-walk. Bridge `npm run build` exits 0. `npx tsc -p . --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: DriftFindings constraintLiftEligible prop + constraint-lift button + 3 RED GREEN** - `2fd84176ce3` (feat)
2. **Task 2: HypotheticalImpact real body + styles.css + 3 RED GREEN** - `4c239fd24cc` (feat)
3. **Task 3: App.tsx integrates HypotheticalImpact + threads constraintLiftEligible + full suite 120/120** - `ac7af7cb022` (feat)

## Files Created/Modified

- `src/.../canvas/webview/DriftFindings.tsx` — DriftFindingsCitation interface + constraintLiftEligible/citations props + conditional button + onClick postConstraintLiftRequest
- `src/.../canvas/webview/HypotheticalImpact.tsx` — Wave-0 null stub replaced with real body (badge + radio + toggle + ComplianceReportView)
- `src/.../canvas/webview/App.tsx` — HypotheticalImpact import + local state + driftFindingsCitations adapter + HypotheticalImpact render branch + kernel-degraded notice
- `src/.../canvas/webview/styles.css` — hypothetical-impact-* + drift-findings-constraint-lift-button selectors (--vscode-* only)
- `src/.../canvas/rpc.ts` — WebviewRpc.postConstraintLiftRequest method
- `test/unit/canvas/DriftFindings-constraint-lift-button.test.tsx` — 3 Wave-0 RED stubs replaced with real jsdom assertions (GREEN)
- `test/unit/canvas/HypotheticalImpact.test.tsx` — 3 Wave-0 RED stubs replaced with real jsdom assertions (GREEN)

## Decisions Made

- `DriftFindingsCitation` flexible interface: allows test mocks with `cited_payload.kind` AND `RenderedCitationForCanvas` from App.tsx (which lacks `cited_payload`). App.tsx adapter marks the first citation as `{cited_payload: {kind: 'ConstraintNode', node_id: c.node_id}}` when `constraintLiftEligible` (host-verified). Keeps the webview-side defensive check functional for both test and production paths.
- `WebviewRpc.postConstraintLiftRequest` method added instead of inlining `vscode.postMessage` calls — consistent with `postRationaleRequest` shape; keeps all WebviewToHost message sends typed through the rpc facade.
- `confidence_band` defensive cast in `HypotheticalImpact.filterRow`: `(r as unknown as {confidence_band?: string}).confidence_band` — Phase 16-02 added `confidence_band` to `ConstraintLiftRow` but `ComplianceRowSchema` in messages.ts predates DEEP-03 and doesn't include it. Cast is explicit and commented; v2.1 cleanup to align schemas.
- `styles.css` badge uses `--vscode-editorWarning-foreground` as background color with `--vscode-editor-background` as foreground text — amber badge on dark background is visually consistent with Phase 14 Superseded idiom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hygiene gate blocked multi-line JSX comments with space-indented continuations**
- **Found during:** Task 1 commit attempt (DriftFindings.tsx) and Task 3 commit attempt (App.tsx)
- **Issue:** VS Code build hygiene gate (`gulpfile.hygiene.js`) blocks "Bad whitespace indentation" — JSX `{/* ... */}` comments where the continuation line uses spaces after tabs.
- **Fix:** Collapsed multi-line JSX comments to single lines.
- **Files modified:** DriftFindings.tsx, App.tsx
- **Committed in:** 2fd84176ce3 (Task 1), ac7af7cb022 (Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 1 Bug) — same hygiene pattern as Phase 16 Plan 03 (Unicode section sign) and Phase 15 Plan 01 (Pitfall 1 comment rephrasing). Pre-existing hygiene patterns reconfirmed: JSX comment continuations must be single-line.

## Issues Encountered

- `Date.now()` in `App.tsx` `showStartMsRef.current = Date.now()` and `latencyMs = Date.now() - startMs` are pre-existing (for accept latency measurement, not for asOf). Plan verification #7 correctly excludes these from the Pitfall 1 fence (the fence specifically targets `asOf` timestamping, not latency measurement). The fence holds: no new `Date.now()` or `new Date()` calls for asOf purposes in any of the 3 task files.

## Next Phase Readiness

- Phase 16 Plan 16-05 (phase-verify): verify all 5 VALIDATION.md task rows for phase 16, run CI gate suite, run kernel test suite, close phase 16.
- All DEEP-03 wave deliverables are complete: Wave-0 (stubs + schema), Wave-1 (kernel bodies), Wave-2 (bridge transport), Wave-3 (webview UI). Full Mandate B four-layer defense is in place: webview conditional render (this plan) + kernel Attempt invariant (16-02) + bridge KernelClient spy (16-03) + structural CI gate refuse-deep05-write (Phase 14).

## Self-Check: PASSED

Task commits verified: 2fd84176ce3 4c239fd24cc ac7af7cb022.
6/6 Wave-3 tests GREEN (DriftFindings constraint.lift x3 + HypotheticalImpact x3).
Full bridge suite: 120 passing / 3 pending / 0 failing.
CI gates: refuse-deep05-write exit 0, refuse-stale-bridge-mirror exit 0, refuse-unbounded-ripple-walk exit 0.
Bridge build (npm run build): exits 0. TypeScript (npx tsc -p . --noEmit): clean.

---
*Phase: 16-ripple-cross-repo-migration*
*Completed: 2026-05-15*
