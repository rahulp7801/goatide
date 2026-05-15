---
phase: 16
slug: ripple-cross-repo-migration
status: green
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
closed: 2026-05-15
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `16-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | vitest 2.1 (kernel — migration + DAO + ripple + RPC handler tests) + mocha 11 + jsdom 25 (bridge — webview component tests, KernelClient integration, Mandate B regression) |
| **Config files** | `kernel/vitest.config.ts` (kernel), `src/vs/goatide/extensions/goatide-bridge/.mocharc.cjs` (bridge) — both existing |
| **Quick run command (kernel)** | `cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts src/test/drift/constraint-lift.spec.ts src/test/rpc/constraintLift.spec.ts` |
| **Quick run command (bridge)** | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "constraint.lift\|ConstraintLift\|HypotheticalImpact"` |
| **Full suite — kernel** | `cd kernel && npm test` (~387 today; +~12 after Phase 16) |
| **Full suite — bridge** | `cd src/vs/goatide/extensions/goatide-bridge && npm test` (~109 today; +~8 after Phase 16) |
| **Estimated runtime (Phase 16 subset)** | ~25 s |

---

## Sampling Rate

- **After every task commit:** `cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts src/test/drift/constraint-lift.spec.ts src/test/rpc/constraintLift.spec.ts` (kernel-side tasks) AND `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "constraint.lift\|HypotheticalImpact"` (bridge-side tasks).
- **After every wave merge:** Full kernel suite **and** full bridge suite **and** the existing 5/5 refuse-gate set:
  - `bash scripts/ci/refuse-deep05-write.sh` (Phase 14 gate — must STILL exit 0)
  - `bash scripts/ci/refuse-stale-bridge-mirror.sh` (Phase 12 gate — must STILL exit 0; no Phase 16 bridge `package.json` change)
  - `bash scripts/ci/refuse-cytoscape-in-mirror.meta.sh` (Phase 15 gate — must STILL META PASS)
  - `bash scripts/ci/refuse-unbounded-ripple-walk.sh` (Phase 7 gate — widened in Wave 0 to cover `constraint-lift*.ts`)
  - `bash scripts/test/refuse-unbounded-ripple-walk.meta.sh` (NEW — Wave 0 hermetic positive/negative test for the widening)
- **Before `/gsd:verify-work`:** Full suite green + all gates exit 0 + `node scripts/test/freshclone-smoke-cdp.cjs` 5/5 PASS + manual `sqlite3 ~/.goatide/graph.db ".schema nodes"` shows `repo_id TEXT NOT NULL DEFAULT 'primary'` (SC#3 verbatim).
- **Max feedback latency (Phase 16 subset):** ~30 s.

---

## Per-Task Verification Map

> Task IDs are placeholders (`16-WW-TT`) until the planner assigns them. Each row is locked to a `must_have` in the wave's PLAN.md.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-00-01 | 01 | 0 | DEEP-06 | unit (kernel vitest) | `cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts -t "nodes table"` | ✅ green | ✅ green |
| 16-00-02 | 01 | 0 | DEEP-06 | unit (kernel vitest) | `cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts -t "edges table"` | ✅ green | ✅ green |
| 16-00-03 | 01 | 0 | DEEP-06 | unit (kernel vitest) | `cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts -t "backfill"` | ✅ green | ✅ green |
| 16-00-04 | 01 | 0 | DEEP-06 | unit (kernel vitest) | `cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts -t "indexes"` | ✅ green | ✅ green |
| 16-00-05 | 01 | 0 | DEEP-06 | integration (kernel vitest, `vi.mock('ulid')`) | `cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts -t "namespac"` | ✅ green | ✅ green |
| 16-00-06 | 01 | 0 | DEEP-06 | unit (kernel vitest) | `cd kernel && npm test -- --run src/test/graph/repo-fingerprint.spec.ts` | ✅ green | ✅ green |
| 16-00-07 | 01 | 0 | DEEP-06 | unit (kernel vitest) | `cd kernel && npm test -- --run src/test/graph/queryByRepo.spec.ts` | ✅ green | ✅ green |
| 16-00-08 | 01 | 0 | DEEP-03 | integration (kernel vitest) | `cd kernel && npm test -- --run src/test/drift/constraint-lift.spec.ts` | ✅ green | ✅ green |
| 16-00-09 | 01 | 0 | DEEP-03 | integration (kernel vitest) | `cd kernel && npm test -- --run src/test/rpc/constraintLift.spec.ts` | ✅ green | ✅ green |
| 16-00-10 | 01 | 0 | DEEP-03 / Mandate B | regression (bridge mocha) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "constraint.lift no graph mutation"` | ✅ green | ✅ green |
| 16-00-11 | 01 | 0 | DEEP-03 | unit (bridge mocha) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "KernelClient constraintLift"` | ✅ green | ✅ green |
| 16-00-12 | 01 | 0 | DEEP-03 | unit (bridge jsdom) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "DriftFindings constraint.lift button"` | ✅ green | ✅ green |
| 16-00-13 | 01 | 0 | DEEP-03 | unit (bridge jsdom) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "HypotheticalImpact"` | ✅ green | ✅ green |
| 16-00-14 | 01 | 0 | DEEP-03 / CI gate | meta-test | `bash scripts/test/refuse-unbounded-ripple-walk.meta.sh` | ✅ green | ✅ green |
| 16-00-15 | 01 | 0 | DEEP-06 / regression | unit | `cd kernel && npm test -- --run src/test/graph/migrations.spec.ts` (extended allowlist) | ✅ existing — extend | ✅ green |
| 16-01-01 | 02 | 1 | DEEP-06 | unit (kernel vitest) | `cd kernel && npm test -- --run src/test/graph/queryByRepo.spec.ts` | ✅ green | ✅ green |
| 16-01-02 | 02 | 1 | DEEP-06 | regression (kernel vitest) | `cd kernel && npm test` (back-compat: `queryAsOf`/`queryByAnchor`/`traverse` byte-equal) | ✅ existing | ✅ green |
| 16-01-03 | 02 | 1 | DEEP-03 | integration (kernel vitest) | `cd kernel && npm test -- --run src/test/drift/constraint-lift.spec.ts` | ✅ green | ✅ green |
| 16-01-04 | 02 | 1 | DEEP-03 | integration (kernel vitest) | `cd kernel && npm test -- --run src/test/rpc/constraintLift.spec.ts` | ✅ green | ✅ green |
| 16-01-05 | 02 | 1 | DEEP-03 / Mandate B (kernel) | regression (kernel vitest) | (inside `constraint-lift.spec.ts` — `queryByKind('Attempt')` count invariant) | ✅ green | ✅ green |
| 16-02-01 | 03 | 2 | DEEP-03 | unit (bridge mocha) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "KernelClient constraintLift"` | ✅ green | ✅ green |
| 16-02-02 | 03 | 2 | DEEP-03 / Mandate B (bridge) | regression (bridge mocha) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "constraint.lift no graph mutation"` | ✅ green | ✅ green |
| 16-03-01 | 04 | 3 | DEEP-03 | unit (bridge jsdom) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "DriftFindings constraint.lift button"` | ✅ green | ✅ green |
| 16-03-02 | 04 | 3 | DEEP-03 | unit (bridge jsdom) | `cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "HypotheticalImpact"` | ✅ green | ✅ green |
| 16-04-01 | 05 | 4 | DEEP-03 + DEEP-06 / CI gate | CI gate | `bash scripts/ci/refuse-deep05-write.sh` | ✅ existing — regression | ✅ green |
| 16-04-02 | 05 | 4 | DEEP-03 + DEEP-06 / CI gate | CI gate | `bash scripts/ci/refuse-stale-bridge-mirror.sh` | ✅ existing — regression | ✅ green |
| 16-04-03 | 05 | 4 | DEEP-03 / CI gate | CI gate | `bash scripts/ci/refuse-unbounded-ripple-walk.sh` (widened glob) | ✅ existing — extend | ✅ green |
| 16-04-04 | 05 | 4 | DEEP-06 / SC#5 | smoke | `node scripts/test/freshclone-smoke-cdp.cjs` | ✅ existing — regression | ✅ green |
| 16-04-05 | 05 | 4 | DEEP-06 / SC#3 | manual | `sqlite3 ~/.goatide/graph.db ".schema nodes"` shows `repo_id TEXT NOT NULL DEFAULT 'primary'` | n/a (manual) | ✅ green |

*Status: ✅ green · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Source files to add (stubs/skeletons + the migration body) before any Wave 1+ behavior code:

- [ ] `kernel/src/graph/migrations/0008_cross_repo_identity.sql` — FULL migration body (NOT a stub — the migration IS the contract every downstream test asserts against)
- [ ] `kernel/src/graph/schema/nodes.ts` — add `repo_id: text('repo_id').notNull().default('primary')`
- [ ] `kernel/src/graph/schema/edges.ts` — add same `repo_id` field
- [ ] `kernel/src/graph/repo-fingerprint.ts` — `fingerprint(remoteUrl): string` exported function (real body — 5 lines, SHA-256 hex slice(0,12) with `.git` + trailing-slash + case normalization)
- [ ] `kernel/src/graph/dao.ts` — `queryByRepo` Wave-0 throw-stub `throw new Error('Wave 1 implements - Plan 16-02')` (Phase 14 I1 pattern)
- [ ] `kernel/src/drift/constraint-lift.ts` — Wave-0 stub `export function runConstraintLiftAnalysis(): never { throw new Error('Wave 1 implements'); }` + ConstraintLiftReport/Row interface declarations
- [ ] `kernel/src/drift/ripple.ts` — add `export` keyword to `walkRippleEdges` (one-line surgical change; cited at line 204 in research)
- [ ] `kernel/src/rpc/methods.ts` — `ConstraintLiftRequest` RequestType + params/result Zod types (Wave-0 type only; handler lands Wave 1)
- [ ] `src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts` — bridge mirror types for `ConstraintLiftRequest`
- [ ] `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts` — `constraintLift` Wave-0 throw-stub method (Wave 2 replaces with real `sendWithTimeout`)
- [ ] `src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts` — `hypothetical_impact` + `hypothetical_impact_error` optional fields on `CanvasShowPayloadSchema`; `canvas.requestConstraintLift` discriminator on `WebviewToHostSchema`
- [ ] `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/HypotheticalImpact.tsx` — Wave-0 stub component returning `null`; Wave 3 fills the body

Test files to add (RED-first):

- [ ] `kernel/src/test/graph/migration-cross-repo.spec.ts` — 5 test cases (nodes table_info, edges table_info, backfill='primary', indexes exist, two-repo namespacing via `vi.mock('ulid')`)
- [ ] `kernel/src/test/graph/repo-fingerprint.spec.ts` — 4 test cases (12-hex deterministic; `.git` normalized; trailing-slash normalized; case-insensitive)
- [ ] `kernel/src/test/graph/queryByRepo.spec.ts` — 3 test cases (primary-only filter; bitemporal asOf; empty-repo returns [])
- [ ] `kernel/src/test/drift/constraint-lift.spec.ts` — 6 test cases (ConstraintNode seed walk; maxHops 1|2|3 literal-union; confidence sort Explicit-first; Mandate B `queryByKind('Attempt')` invariant; truncation flag at nodeCap; high-confidence-first secondary sort)
- [ ] `kernel/src/test/rpc/constraintLift.spec.ts` — 3 test cases (RPC composition end-to-end; `requireAuth` fence; Zod result shape)
- [ ] `src/vs/goatide/extensions/goatide-bridge/test/unit/constraint-lift-no-graph-mutation.test.ts` — 5 test cases (full constraintLift flow + `KernelClient.prototype` spy on the 4 banned write RPCs + Attempt-count invariant via mocked kernel)
- [ ] `src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/DriftFindings-constraint-lift-button.test.tsx` — 3 test cases (button renders iff ConstraintNode citation; onClick posts `canvas.requestConstraintLift`; button hidden when no ConstraintNode)
- [ ] `src/vs/goatide/extensions/goatide-bridge/test/unit/canvas/HypotheticalImpact.test.tsx` — 3 test cases (ComplianceReport body renders; "Hypothetical" badge present; "show all" toggle reveals Inferred rows)

CI / meta-test files to add (or extend):

- [ ] `scripts/ci/refuse-unbounded-ripple-walk.sh` — widen regex at line 22 to cover `constraint-lift*.ts` (currently scans `ripple*.ts` only — does NOT cover Phase 16's new file)
- [ ] `scripts/test/refuse-unbounded-ripple-walk.meta.sh` — NEW hermetic positive/negative meta-test (sibling to `refuse-deep05-write.meta.sh` single-line META PASS pattern)
- [ ] `kernel/src/test/graph/migrations.spec.ts` — extend `sqlite_master` allowlist with `nodes_repo_id` + `edges_repo_id` index entries (existing file; non-empty edit)

Package edits — **NONE.** No bridge `package.json` change (Phase 15 already added `cytoscape`/`cytoscape-fcose` + `goatide.openGraphInspector`; Phase 16 adds nothing). No new kernel dep (`crypto` is Node built-in). `refuse-stale-bridge-mirror.sh` exit 0 throughout.

### Wave 0 spikes (de-risk before Wave 1)

- [ ] **Spike A — backfill semantics:** Manually run `ALTER TABLE nodes ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary'` against a populated dev `~/.goatide/graph.db`; confirm `SELECT COUNT(*) FROM nodes WHERE repo_id = 'primary'` matches total row count. Expected: PASS (SQLite 3.42+ behavior; better-sqlite3 12.9.0 bundles SQLite 3.46.x). De-risks the migration.
- [ ] **Spike B — vi.mock('ulid') hoisting:** Write 5-line stub that mocks `ulid` to return a constant; assert `dao.seed()` returns that ID. De-risks the collision-prevention test (#5).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `sqlite3 ~/.goatide/graph.db ".schema nodes"` displays `repo_id TEXT NOT NULL DEFAULT 'primary'` | DEEP-06 SC#3 (verbatim) | Live-DB inspection in a real dev/install environment after the migration has run | After Wave 1 lands, launch GoatIDE (working-launch recipe), trigger any save so kernel boots and applies migrations, then in a separate terminal: `sqlite3 ~/.goatide/graph.db ".schema nodes"`. Verify the column appears with the exact `NOT NULL DEFAULT 'primary'` clause. Repeat for `.schema edges` and `.indices nodes`. |
| "Hypothetical Impact" section visual polish — distinct from live ComplianceReport | DEEP-03 SC#1 | Pixel-level color + spacing only human-evaluable | Open Canvas on a save touching a ConstraintNode-anchored file; click "What would break if this constraint is lifted?"; verify the section is visually distinct from the live ComplianceReport (different color treatment, "Hypothetical" badge present, depth radio renders 1/2/3, "show all" toggle functions). |
| `INDEX nodes_repo_id` query plan uses the index | DEEP-06 SC#4 | EXPLAIN QUERY PLAN output is informational; not failure-critical for the column-existence assertion | After Wave 1 lands, run `EXPLAIN QUERY PLAN SELECT * FROM nodes WHERE repo_id = 'primary'` via sqlite3 CLI; verify plan mentions `USING INDEX nodes_repo_id`. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or explicit Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (11 source files + 8 test files + 3 CI/meta files)
- [ ] No watch-mode flags in any command
- [ ] Feedback latency < 30s (constraint-lift subset)
- [ ] `nyquist_compliant: true` set in frontmatter after planner reconciles task IDs

**Approval:** APPROVED 2026-05-15 — Phase 16 closed (DEEP-03 + DEEP-06 phase-A GREEN)
