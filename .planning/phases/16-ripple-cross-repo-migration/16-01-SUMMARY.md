---
phase: 16-ripple-cross-repo-migration
plan: 01
subsystem: database
tags: [sqlite, drizzle, ripple-analysis, cross-repo, constraint-lift, sha256, wave-0-scaffold]

# Dependency graph
requires:
  - phase: 15-graph-inspector-panel
    provides: QueryGraphSnapshot + QueryTimelineTransitions RPC types, inspector/ dir + refuse-deep05-write.sh CI gate
  - phase: 14-foundation-rpcs
    provides: ReadonlyKernelClient pattern, Wave-0 I1 throw-stub pattern, requireAuth wrapper
provides:
  - Migration 0008_cross_repo_identity.sql — repo_id column on nodes + edges, nodes_repo_id + edges_repo_id indexes
  - repo-fingerprint.ts — 12-char SHA-256 hex fingerprint helper (collision-resistant, security boundary)
  - dao.queryByRepo Wave-0 throw-stub (Wave 1 fills body)
  - walkRippleEdges exported from ripple.ts for constraint-lift.ts sibling import
  - constraint-lift.ts Wave-0 stub with RunConstraintLiftInput + ConstraintLiftRow + ConstraintLiftResult interfaces
  - ConstraintLiftRequest + ConstraintLiftParams + ConstraintLiftResult wire types in kernel/src/rpc/methods.ts
  - Bridge mirror types (methods.ts) + KernelClient.constraintLift Wave-0 throw-stub
  - CanvasShowPayloadSchema gains hypothetical_impact + hypothetical_impact_error optional fields
  - WebviewToHostSchema gains canvas.requestConstraintLift discriminator
  - HypotheticalImpact.tsx Wave-0 stub component
  - 8 RED test files (5 kernel + 3 bridge) with locked case-name strings per VALIDATION.md
  - migrations.spec.ts allowlist extended with nodes_repo_id + edges_repo_id index entries
  - refuse-unbounded-ripple-walk.sh widened to cover constraint-lift*.ts
  - New refuse-unbounded-ripple-walk.meta.sh hermetic positive/negative meta-test
affects: [16-02, 16-03, 16-04, 16-05, 17-cross-repo-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 I1 throw-stub pattern: throw new Error('Wave N implements - Plan NN-NN') for all un-implemented bodies"
    - "repo_id = fingerprint(remoteUrl) as canonical repoId — never raw URL in SQL"
    - "refuse-unbounded-ripple-walk.sh: widened regex covers both ripple*.ts and constraint-lift*.ts"
    - "Meta-test pattern: hermetic positive+negative round-trip with git add/rm temp fixture"

key-files:
  created:
    - kernel/src/graph/migrations/0008_cross_repo_identity.sql
    - kernel/src/graph/repo-fingerprint.ts
    - kernel/src/drift/constraint-lift.ts
    - kernel/src/test/graph/repo-fingerprint.spec.ts
    - kernel/src/test/graph/migration-cross-repo.spec.ts
    - kernel/src/test/graph/queryByRepo.spec.ts
    - kernel/src/test/drift/constraint-lift.spec.ts
    - kernel/src/test/rpc/constraintLift.spec.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/HypotheticalImpact.tsx
    - src/vs/goatide/extensions/goatide-bridge/test/unit/constraint-lift-no-graph-mutation.test.ts
    - src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/DriftFindings-constraint-lift-button.test.tsx
    - src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/HypotheticalImpact.test.tsx
    - scripts/test/refuse-unbounded-ripple-walk.meta.sh
  modified:
    - kernel/src/graph/schema/nodes.ts
    - kernel/src/graph/schema/edges.ts
    - kernel/src/graph/dao.ts
    - kernel/src/drift/ripple.ts
    - kernel/src/rpc/methods.ts
    - kernel/src/rpc/index.ts
    - kernel/src/test/graph/migrations.spec.ts
    - kernel/src/graph/migrations/meta/_journal.json
    - src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts
    - src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts
    - scripts/ci/refuse-unbounded-ripple-walk.sh

key-decisions:
  - "drizzle _journal.json requires explicit entry for new migration — openDatabase migrator reads journal to discover SQL files; adding 0008_cross_repo_identity.sql without the journal entry caused the migration to be skipped"
  - "HypotheticalImpact.tsx uses ComplianceReportForCanvas (exported type alias) not ComplianceReportSchema (unexported const) — avoids TS2459 compile error"
  - "Spike A PASS: SQLite 3.46.x ALTER TABLE ADD COLUMN NOT NULL DEFAULT backfills existing rows automatically"
  - "Spike B PASS: vi.mock('ulid') hoisting confirmed in vitest"
  - "Wave-0 RED test contract: expect().toThrow('Wave 1 implements') is the correct RED-first discipline for throw-stub-backed tests; tests pass at Wave-0 because the throw is the contract"

requirements-completed: [DEEP-03, DEEP-06]

# Metrics
duration: 21min
completed: 2026-05-14
---

# Phase 16 Plan 01: Wave-0 Migration + Fingerprint + Stubs Summary

**0008_cross_repo_identity.sql migration + SHA-256 repo-fingerprint helper + Wave-0 throw-stubs for DEEP-03 constraint-lift + DEEP-06 queryByRepo + bridge mirror types + 8 RED test files + widened CI gate**

## Performance

- **Duration:** 21 min
- **Started:** 2026-05-14T21:00:00Z
- **Completed:** 2026-05-14T21:21:00Z
- **Tasks:** 5
- **Files modified:** 25 (13 new + 12 modified)

## Accomplishments

- Migration 0008_cross_repo_identity.sql landed with 4-statement body: ALTER nodes + ALTER edges ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary' + CREATE INDEX IF NOT EXISTS nodes_repo_id + edges_repo_id. Drizzle _journal.json entry added. 2/2 migrations.spec.ts GREEN.
- Real 12-char SHA-256 fingerprint helper (node:crypto, no new dep) with URL normalization (lowercase + strip .git + strip trailing slash). 4/4 fingerprint tests GREEN.
- 8 RED test files (5 kernel + 3 bridge) with locked VALIDATION.md case-name strings. Wave-0 RED contract = throw-stub correctly throws; Wave 1/2/3 GREEN-flips replace throw assertions with real behavior assertions.
- refuse-unbounded-ripple-walk.sh widened to cover constraint-lift*.ts; hermetic META PASS meta-test added.
- Bridge tsc compile passes (additive type extensions), bridge mirror byte-equal, refuse-deep05-write.sh exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 0008 + drizzle schema + migrations.spec.ts** - `8421cc7874c` (feat)
2. **Task 2: repo-fingerprint.ts real body + 4 GREEN tests** - `a10800df961` (feat)
3. **Task 3: Kernel Wave-0 throw-stubs + ripple export + RPC types + RED scaffolding** - `e03bfe2b1d0` (feat)
4. **Task 4: Bridge Wave-0 stubs + schema additions + HypotheticalImpact + 3 RED suites** - `0679f656f22` (feat)
5. **Task 5: Widen refuse-unbounded-ripple-walk gate + hermetic meta-test** - `8130ecfa367` (feat)

## Files Created/Modified

- `kernel/src/graph/migrations/0008_cross_repo_identity.sql` - 4-statement migration body (ALTER nodes + edges + CREATE INDEX)
- `kernel/src/graph/migrations/meta/_journal.json` - Added idx=8 entry for 0008_cross_repo_identity
- `kernel/src/graph/schema/nodes.ts` - repo_id field with .notNull().default('primary')
- `kernel/src/graph/schema/edges.ts` - symmetric repo_id field
- `kernel/src/graph/repo-fingerprint.ts` - export function fingerprint(remoteUrl): string (SHA-256, 12 hex chars)
- `kernel/src/graph/dao.ts` - queryByRepo Wave-0 throw-stub
- `kernel/src/drift/ripple.ts` - export keyword added to walkRippleEdges at line 204
- `kernel/src/drift/constraint-lift.ts` - Wave-0 stub: 3 interfaces + runConstraintLiftAnalysis throw-stub
- `kernel/src/rpc/methods.ts` - ConstraintLiftParams + ConstraintLiftResult + ConstraintLiftRequest
- `kernel/src/rpc/index.ts` - ConstraintLiftRequest + types exported from barrel
- `kernel/src/test/graph/migrations.spec.ts` - allowlist extended (nodes_repo_id + edges_repo_id)
- `scripts/ci/refuse-unbounded-ripple-walk.sh` - regex widened to (ripple|constraint-lift)
- `scripts/test/refuse-unbounded-ripple-walk.meta.sh` - NEW executable hermetic meta-test (META PASS)
- Bridge: methods.ts + client.ts + canvas/messages.ts + HypotheticalImpact.tsx + 3 RED test files

## Decisions Made

- Drizzle _journal.json requires explicit entry for new migration — the migrator reads journal to discover SQL files. Adding 0008_cross_repo_identity.sql without the journal entry caused the migration to be silently skipped. Fix: added idx=8 entry in _journal.json.
- HypotheticalImpact.tsx uses `ComplianceReportForCanvas` (exported type alias) not `ComplianceReportSchema` (unexported const) — avoids TS2459 compile error. The plan body's `import type { ComplianceReportSchema }` would fail.
- Spike A PASS: SQLite 3.46.x ALTER TABLE ADD COLUMN NOT NULL DEFAULT 'primary' correctly backfills 2/2 existing rows to 'primary'. Confirmed before commit.
- Wave-0 RED test contract: tests that call `expect(() => stub()).toThrow('Wave 1 implements')` pass at Wave-0 because the throw IS the contract. Wave 1 replaces those assertions with real behavior assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drizzle migrator skipped 0008 migration — _journal.json entry missing**
- **Found during:** Task 1 verification (migrations.spec.ts failed: nodes_repo_id index not found)
- **Issue:** Drizzle's migrate() reads `meta/_journal.json` entries to discover SQL files. The file was created but not registered in the journal, so the migration was never applied to fresh temp DBs in tests.
- **Fix:** Added `{"idx": 8, "version": "6", "when": 1778817578000, "tag": "0008_cross_repo_identity", "breakpoints": true}` to _journal.json.
- **Files modified:** kernel/src/graph/migrations/meta/_journal.json
- **Verification:** migrations.spec.ts exits 0 (2/2 GREEN) after the fix.
- **Committed in:** 8421cc7874c (Task 1 commit)

**2. [Rule 1 - Bug] HypotheticalImpact.tsx type error — ComplianceReportSchema not exported**
- **Found during:** Task 4 bridge tsc check (`npx tsc -p . --noEmit`)
- **Issue:** Plan body's `import type { ComplianceReportSchema } from '../messages.js'` failed with TS2459 — ComplianceReportSchema is declared as `const` (not exported). The type `z.infer<typeof ComplianceReportSchema>` is not accessible.
- **Fix:** Changed to `import type { ComplianceReportForCanvas } from '../messages.js'` (the exported type alias). Also updated HypotheticalImpact.test.tsx to use `ComplianceReportForCanvas`.
- **Files modified:** src/.../HypotheticalImpact.tsx, src/.../HypotheticalImpact.test.tsx
- **Verification:** `npx tsc -p . --noEmit` exits 0 (no errors).
- **Committed in:** 0679f656f22 (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 Bug)
**Impact on plan:** Both fixes required for correctness. No scope creep. Plan artifacts match spec.

## Issues Encountered

None beyond the 2 auto-fixed bugs above.

## Next Phase Readiness

- Wave 1 (Plan 16-02): dao.queryByRepo real body + runConstraintLiftAnalysis real body + kernel RPC handler registration in server.ts. RED tests from this plan GREEN-flip.
- Wave 2 (Plan 16-03): bridge KernelClient.constraintLift real sendWithTimeout body. Mandate B spy tests GREEN-flip.
- Wave 3 (Plan 16-04): HypotheticalImpact.tsx real render + DriftFindings constraint-lift button + canvas.requestConstraintLift wiring. UI RED tests GREEN-flip.
- All CI gates pass: refuse-stale-bridge-mirror exit 0, refuse-deep05-write exit 0, refuse-unbounded-ripple-walk exit 0, meta-test META PASS.

## Self-Check: PASSED

All 5 task commits verified: 8421cc7874c a10800df961 e03bfe2b1d0 0679f656f22 8130ecfa367.
All 17 created/modified files confirmed present on disk.
CI gates: refuse-stale-bridge-mirror exit 0, refuse-deep05-write exit 0, refuse-unbounded-ripple-walk exit 0, META PASS.

---
*Phase: 16-ripple-cross-repo-migration*
*Completed: 2026-05-14*
