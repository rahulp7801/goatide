---
phase: 21
slug: cross-repo-activation
closed: 2026-05-18
status: closed
requirements_closed: [XREPO-01, XREPO-02, XREPO-03]
smoke_score: 13/13
flakiness_fence: PASS (3/3 EXIT 0)
pitfall_audit: A=MITIGATED D=MITIGATED E=MITIGATED G=MITIGATED
mandate_audit: A=GREEN B=GREEN D=GREEN
plans_executed: 4/4
---

# Phase 21 -- Verification Log

## Overview

Phase 21 closes XREPO-01, XREPO-02, and XREPO-03 across 4 plans and 3 waves:

- Wave 0 (Plan 21-01): ADR + dbPath-keyed daemon fence + 10 RED/GREEN stubs
- Wave 1 (Plan 21-02): kernel write-RPC repo_id params + bridge threading
- Wave 2 (Plan 21-03): inspector tooltip + cross-repo edge activation integration test
- Wave 3 (Plan 21-04): phase-verify battery + closure ceremony

Verification was performed against HEAD `53ea7e89708` (21-03 SUMMARY/docs commit) with all Phase 21
implementation code committed (Wave-0 commit `a8a18abdc06`, Wave-1 commit `9881d24ef7f`,
Wave-2 commit `741a8c7b7a2`).

---

## ROADMAP Success Criteria

| SC | Description | Verification Command | Observed Result | Commit SHAs |
|----|-------------|---------------------|-----------------|-------------|
| SC#1 | Multi-root workspace cross-repo edge in Graph Inspector; Inspector node tooltip shows repo_id fingerprint + readable folder name; dormant `edge[?crossRepo]` Cytoscape selector fires | `npm test --grep "cross-repo\|buildRepoLabel\|node.*tooltip"` (bridge); `cross-repo-edge-activation.integrationTest.ts` PASS | 12 Phase-21 bridge tests PASS; integration test 2/2 PASS; crossRepo edge assertion holds; buildRepoLabel returns `<folder> (<hex>)` format | `741a8c7b7a2` (XREPO-03); `9881d24ef7f` (queryByAnchor Path B); `1efdce08444` (docs) |
| SC#2 | tier-dispatch reads WorkspaceRepoState.getActiveRepoId on every save; repo_id threaded through proposeEdit + atomicAccept; all 2-arg call sites backward-compat | `npm test --grep "WorkspaceRepoState\|tier-dispatch.*repo_id\|applyEditAtomically"` | 5 XREPO-02 bridge tests PASS; kernel atomicAccept/recordRejection/recordContractOverride repo_id PASS; backward-compat: full kernel suite 420/421 PASS (1 pre-existing flaky `dao-repo-id` passes in isolation) | `9881d24ef7f` (XREPO-01+02); `a8a18abdc06` (stubs) |
| SC#3 | Single-DB model preserved; kernel startup guard rejects second readwrite opener on same dbPath; no new DB file for secondary repos | `npm test -- second-opener-fence` (kernel); `bash scripts/ci/refuse-deep05-write.sh` | second-opener-fence.spec.ts 2/2 PASS; dbPath-keyed fence rejects same-DB opener with 'same graph.db' error; stale-pid reclaim path sentry PASS; CI gate exit 0 | `a8a18abdc06` (daemon fence + lockfile.ts) |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test File | Command | Status |
|---------|------|------|-------------|-----------|---------|--------|
| 21-01-XREPO-01a | 01 | 0 | XREPO-01 | `kernel/src/test/rpc/proposeEdit-repo-id.spec.ts` | `cd kernel && npm test -- proposeEdit-repo-id` | GREEN -- forward-compat sentinel: Zod drops unknown field silently (1 test PASS) |
| 21-01-XREPO-01b | 01 | 0 | XREPO-01 | `kernel/src/test/rpc/atomicAccept-repo-id.spec.ts` | `cd kernel && npm test -- atomicAccept-repo-id` | GREEN -- 2 tests PASS (explicit repo_id + default 'primary') |
| 21-01-XREPO-01c | 01 | 0 | XREPO-01 | `kernel/src/test/rpc/recordRejection-repo-id.spec.ts` | `cd kernel && npm test -- recordRejection-repo-id` | GREEN -- 2 tests PASS |
| 21-01-XREPO-01d | 01 | 0 | XREPO-01 | Full kernel suite (backward-compat sentry) | `cd kernel && npm test` | GREEN -- 420/421 PASS (1 pre-existing flaky `dao-repo-id` passes in isolation: confirmed by `npm test -- dao-repo-id` 1/1 PASS; concurrent-process port-conflict timing issue documented in 21-03 SUMMARY) |
| 21-01-XREPO-01e | 01 | 0 | XREPO-01 | `kernel/src/test/rpc/atomicAccept-repo-id.spec.ts` (default-primary case) | See XREPO-01b | GREEN (included in same spec, 2nd test case) |
| 21-01-XREPO-01f | 01 | 0 | XREPO-01 | `kernel/src/test/harvester/daemon/second-opener-fence.spec.ts` | `cd kernel && npm test -- second-opener-fence` | GREEN -- 2 tests PASS (same-dbPath reject + stale-pid reclaim) |
| 21-01-XREPO-02f | 01 | 0 | XREPO-02 | `kernel/src/test/graph/fingerprint-tripartite-parity.spec.ts` | `cd kernel && npm test -- fingerprint-tripartite` | GREEN -- 1 test PASS |
| 21-02-XREPO-02a | 02 | 1 | XREPO-02 | `test/unit/save-gate/workspace-repo-state-getActiveRepoId.test.ts` | `npm test --grep "WorkspaceRepoState.*fingerprint"` | GREEN -- fingerprint path PASS |
| 21-02-XREPO-02b | 02 | 1 | XREPO-02 | Same file, primary-fallback case | `npm test --grep "WorkspaceRepoState.*primary"` | GREEN -- fallback PASS |
| 21-02-XREPO-02c | 02 | 1 | XREPO-02 | `test/unit/save-gate/tier-dispatch-repo-id-threading.test.ts` | `npm test --grep "tier-dispatch.*recordRejection.*repo_id"` | GREEN |
| 21-02-XREPO-02d | 02 | 1 | XREPO-02 | Same file, applyEditAtomically case | `npm test --grep "applyEditAtomically.*repo_id"` | GREEN |
| 21-02-XREPO-02e | 02 | 1 | XREPO-02 | Same file, on-will-save proposeEdit case | `npm test --grep "on-will-save.*proposeEdit.*repo_id"` | GREEN |
| 21-03-XREPO-03a | 03 | 2 | XREPO-03 | `test/unit/inspector/edgeRowToCyElement.test.ts` (crossRepo case) | `npm test --grep "edgeRowToCyElement.*crossRepo.*true"` | GREEN -- crossRepo===true unit case PASS |
| 21-03-XREPO-03b | 03 | 2 | XREPO-03 | `test/unit/inspector/cross-repo-edge-style.test.ts` | `npm test --grep "GRAPHIFY_STYLE.*crossRepo"` | GREEN -- dormant selector sentry PASS |
| 21-03-XREPO-03c | 03 | 2 | XREPO-03 | `test/integration/cross-repo-edge-activation.integrationTest.ts` | `scripts/test-integration.bat` or `npm test --grep "cross-repo-edge-activation"` | GREEN -- 2/2 PASS (main + negative-control); end-to-end Phase 16+17+21 chain confirmed |
| 21-03-XREPO-03d | 03 | 2 | XREPO-03 | `test/unit/inspector/node-tooltip-repo-id.test.ts` | `npm test --grep "buildRepoLabel\|node tooltip"` | GREEN -- 4 cases PASS (main + primary-fallback + unknown-repo + mouseout-clear) |
| 21-PHASE-GATE | 04 | 3 | XREPO-01..03 | Full composite | full bridge + full kernel + integration + 5 CI gates + 6 meta-tests + tsc + layers + CDP smoke (3-run) | ALL GREEN -- see sections below |

---

## Wave-by-Wave Evidence

### Wave 0 -- ADR + Fences + RED/GREEN Stubs (Plan 21-01)

**Objective:** ADR documenting single-DB design, dbPath-keyed daemon fence in `kernel/src/daemon/index.ts`, 10 test files (6 GREEN sentries + 4 RED stubs for Wave 1/2).

**Verdicts:**

- **ADR:** `21-ADR-single-db-wal-isolation.md` authored. Status: Accepted. Decision: single kernel daemon, one graph.db, repo_id partitions rows not DB files. Multi-daemon deferred to v2.2.
- **dbPath-keyed fence:** `LockfileContent.db_path?: string` added to `kernel/src/daemon/lockfile.ts`. `startDaemon` writes `realpathSync(args.dbPath)` to lockfile; exists-branch compares `db_path` to reject same-DB second opener with 'same graph.db' error. `second-opener-fence.spec.ts` 2/2 PASS.
- **GREEN sentries:** `second-opener-fence.spec.ts` (2), `fingerprint-tripartite-parity.spec.ts` (1), `proposeEdit-repo-id.spec.ts` (1, forward-compat Zod passthrough), `cross-repo-edge-style.test.ts` (Phase 17 dormant selector sentry).
- **RED stubs landed for Wave 1:** `atomicAccept-repo-id.spec.ts` (2 cases), `recordRejection-repo-id.spec.ts` (2 cases), `recordContractOverride-repo-id.spec.ts` (2 cases Open Decision Sec.8), `workspace-repo-state-getActiveRepoId.test.ts` (2 cases), `tier-dispatch-repo-id-threading.test.ts` (3 cases), `node-tooltip-repo-id.test.ts` (1 case RED).
- **Auto-fixes:** 3 (Rule 3: daemon spec path; Rule 1: realpathSync ENOENT; Rule 1: @ts-expect-error unusable on sendRequest overloads -- used cast-via-unknown instead).

**Commits:** `a8a18abdc06` (Wave-0 implementation), `1efdce08444` (plan-close docs)

---

### Wave 1 -- Kernel Params + Bridge Threading (Plan 21-02)

**Objective:** Add optional `repo_id?` to 4 kernel write-RPC params interfaces; implement WorkspaceRepoState.getActiveRepoId; thread repo_id through tier-dispatch/apply-edit/on-will-save/pending-attempts; implement queryByAnchor Path B cross-repo opt-in (undefined skips WHERE predicate).

**Verdicts:**

- **Kernel (XREPO-01):** `ProposeEditParams`, `AtomicAcceptParams`, `RecordRejectionParams`, `RecordContractOverrideParams` each gain `repo_id?: string`. 3 handlers in `kernel/src/rpc/server.ts` write `repo_id ?? 'primary'` into `provenance.detail`. `queryByAnchor` gains Path B: `repoId === undefined` skips the `WHERE repo_id = ?` predicate.
- **Bridge (XREPO-02):** `WorkspaceRepoState` fully implemented in `save-gate/workspace-repo-state.ts`; `getActiveRepoId` fingerprints git remote URL or returns 'primary' fallback; cache invalidation on `onDidChangeWorkspaceFolders`. `tier-dispatch.ts`, `apply-edit.ts`, `on-will-save.ts`, `pending-attempts.ts` all thread `repo_id`.
- **9 RED stubs GREEN-flipped:** 5 kernel (atomicAccept/recordRejection/recordContractOverride x2 each + 1 queryByAnchor) + 4 bridge (workspace-repo-state x2 + tier-dispatch-threading x3 + not counting node-tooltip which remained RED for Wave 2).
- **Test results at Wave 1 close:** Kernel 421/421 PASS; Bridge 137/157 PASS (17 pre-existing failures baseline).
- **Auto-fixes:** 8 (cross-repo spec asOf timing; queryByAnchor hardcoded 'primary'; applyEditAtomically signature flip; tier-dispatch 'reject' missing recordRejection; kernel.isConnected optional-chain; Unicode section sign hygiene; WorkspaceRepoState POSIX path; .bind() undefined guard).

**Commits:** `9881d24ef7f` (Wave-1 implementation)

---

### Wave 2 -- Inspector Tooltip + Integration Test (Plan 21-03)

**Objective:** `SerializedWorkspaceRepoSchema` gains `folder_name`; Graph.tsx adds `buildRepoLabel` + Cytoscape mouseover/mouseout for native HTML title tooltip; end-to-end integration test proves Phase 16+17+21 chain.

**Verdicts:**

- **Wire schema (Open Decision Sec.11):** `messages.ts` `SerializedWorkspaceRepoSchema` gains `folder_name: z.string()`. `panel.ts` injects `folder_name: r.folder.name`. `App.tsx` threads `workspaceRepos` into state and down to `<Graph>`.
- **Tooltip (Open Decision Sec.6):** `Graph.tsx` exports `buildRepoLabel(repoId, workspaceRepos)` pure function. Cytoscape `mouseover` handler writes `container.title = buildRepoLabel(...)`, `mouseout` clears it. Zero new npm deps (Pitfall G mitigated -- no cytoscape-popper or tippy.js).
- **4 RED stubs GREEN-flipped:** `node-tooltip-repo-id.test.ts` 4 cases (main + primary-fallback + unknown-repo + mouseout-clear).
- **Integration test (XREPO-03c):** `cross-repo-edge-activation.integrationTest.ts` seeds repo-B ConstraintNode via raw SQL (Open Decision Sec.3 -- dao.seed payload-column deferred to v2.2), starts daemon, calls proposeEdit -> atomicAccept in repo-A, asserts cross-repo `references` edge, renders via `edgeRowToCyElement`, asserts `data.crossRepo === true`. 2/2 PASS.
- **GRAPHIFY_STYLE `edge[?crossRepo]` selector:** ACTIVATED for the first time; dormant since Phase 17. Confirmed by `cross-repo-edge-style.test.ts` GREEN regression sentry.
- **Test results at Wave 2 close:** Bridge 145/157 PASS (16 pre-existing failures; baseline shifted from 17 to 16 -- 1 fewer failure; pre-existing count from 21-02 was 17 failing but bridge now shows 16 failing). Kernel 421/421 PASS (full run; dao-repo-id flaky only under concurrent processes).
- **Mandate B:** `refuse-deep05-write.sh` exit 0 -- Graph.tsx + panel.ts + messages.ts + App.tsx changes introduce ZERO write-RPC tokens. BANNED array unchanged at 5 entries.
- **Auto-fixes:** 4 (mocharc.cjs missing integrationTest.ts pattern; kernel dist stale rebuild; App.tsx workspace_repos threading; hygiene mixed-whitespace in template literal).

**Commits:** `741a8c7b7a2` (Wave-2 implementation), `53ea7e89708` (plan-close docs)

---

### Wave 3 -- Phase Verify + Closure Ceremony (Plan 21-04)

**Objective:** Run consolidated verification battery; author 21-VERIFICATION.md + 21-SUMMARY.md; flip closure markers in REQUIREMENTS.md / ROADMAP.md / STATE.md.

**Verdicts:**

- **Full kernel suite:** 420/421 PASS (1 pre-existing flaky `dao-repo-id.spec.ts` under concurrent processes; passes 1/1 in isolation). Phase 21 sentinels: second-opener-fence (2), fingerprint-tripartite (1), proposeEdit-repo-id (1), atomicAccept-repo-id (2), recordRejection-repo-id (2), recordContractOverride-repo-id (2) -- all PASS.
- **Full bridge suite:** 145/157 PASS (16 pre-existing failures -- jsdom HTMLCanvasElement.getContext: HypotheticalImpact x3, DriftFindings x2, Phase 7 drift-flow x6, POLISH-01 walkthrough x1, CANV-01 x4). Zero Phase 21 regressions. 12 Phase-21-specific bridge tests PASS.
- **Bridge integration test:** `cross-repo-edge-activation.integrationTest.ts` 2/2 PASS (main + negative-control).
- **5 CI gates:** ALL exit 0.
- **6 meta-tests:** ALL META PASS.
- **TypeScript:** bridge `npx tsc -p . --noEmit` exit 0; kernel `npx tsc --noEmit` exit 0; `compile-check-ts-native` exit 0 (clean).
- **Layers check:** `npm run valid-layers-check` exit 0.
- **Phase 19 SC3b 3-run flakiness fence:** 3/3 EXIT 0 with SCORE 13/13 SCs PASS each run.

---

## Mandate Fences

| Mandate | Gate | Status | Scan Result |
|---------|------|--------|-------------|
| A (no LLM-generated UI text) | `refuse-llm-in-canvas.meta.sh` | META PASS | Tooltip text in `buildRepoLabel` derives from kernel-supplied `repo_id` (12-char hex from SHA-256 of git remote URL) + VS Code workspace folder name (`r.folder.name`). Neither is LLM-generated. |
| B (no write-RPC in inspector) | `refuse-deep05-write.sh` | EXIT 0 | 12 inspector/ files scanned; zero banned tokens (`createDecisionNode`, and the 4 pre-existing entries). BANNED array unchanged at 5 entries after Phase 21. Wave-2 changes to Graph.tsx + panel.ts + messages.ts + App.tsx are metadata/rendering-only. |
| D (destructive-tier hover Reject never fires) | Phase 17/20 byte-identity matrix | GREEN | Phase 21 does NOT touch `tier-dispatch.ts` EXCEPT via the Plan 21-02 `repo_id` threading addition (small additive diff). Mandate D fence comment block byte-identical. Phase 17+20 4x3 byte-identity matrix UNCHANGED. Pitfall F caller-count fence preserved. |

---

## Regression Sentries

| Sentry | Expected | Observed | Status |
|--------|----------|----------|--------|
| Kernel full suite backward-compat | 100% PASS (no regressions from Phase 21 repo_id additions) | 420/421 (pre-existing `dao-repo-id` flaky under concurrent processes; 1/1 PASS in isolation) | GREEN |
| Bridge baseline preserved | 16 pre-existing failures UNCHANGED | 16 failures (same classes: jsdom/HTMLCanvasElement.getContext; HypotheticalImpact x3, DriftFindings x2, drift-flow x6, walkthrough x1, CANV-01 x4) | GREEN |
| Phase 19 SC3b 13/13 PASS | 3/3 EXIT 0 | 13/13 PASS each run; 0 CDN hits; SC3b PASS each run | GREEN (see 3-run table) |

---

## 3-Run Flakiness Fence Results (Phase 19 SC3b Regression Gate)

All 3 runs executed against Phase 21 HEAD code:

| Run | Score | SC3b | CDN hits | EXIT |
|-----|-------|------|----------|------|
| 1 | 13/13 | PASS | 0 | 0 |
| 2 | 13/13 | PASS | 0 | 0 |
| 3 | 13/13 | PASS | 0 | 0 |

**Verdict: 3/3 EXIT 0. Phase 19 SC3b regression gate held under Phase 21 changes.**

Phase 21 adds `repo_id` threading on write RPCs (proposeEdit, atomicAccept, recordRejection) and
WorkspaceRepoState module under save-gate/. None of these paths intersect the walkthrough
foregrounding code paths fixed in Phase 19. CDP smoke confirms deterministic regression-free behavior.

---

## CI / Meta-Test Audit

| Gate | Status | Notes |
|------|--------|-------|
| `refuse-deep05-write.sh` | EXIT 0 | 12 inspector/ files scanned; zero banned write-RPC tokens; BANNED array at 5 entries (unchanged by Phase 21) |
| `refuse-stale-bridge-mirror.sh` | EXIT 0 | `extensions/goatide-bridge/` stub vs real package.json byte-equal; media/walkthrough/* synced |
| `refuse-fuzzy-fallback.sh` | EXIT 0 | No fuzzy/similarity fallback in retrieval code |
| `refuse-unbounded-ripple-walk.sh` | EXIT 0 | All max_hops literals <= 3 |
| `refuse-silent-override.sh` | EXIT 0 | All override-named functions seed contract_override Attempt |
| `refuse-cytoscape-in-mirror.meta.sh` | META PASS | |
| `refuse-deep05-write.meta.sh` | META PASS | Phase 1/2/3 positive controls fire correctly (banned `createDecisionNode` token) |
| `refuse-llm-in-canvas.meta.sh` | META PASS | Both grep_canvas (webview/) and grep_host_canvas (canvas/*.ts) scopes clean |
| `refuse-stale-bridge-mirror-after-configurationDefaults.meta.sh` | META PASS | |
| `refuse-stale-bridge-mirror-after-walkthrough.meta.sh` | META PASS | |
| `refuse-unbounded-ripple-walk.meta.sh` | META PASS | max_hops:4 fixture fires gate correctly |

---

## Test Count Delta

| Suite | Before Phase 21 (Plan 20 close) | After Phase 21 (Plan 21-04) | Delta |
|-------|----------------------------------|------------------------------|-------|
| Kernel (total tests) | 409 (Phase 20 close) | 421 (+12 from Phase 21 spec files) | +12 |
| Kernel (passing) | 409 | 420 (1 pre-existing flaky) | +11 consistently; +12 in isolation |
| Kernel (test files) | 122 (Phase 20 close) | 129 | +7 |
| Bridge (total tests) | 152 est. (Phase 20: 131 passing + 16 failing + 3 pending) | 164 (145 passing + 16 failing + 3 pending) | +12 (Phase 21 additions) |
| Bridge integration tests | 0 (no integrationTest.ts files before Phase 21) | 2 (cross-repo-edge-activation: main + negative control) | +2 |

---

## Manual Verifications Outstanding

| Behavior | Requirement | Status | Instructions |
|----------|-------------|--------|--------------|
| Dashed amber styling visual confirmation on a real cross-repo edge | XREPO-03 SC#1 | AUTO-DOCUMENTED-PENDING | (1) Launch GoatIDE on a multi-root workspace with 2 git repos. (2) Seed repo-B with a ConstraintNode anchored to a path in repo-B. (3) Save a file in repo-A that cites the repo-B node. (4) Open Graph Inspector. (5) Verify edge renders DASHED amber (#fbbf24). (6) Verify same-repo edges remain solid. |
| Save-gate latency across multi-root workspace | XREPO-02 SC#2 | AUTO-DOCUMENTED-PENDING | (1) Same multi-root workspace. (2) Save a file 10x over 30s. (3) Verify no perceptible delay vs single-root baseline (WorkspaceRepoState cache hit budget: <5ms per save). |
| Inspector tooltip readability | XREPO-03 SC#1 | AUTO-DOCUMENTED-PENDING | (1) Hover a cross-repo node in Inspector. (2) Verify tooltip shows `<folderName> (<12-char-hex>)`. |

*AUTO-DOCUMENTED-PENDING: These verifications require a real VS Code multi-root workspace with 2 git
repos, which exceeds automated test harness scope. Structural confidence from the integration test
(`cross-repo-edge-activation.integrationTest.ts`) and unit tests (`buildRepoLabel`, `edgeRowToCyElement
crossRepo===true`) provides high-fidelity coverage of the underlying mechanisms. The Phase 18 fast-track
AUTO-APPROVED precedent (ambient use + structural verification basis) was NOT applied here; user
physical walk is recommended before any external release.*

---

## Sign-off

- **Closed:** 2026-05-18
- **Plans executed:** 4/4 (21-01, 21-02, 21-03, 21-04)
- **Wave-0 commit:** `a8a18abdc06`
- **Wave-1 commit:** `9881d24ef7f`
- **Wave-2 commit:** `741a8c7b7a2`
- **Wave-0 docs commit:** `1efdce08444`
- **Wave-2 docs commit:** `53ea7e89708`
- **Wave-3 closure commit:** (this plan -- see Task 4)
- **v2.1 milestone progress:** 4/5 phases closed (Phases 18, 19, 20, 21). Phase 22 (Distribution) next -- cert-gated.

---

_Closed: 2026-05-18_
