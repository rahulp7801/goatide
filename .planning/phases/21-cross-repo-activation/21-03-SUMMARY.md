---
phase: 21-cross-repo-activation
plan: 03
subsystem: inspector
tags: [xrepo, tooltip, cytoscape, cross-repo, integration-test, tdd-green, inspector]

requires:
  - phase: 21-01
    provides: "Wave-0 RED stubs: node-tooltip-repo-id.test.ts; cross-repo-edge-style.test.ts sentry"
  - phase: 21-02
    provides: "queryByAnchor Path-B cross-repo opt-in (repoId=undefined skips WHERE predicate); WorkspaceRepoState; tier-dispatch threading"
  - phase: 17-cross-repo-ui-polish
    provides: "edgeRowToCyElement.ts:87 crossRepo endpoint-detection; Phase 17 GRAPHIFY_STYLE dormant selector; SerializedWorkspaceRepoSchema"

provides:
  - "SerializedWorkspaceRepoSchema gains folder_name: z.string() (Open Decision Sec.11)"
  - "GraphInspectorPanel.handleMessage injects folder_name: r.folder.name per workspace_repo entry"
  - "Graph.tsx: buildRepoLabel helper + native HTML title tooltip via cy mouseover/mouseout handlers (Open Decision Sec.6)"
  - "Graph.tsx: nodes carry data.repoLabel in Cytoscape element data"
  - "App.tsx: workspace_repos threaded from inspector.show payload into reducer state, passed to Graph"
  - "node-tooltip-repo-id.test.ts: Wave-0 RED stub GREEN-flipped (4 cases)"
  - "edgeRowToCyElement.test.ts: crossRepo===true + negative-control unit cases (XREPO-03a)"
  - "cross-repo-edge-activation.integrationTest.ts: end-to-end Phase 16+17+21 integration test"
  - ".mocharc.cjs: *.integrationTest.ts pattern added to spec list"

affects:
  - 21-04-phase-verify-and-closure

tech-stack:
  added: []
  patterns:
    - "Native HTML title tooltip via Cytoscape mouseover/mouseout (Open Decision Sec.6 -- zero new npm deps, Pitfall G defense)"
    - "Raw-SQL seed via better-sqlite3 before daemon starts: integration test bypass pattern for non-'primary' repo_id seeds"
    - "*.integrationTest.ts spec pattern added to .mocharc.cjs for bridge integration test discovery"
    - "buildRepoLabel pure function pattern: testable without Cytoscape DOM"

key-files:
  created:
    - "src/vs/goatide/extensions/goatide-bridge/test/integration/cross-repo-edge-activation.integrationTest.ts"
  modified:
    - "src/vs/goatide/extensions/goatide-bridge/src/inspector/messages.ts"
    - "src/vs/goatide/extensions/goatide-bridge/src/inspector/panel.ts"
    - "src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/App.tsx"
    - "src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/Graph.tsx"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/inspector/edgeRowToCyElement.test.ts"
    - "src/vs/goatide/extensions/goatide-bridge/test/unit/inspector/node-tooltip-repo-id.test.ts"
    - "src/vs/goatide/extensions/goatide-bridge/.mocharc.cjs"

key-decisions:
  - "Open Decision Sec.6 implemented: native HTML title attribute via Cytoscape mouseover/mouseout -- zero new npm deps (Pitfall G defense against cytoscape-popper/tippy.js)"
  - "Open Decision Sec.11 implemented: folder_name added to workspace_repos wire schema so webview can display readable repo names without basename re-computation from URI"
  - "buildRepoLabel exported from Graph.tsx at module scope for direct unit testing (no Cytoscape DOM required for tooltip contract tests)"
  - "*.integrationTest.ts bridge convention documented + mocharc.cjs updated (Rule 3 fix: files otherwise not discovered)"
  - "Kernel dist rebuilt before integration test run: Plan 21-02 cross-repo Path B was not in kernel/dist (compiled before 21-02 landed); rebuild required for test to pass"
  - "Optional 14th CDP SC deferred: multi-folder CDP fixture adds scope; documented as deferred"

patterns-established:
  - "Raw-SQL seed before daemon starts: canonical pattern for integration tests that need non-'primary' repo_id values (v2.2 will add dao.seed repo_id support)"
  - "buildRepoLabel pure function: place tooltip computation logic in an exported pure function for unit-test coverage without DOM"

requirements-completed:
  - XREPO-03

duration: 20min
completed: 2026-05-18
---

# Phase 21 Plan 03: XREPO-03 Inspector Tooltip + Cross-Repo Edge Activation Summary

**Native HTML title tooltip in Cytoscape via mouseover/mouseout (zero deps) + first end-to-end cross-repo edge activation test proving Phase 16+17+21 chain**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-18T05:41:55Z
- **Completed:** 2026-05-18T06:01:25Z
- **Tasks:** 4/4 (Tasks 1 + 2 + 2.5 + 3 implementation, Task 4 verification + commit)
- **Files modified:** 8 files (7 modified, 1 created)

## Accomplishments

- Extended `SerializedWorkspaceRepoSchema` with `folder_name: z.string()` (Open Decision Sec.11); `panel.ts` injects `folder_name: r.folder.name`; App.tsx threads it to Graph
- `Graph.tsx` adds `buildRepoLabel` pure helper + Cytoscape `mouseover`/`mouseout` handlers for native HTML title tooltip (Open Decision Sec.6; Pitfall G defense -- zero new npm deps)
- Wave-0 RED stub `node-tooltip-repo-id.test.ts` GREEN-flipped (4 test cases: main + primary fallback + unknown repo + mouseout clear)
- `edgeRowToCyElement.test.ts` extended with `crossRepo === true` unit case + negative control (XREPO-03a)
- `cross-repo-edge-activation.integrationTest.ts` created: raw-SQL seeds repo-B ConstraintNode, starts daemon, calls proposeEdit -> atomicAccept in repo-A, asserts cross-repo `references` edge, renders via `edgeRowToCyElement`, asserts `data.crossRepo === true`

## Task Commits

All tasks committed as a single Wave-2 commit per plan:

1. **Wave-2 commit** - `741a8c7b7a2` feat: all Tasks 1/2/2.5/3 + hygiene fix for template literal whitespace

## Files Created/Modified

- `src/vs/goatide/extensions/goatide-bridge/src/inspector/messages.ts` -- `SerializedWorkspaceRepoSchema` gains `folder_name: z.string()` with XREPO-03 comment
- `src/vs/goatide/extensions/goatide-bridge/src/inspector/panel.ts` -- `folder_name: r.folder.name` injected in workspace_repos map
- `src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/App.tsx` -- `WorkspaceRepoEntry` type imported; `workspaceRepos` added to AppState + Action + reducer + dispatch; passed to Graph
- `src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/Graph.tsx` -- `WorkspaceRepoEntry` interface + `buildRepoLabel` pure function + `workspaceRepos` prop + mouseover/mouseout handlers + node `data.repoLabel` computation
- `src/vs/goatide/extensions/goatide-bridge/test/unit/inspector/node-tooltip-repo-id.test.ts` -- Rewritten from RED stub to 4 GREEN cases testing `buildRepoLabel` directly
- `src/vs/goatide/extensions/goatide-bridge/test/unit/inspector/edgeRowToCyElement.test.ts` -- Added `crossRepo===true` cross-repo case + `crossRepo===false` negative-control case
- `src/vs/goatide/extensions/goatide-bridge/test/integration/cross-repo-edge-activation.integrationTest.ts` -- New integration test (end-to-end Phase 16+17+21 chain)
- `src/vs/goatide/extensions/goatide-bridge/.mocharc.cjs` -- Added `*.integrationTest.ts` to spec list

## Decisions Made

- **Open Decision Sec.6 (native HTML title):** Implemented via `cy.on('mouseover', 'node', ...)` that writes `container.title = repoLabel` and `cy.on('mouseout', 'node', ...)` that clears it. No `cytoscape-popper`, no `tippy.js` (Pitfall G mitigation).
- **Open Decision Sec.11 (folder_name on wire):** Added to `SerializedWorkspaceRepoSchema` as a required field (not optional) so webview can display readable names. Backward-compat: the entire `workspace_repos` array remains `.optional()` on `InspectorShowPayloadSchema`.
- **buildRepoLabel at module scope:** Exported from `Graph.tsx` for direct unit testing. The Wave-0 RED stub tests it without requiring a live Cytoscape DOM.
- **Optional 14th CDP SC deferred:** Multi-folder CDP fixture would require significant scope expansion. Documented as deferred per 21-VALIDATION.md.
- **Kernel dist rebuild:** `kernel/dist/` was compiled from before Plan 21-02's cross-repo Path B landed. Rebuilt via `npm run build` in kernel/. This was a necessary precondition for the integration test to pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] .mocharc.cjs does not pick up *.integrationTest.ts files**
- **Found during:** Task 3 (cross-repo-edge-activation.integrationTest.ts creation)
- **Issue:** Plan specifies `.integrationTest.ts` suffix for "bridge integration test convention" but `.mocharc.cjs` spec list only matches `*.test.ts`, `*.test.tsx`, `*.test.cjs`. The new file would never be discovered by the mocha runner.
- **Fix:** Added `'test/**/*.integrationTest.ts'` pattern to the `spec` array in `.mocharc.cjs`.
- **Files modified:** `src/vs/goatide/extensions/goatide-bridge/.mocharc.cjs`
- **Verification:** Integration test runs and is discovered by `npm test`.
- **Committed in:** `741a8c7b7a2`

**2. [Rule 3 - Blocking] Kernel dist outdated (cross-repo Path B missing)**
- **Found during:** Task 3 integration test debugging
- **Issue:** `kernel/dist/graph/dao.js` had `repoId = 'primary'` as default in `queryByAnchor` (compiled before Plan 21-02's Path B). The integration test's `proposeEdit` receipt had empty citations even though the repo-B node was seeded correctly.
- **Fix:** Rebuilt kernel: `cd kernel && npm run build`.
- **Files modified:** `kernel/dist/` (regenerated)
- **Verification:** Integration test passed after rebuild (citations found).
- **Committed in:** Not committed (dist files are .gitignore'd)

**3. [Rule 1 - Bug] App.tsx needed updating to thread workspace_repos to Graph**
- **Found during:** Task 2 (Graph.tsx implementation)
- **Issue:** The plan specified changes to `Graph.tsx` and `wireToInspectorRow.ts` but didn't mention `App.tsx`. `workspace_repos` arrives in the `inspector.show` message but `App.tsx` was not threading it down to `Graph`. Without this, `Graph`'s `workspaceRepos` prop would always be `undefined`.
- **Fix:** Added `workspaceRepos: WorkspaceRepoEntry[]` to `AppState`; extended `Action.show` to carry `workspaceRepos`; updated reducer; passed `state.workspaceRepos` to `<Graph>`.
- **Files modified:** `src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/App.tsx`
- **Verification:** TypeScript compiles cleanly; `buildRepoLabel` receives workspace repos.
- **Committed in:** `741a8c7b7a2`

**4. [Rule 1 - Bug] Hygiene pre-commit check: mixed tab+space in template literal**
- **Found during:** Task 4 (commit attempt)
- **Issue:** Template literal in integration test had `\t\t\t\t VALUES...` (4 tabs + leading space). Hygiene checker flagged lines 115 and 120 as "Bad whitespace indentation".
- **Fix:** Replaced multi-line template literals with string concatenation (`'INSERT...' + ' VALUES...'`).
- **Files modified:** `cross-repo-edge-activation.integrationTest.ts`
- **Verification:** Second commit attempt passed hygiene check.
- **Committed in:** `741a8c7b7a2`

---

**Total deviations:** 4 auto-fixed (2x Rule 3, 2x Rule 1)
**Impact on plan:** All auto-fixes necessary for correctness or discoverability. No scope creep. wireToInspectorRow.ts was verified as a no-op (workspace_repos doesn't pass through it -- confirmed by grep).

## Mandate Fences

- **Mandate B:** `refuse-deep05-write.sh` exits 0. Graph.tsx + panel.ts + messages.ts + App.tsx changes introduce ZERO write-RPC tokens. All edits are additive metadata/rendering.
- **Mandate D:** `tier-dispatch.ts` NOT touched. Phase 17 + Phase 20 4x3 byte-identity matrix unchanged.
- **Mandate A:** Tooltip text built from kernel-supplied `repo_id` + VS Code `folder.name`. Neither source is LLM-generated.
- **Bridge mirror:** `refuse-stale-bridge-mirror.sh` exits 0. `package.json` NOT modified.

## CI Gates (all 5 exit 0)

- `refuse-deep05-write.sh`: PASS (12 inspector files scanned, 0 banned tokens)
- `refuse-stale-bridge-mirror.sh`: PASS (stub vs real package.json byte-equal)
- `refuse-fuzzy-fallback.sh`: PASS
- `refuse-unbounded-ripple-walk.sh`: PASS
- `refuse-silent-override.sh`: PASS

## Issues Encountered

- **Kernel dist stale:** The integration test initially failed because `kernel/dist` was compiled before Plan 21-02's cross-repo Path B (`repoId === undefined` opt-in). Rebuilt kernel before tests passed. This is not a code defect -- just a one-time rebuild needed after 21-02 merged.
- **Transient kernel vitest flakiness:** When running the full kernel suite after bridge integration tests, one `dao-repo-id.spec.ts` test showed `expected 0 to be greater than 0`. Isolated run of kernel suite: 421/421 pass. Pre-existing port conflict flakiness from concurrent processes.

## User Setup Required

None.

## Next Phase Readiness

Plan 21-04 (phase-verify-and-closure) can now:
- Run 21-VALIDATION.md verification matrix with all XREPO-03 rows satisfied
- Verify XREPO-03a grep (`edgeRowToCyElement.*crossRepo.*true`) in test results
- Flip 21-VERIFICATION.md rows to GREEN
- Author Phase 21 closure SUMMARY

---
*Phase: 21-cross-repo-activation*
*Completed: 2026-05-18*

## Self-Check: PASSED

All 9 files (8 modified/created + SUMMARY.md) exist on disk. Wave-2 commit `741a8c7b7a2` verified in git log.
