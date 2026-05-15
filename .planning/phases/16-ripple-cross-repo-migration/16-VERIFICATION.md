---
phase: 16-ripple-cross-repo-migration
verified: 2026-05-15
status: green
nyquist_compliant: true
wave_0_complete: true
gsd_verifier_audit: 2026-05-14
gsd_verifier_status: passed
---

# Phase 16 — Verification Log

> Wave-by-wave evidence log for Phase 16: Ripple Analysis + Cross-Repo Schema Migration.
> Captures commands run, exit codes, test counts, gap counts.
> Mirror structure of 15-VERIFICATION.md verbatim — wave-by-wave evidence + success-criteria matrix + pitfall-fence audit + gap log section.

---

## Verification Battery Summary

| Gate | Result | Detail |
|------|--------|--------|
| Kernel test suite | PASS | 119 files / 406 tests |
| Bridge test suite | PASS | 120 passing / 3 pending / 0 failing |
| Bridge TypeScript compile | PASS | exit 0 |
| Bridge build (esbuild) | PASS | exit 0 |
| Kernel build (tsc + cpSync) | PASS | exit 0 (after Rule 1 auto-fix) |
| refuse-deep05-write.sh | PASS | exit 0 |
| refuse-silent-override.sh | PASS | exit 0 |
| refuse-fuzzy-fallback.sh | PASS | exit 0 |
| refuse-stale-bridge-mirror.sh | PASS | exit 0 |
| refuse-unbounded-ripple-walk.sh | PASS | exit 0 |
| refuse-deep05-write.meta.sh | META PASS | exit 0 |
| refuse-cytoscape-in-mirror.meta.sh | META PASS | exit 0 |
| refuse-unbounded-ripple-walk.meta.sh | META PASS | exit 0 |
| SC#5 freshclone-smoke-cdp.cjs | PASS | 5/5 assertions |
| SC#3 migration file | PASS | file exists |
| SC#3 migration body | PASS | 4/4 canonical statements |
| SC#4 queryByRepo | PASS | 2 occurrences in dao.ts |
| SC#4 queryByAnchor repoId | PASS | 8 occurrences in dao.ts |
| Manual SC#3 sqlite3 schema | CHECKPOINT | (human-verify task) |

---

## Auto-fix Applied (Rule 1 - Bug)

**Kernel build tsc error: `confidence_band` not on `ComplianceRow` type**

During `npm run build` in kernel/, `tsc` reported TS2339 errors in `constraint-lift.spec.ts`:
```
src/test/drift/constraint-lift.spec.ts(148,22): error TS2339: Property 'confidence_band'
does not exist on type '{ kind: ... node_id: string; ... }'
```

**Root cause:** `runConstraintLiftAnalysis` returned `ConstraintLiftResult` with `hypothetical_impact: ComplianceReport` (bucket type = `ComplianceRow[]`). `ConstraintLiftRow` extends `ComplianceRow` and adds `confidence_band`, but the type was lost in the return type annotation.

**Fix applied:** Introduced `ConstraintLiftReport` interface (extends `Omit<ComplianceReport, 'definitely_affected' | 'potentially_affected'>` with readonly `ConstraintLiftRow[]` buckets) and renamed the local result type to `ConstraintLiftAnalysisResult` to avoid clash with the wire type in `rpc/methods.ts`. Server handler uses a type cast (`as unknown as ConstraintLiftResult`) since the wire type serializes to JSON (readonly is irrelevant at the boundary). The RUNTIME behavior was always correct — vitest tests passed because the objects DO have `confidence_band`. This fixes the tsc build.

**Files modified:** `kernel/src/drift/constraint-lift.ts`, `kernel/src/rpc/server.ts`

---

## Wave 0 — Migration + Fingerprint + Stubs (Plan 16-01)

**Commit:** `8421cc7874c`, `a10800df961`, `e03bfe2b1d0`, `0679f656f22`, `8130ecfa367`

### Tests

```
cd kernel && npm test -- --run src/test/graph/migrations.spec.ts
 ✓ src/test/graph/migrations.spec.ts (2 tests) 165ms
```

```
cd kernel && npm test -- --run src/test/graph/repo-fingerprint.spec.ts
 ✓ src/test/graph/repo-fingerprint.spec.ts (4 tests) 5ms
```

Migration file check:
```
test -f kernel/src/graph/migrations/0008_cross_repo_identity.sql && echo "SC#3 migration file: PASS"
SC#3 migration file: PASS
```

Migration body check (4 canonical statements):
```
grep -E "ALTER TABLE nodes ADD COLUMN repo_id|ALTER TABLE edges ADD COLUMN repo_id|CREATE INDEX.*nodes_repo_id|CREATE INDEX.*edges_repo_id" kernel/src/graph/migrations/0008_cross_repo_identity.sql | wc -l
4
```

CI gate — refuse-unbounded-ripple-walk.sh (Wave 0 widening):
```
bash scripts/ci/refuse-unbounded-ripple-walk.sh
Phase-7 unbounded-ripple-walk gate ok — every max_hops literal in kernel/src/drift/(ripple|constraint-lift)*.ts is <= 3.
Exit: 0
```

Meta-test — refuse-unbounded-ripple-walk.meta.sh (Wave 0 new):
```
bash scripts/test/refuse-unbounded-ripple-walk.meta.sh
  OK: gate exited 0 on clean state
  OK: gate exited 1 on max_hops:4 fixture (PASS)
META PASS
Exit: 0
```

**Wave 0 status: PASS**

---

## Wave 1 — dao.queryByRepo + runConstraintLiftAnalysis Bodies (Plan 16-02)

**Commit:** `0e62b0885be`, `6e900d566ed`, `fb9a393cf63`

### Tests

```
cd kernel && npm test -- --run src/test/graph/queryByRepo.spec.ts
 ✓ src/test/graph/queryByRepo.spec.ts (3 tests) 94ms
```

```
cd kernel && npm test -- --run src/test/graph/migration-cross-repo.spec.ts
 ✓ src/test/graph/migration-cross-repo.spec.ts (5 tests) 138ms
```

```
cd kernel && npm test -- --run src/test/drift/constraint-lift.spec.ts
 ✓ src/test/drift/constraint-lift.spec.ts (6 tests) 186ms
```

```
cd kernel && npm test -- --run src/test/rpc/constraintLift.spec.ts
 ✓ src/test/rpc/constraintLift.spec.ts (3 tests) 100ms
```

Sentry specs (back-compat regression):
```
cd kernel && npm test -- --run src/test/graph/as-of.spec.ts src/test/graph/query-by-anchor.spec.ts src/test/graph/traverse.spec.ts src/test/graph/traverse-smoke.spec.ts
 ✓ src/test/graph/as-of.spec.ts (2 tests) 62ms
 ✓ src/test/graph/query-by-anchor.spec.ts (4 tests) 220ms
 ✓ src/test/graph/traverse.spec.ts (7 tests)
 ✓ src/test/graph/traverse-smoke.spec.ts (4 tests) 246ms
```

Full kernel suite:
```
cd kernel && npm test
 Test Files  119 passed (119)
       Tests  406 passed (406)
   Duration  283.18s
Exit: 0
```

SC#4 verifications:
```
grep -n "queryByRepo" kernel/src/graph/dao.ts | wc -l
2  (≥1 — PASS)

grep -n "repoId" kernel/src/graph/dao.ts | wc -l
8  (≥1 for extended queryByAnchor — PASS)
```

**Wave 1 status: PASS**

---

## Wave 2 — Bridge Transport (Plan 16-03)

**Commit:** `c822ccb4ffe`, `861c8604842`, `7cc5cce1d8b`

### Tests

```
cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "constraint.lift no graph mutation"
  5 passing
Exit: 0
```

```
cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "KernelClient constraintLift"
  passing
Exit: 0
```

CI gates:
```
bash scripts/ci/refuse-deep05-write.sh
DEEP-05 inspector-write gate ok — no banned write-RPC tokens in src/vs/goatide/extensions/goatide-bridge/src/inspector (10 file(s) scanned).
Exit: 0

bash scripts/ci/refuse-stale-bridge-mirror.sh
OK: bridge mirror in sync (stub vs real package.json, byte-equal across all fields)
Exit: 0
```

**Wave 2 status: PASS**

---

## Wave 3 — Webview UI (Plan 16-04)

**Commit:** `2fd84176ce3`, `4c239fd24cc`, `ac7af7cb022`

### Tests

```
cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "DriftFindings constraint.lift button"
  3 passing
Exit: 0
```

```
cd src/vs/goatide/extensions/goatide-bridge && npm test -- --grep "HypotheticalImpact"
  3 passing
Exit: 0
```

Full bridge suite:
```
cd src/vs/goatide/extensions/goatide-bridge && npm test
  120 passing (37s)
  3 pending
  0 failing
Exit: 0
```

Bridge TypeScript compile:
```
cd src/vs/goatide/extensions/goatide-bridge && npx tsc -p . --noEmit
Exit: 0
```

Bridge build (esbuild):
```
cd src/vs/goatide/extensions/goatide-bridge && npm run build
  dist\canvas\index.js  32.3mb
  Done in 519ms
Exit: 0
```

**Wave 3 status: PASS**

---

## Wave 4 — Phase Verify (Plan 16-05)

**Plan 16-05 Task 1 execution date:** 2026-05-15

### 5 CI Gates

| Gate | Command | Result |
|------|---------|--------|
| refuse-deep05-write.sh | `bash scripts/ci/refuse-deep05-write.sh` | Exit 0 — 10 file(s) scanned, no violations |
| refuse-silent-override.sh | `bash scripts/ci/refuse-silent-override.sh` | Exit 0 — 17 file(s) scanned, ok |
| refuse-fuzzy-fallback.sh | `bash scripts/ci/refuse-fuzzy-fallback.sh` | Exit 0 — no fuzzy/similarity fallback |
| refuse-stale-bridge-mirror.sh | `bash scripts/ci/refuse-stale-bridge-mirror.sh` | Exit 0 — bridge mirror byte-equal |
| refuse-unbounded-ripple-walk.sh | `bash scripts/ci/refuse-unbounded-ripple-walk.sh` | Exit 0 — all max_hops <= 3 |

**All 5 CI gates: PASS**

### 3 Meta-Tests

| Meta-test | Command | Result |
|-----------|---------|--------|
| refuse-deep05-write.meta.sh | `bash scripts/test/refuse-deep05-write.meta.sh` | META PASS — exit 0 |
| refuse-cytoscape-in-mirror.meta.sh | `bash scripts/test/refuse-cytoscape-in-mirror.meta.sh` | META PASS — exit 0 |
| refuse-unbounded-ripple-walk.meta.sh | `bash scripts/test/refuse-unbounded-ripple-walk.meta.sh` | META PASS — exit 0 |

**All 3 meta-tests: META PASS**

### SC#5 Freshclone Smoke

```
node scripts/test/freshclone-smoke-cdp.cjs
[freshclone-smoke-cdp] SC#5 assert 2/4: workbench-dev.html PASS
[freshclone-smoke-cdp] SC#5 assert 1/4: title PASS (GoatIDE Dev)
[freshclone-smoke-cdp] SC#5 assert 3/4: kernel.lock PASS
[freshclone-smoke-cdp] SC#5 assert 4/4: goatide.setSessionPriority command contribution PASS
[freshclone-smoke-cdp] SC10-1/SC10-3: all 6 bridge commands declared in contributes.commands
[freshclone-smoke-cdp] SC10-5: renderer.log clean (zero [error] from goatide-bridge over 40s steady-state)
[freshclone-smoke-cdp] SC13-4 (a): no NODE_MODULE_VERSION mismatch in renderer.log PASS
[freshclone-smoke-cdp] SC13-4 (b): no kernel-degraded banner in workbench DOM PASS
[freshclone-smoke-cdp] SC#5: all 5 assertions PASS (SC13-4 kernel-health gate live)
```

**SC#5 freshclone-smoke: 5/5 PASS**

---

## Mandate B 4-Layer Defense Audit

| Layer | Verification | Result |
|-------|-------------|--------|
| Layer 1: kernel queryByKind('Attempt') invariant | `grep -n "queryByKind('Attempt')" kernel/src/test/drift/constraint-lift.spec.ts | wc -l` = 2 (≥2 before+after assertions) | PASS |
| Layer 2: bridge KernelClient.prototype spy | `grep -n "KernelClient.prototype.atomicAccept" .../constraint-lift-no-graph-mutation.test.ts | wc -l` = 1 (≥1) | PASS |
| Layer 3: webview conditional render (button hidden when no ConstraintNode) | `grep -n "DriftFindings constraint.lift button hidden when no ConstraintNode" .../DriftFindings-constraint-lift-button.test.tsx | wc -l` = 1 | PASS |
| Layer 4: refuse-deep05-write.sh structural gate | exit 0 (CI gate sweep above) | PASS |

**Mandate B 4-layer defense: ALL PASS**

---

## Pitfall 1 (REC-03 Single-Snapshot) Four-Layer Audit

| Layer | Command | Result |
|-------|---------|--------|
| Kernel handler region (lines 291-303): zero Date.now/new Date in executable code | Confirmed by code inspection — no `Date.now()` or `new Date()` in the constraint-lift handler body | PASS — 0 code-level hits |
| Bridge panel.ts canvas.requestConstraintLift branch | 1 defensive `new Date().toISOString()` fallback allowed when `lp.graph_snapshot_tx_time` is null (first-open degraded path); comment lines mention the pattern | PASS — ≤1 code hit |
| Webview HypotheticalImpact.tsx / DriftFindings.tsx: zero asOf Date.now/new Date | `grep -E "new Date\|Date\.now" ...HypotheticalImpact.tsx ...DriftFindings.tsx` = 0 code lines (HypotheticalImpact has only a comment) | PASS — 0 code hits |
| Webview App.tsx: existing Date.now() for latency measurement only | `showStartMsRef.current = Date.now()` + `latencyMs = Date.now() - startMs` are pre-existing accept-latency measurement (not asOf). No new Date.now() for asOf in Phase 16 files | PASS — no new asOf Date.now |

**Pitfall 1 four-layer audit: ALL PASS**

---

## SC#3 Inline Verification

```bash
# Migration file exists
test -f kernel/src/graph/migrations/0008_cross_repo_identity.sql && echo "SC#3 migration file: PASS"
SC#3 migration file: PASS

# Migration body has 4 canonical statements
grep -E "ALTER TABLE nodes ADD COLUMN repo_id|ALTER TABLE edges ADD COLUMN repo_id|CREATE INDEX.*nodes_repo_id|CREATE INDEX.*edges_repo_id" kernel/src/graph/migrations/0008_cross_repo_identity.sql | wc -l
4  (expected: 4) — PASS

# Dist migration file exists after kernel build
test -f kernel/dist/graph/migrations/0008_cross_repo_identity.sql && echo "dist migration: PASS"
dist migration: PASS
```

**SC#3 automated checks: PASS**

Note: ROADMAP originally referenced `0007_cross_repo_identity.sql` — reconciled to `0008_cross_repo_identity.sql` in this Wave-4 phase-close (Risk §1 deferred reconciliation). `0007_contract_overrides_metric.sql` already existed from Phase 7 DRIFT-06.

---

## SC#4 Inline Verification

```bash
grep -n "queryByRepo" kernel/src/graph/dao.ts | wc -l
2  (≥1 — PASS: declaration + call)

grep -n "repoId" kernel/src/graph/dao.ts | wc -l
8  (≥1 for queryByAnchor extended signature — PASS)
```

**SC#4 automated checks: PASS**

---

## Success Criteria Matrix

| SC | Description | Status |
|----|-------------|--------|
| SC#1 | DriftFindings "What would break?" button + HypotheticalImpact UI + no graph writes (Mandate B) | Automated PASS (tests) + CHECKPOINT human-verify |
| SC#2 | Depth 1/2/3 default 3 + confidence_threshold filter + high-confidence-first + show-all toggle | Automated PASS (tests: constraint-lift.spec.ts + HypotheticalImpact.test.tsx) |
| SC#3 | Migration 0008_cross_repo_identity.sql with `repo_id TEXT NOT NULL DEFAULT 'primary'` | Automated PASS (file + body checks) + CHECKPOINT manual sqlite3 .schema |
| SC#4 | queryByRepo('primary', asOf) + INDEX nodes_repo_id + queryByAnchor implicit-primary | Automated PASS (queryByRepo.spec.ts 3/3 + dao.ts grep counts) |
| SC#5 | freshclone-smoke-cdp.cjs 5/5 (migration backward-compatible; kernel-boot unaffected) | PASS |

---

## Gap Log

**No blocking gaps found.** One auto-fix applied:

- **[Rule 1 - Bug] Kernel tsc `confidence_band` type error** — `ConstraintLiftAnalysisResult.hypothetical_impact` typed as `ComplianceReport` (base type) while tests correctly accessed `confidence_band` (ConstraintLiftRow field). Fixed by introducing `ConstraintLiftReport` with properly-typed buckets + renaming local result type. Runtime behavior was always correct (vitest passed). Build now exits 0.

---

## Verification Completed

- **Date:** 2026-05-15
- **Kernel suite:** 119 files / 406 tests PASS (exit 0)
- **Bridge suite:** 120 passing / 3 pending / 0 failing (exit 0)
- **CI gates:** 5/5 exit 0
- **Meta-tests:** 3/3 META PASS
- **Freshclone smoke:** 5/5 assertions PASS
- **Phase close commit:** pending (Task 3)

---

## Goal-Backward Audit (gsd-verifier)

**Audit date:** 2026-05-14
**Auditor:** Claude (gsd-verifier)
**Re-verification:** No — this is the first goal-backward audit (wave-by-wave evidence above was produced by the Plan 16-05 executor)

### Phase 16 Goal Statement

> Land the constraint-lift ripple impact RPC (DEEP-03) and the cross-repo schema migration phase-A (DEEP-06): `0008_cross_repo_identity.sql` adding `repo_id TEXT NOT NULL DEFAULT 'primary'` to nodes + edges with backfill; `queryByRepo()` DAO method; `repo-fingerprint.ts` helper; constraint-lift kernel handler + bridge transport + Hypothetical Impact webview UI + DriftFindings "What would break if this constraint is lifted?" button.

---

### 1. Requirement Coverage: DEEP-03 and DEEP-06

#### DEEP-03 — Constraint-Lift Ripple Impact RPC

**REQUIREMENTS.md status:** Confirmed closed. Traceability index entry reads:
`DEEP-03 | 16 | Closed 2026-05-15` with 13 closure commit hashes.

The Open block lists only `DEEP-06 phase-B` as pending; DEEP-03 is absent from Open, present in the Phase 16 Closed section with full prose and commits.

**Implementation files verified on disk:**

| File | Exists | Substantive | Assessment |
|------|--------|-------------|------------|
| `kernel/src/drift/constraint-lift.ts` | Yes | Yes — 197 lines; `runConstraintLiftAnalysis`, `ConstraintLiftRow`, `ConstraintLiftReport`, `ConstraintLiftAnalysisResult` interfaces; BFS walk, bucket sort, confidence_score | VERIFIED |
| `kernel/src/rpc/server.ts` (handler) | Yes | Yes — `connection.onRequest(ConstraintLiftRequest, requireAuth(...))` at line 291; reads `params.asOf`, calls `runConstraintLiftAnalysis`, returns result | VERIFIED |
| `src/.../client.ts` | Yes | Yes — `constraintLift()` at line 414 returns `this.sendWithTimeout(ConstraintLiftRequest, params)` | VERIFIED |
| `src/.../panel.ts` (handler) | Yes | Yes — `registerConstraintLiftHandler` at line 241; `canvas.requestConstraintLift` dispatch at line 407 with asOf from `lastPayload.graph_snapshot_tx_time` | VERIFIED |
| `src/.../DriftFindings.tsx` | Yes | Yes — conditional button at lines 103-112; renders when `constraintLiftEligible && constraintCitation !== null`; `onConstraintLiftClick` calls `rpc.postConstraintLiftRequest` | VERIFIED |
| `src/.../HypotheticalImpact.tsx` | Yes | Yes — 97 lines; real body with Hypothetical badge, depth radio (1/2/3), show-all toggle, `ComplianceReportView` child; `return null` only when `props.report === null` (null-guard, not stub) | VERIFIED |
| `src/.../tier-dispatch.ts` | Yes | Yes — `constraint_lift_eligible = citationDetails.some(d => d.kind === 'ConstraintNode')` at line 339 | VERIFIED |

**DEEP-03 verdict: VERIFIED**

#### DEEP-06 phase-A — Cross-Repo Schema Migration

**REQUIREMENTS.md status:** Confirmed. Traceability index entry reads:
`DEEP-06 | 16 (schema-A), 17 (UI-B) | Phase-A Closed 2026-05-15; Phase-B Pending` with 4 closure commit hashes. The Open section retains only `DEEP-06 phase-B` (cross-repo UI) as pending Phase 17. This is the correct split.

**Implementation files verified on disk:**

| File | Exists | Substantive | Assessment |
|------|--------|-------------|------------|
| `kernel/src/graph/migrations/0008_cross_repo_identity.sql` | Yes | Yes — 4 canonical statements: `ALTER TABLE nodes ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary'`, `ALTER TABLE edges ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary'`, `CREATE INDEX IF NOT EXISTS nodes_repo_id ON nodes(repo_id)`, `CREATE INDEX IF NOT EXISTS edges_repo_id ON edges(repo_id)` | VERIFIED |
| `kernel/src/graph/repo-fingerprint.ts` | Yes | Yes — `fingerprint(remoteUrl)` function using `createHash('sha256').update(normalized).digest('hex').slice(0, 12)` with URL normalization | VERIFIED |
| `kernel/src/graph/dao.ts` — `queryByRepo` | Yes | Yes — method at line 328 with Drizzle `eq(nodes.repo_id, repoId)` + bitemporal clauses; 2 occurrences in file (declaration + Drizzle call) | VERIFIED |
| `kernel/src/graph/dao.ts` — `queryByAnchor` repoId param | Yes | Yes — `repoId: string = 'primary'` default param at line 421; 8 `repoId` occurrences in dao.ts | VERIFIED |

**DEEP-06 phase-A verdict: VERIFIED**
**DEEP-06 phase-B verdict: Correctly deferred to Phase 17 — Pending**

---

### 2. Success Criteria Verification (ROADMAP Phase 16)

#### SC#1: Constraint-lift kernel RPC + RunConstraintLiftInput type + maxHops 1|2|3 literal-union

**Kernel RPC:** `graph.constraintLift` registered via `connection.onRequest(ConstraintLiftRequest, requireAuth(...))` in `kernel/src/rpc/server.ts` lines 291-303. The handler reads `params.max_hops ?? 3` and passes it as `maxHops` to `runConstraintLiftAnalysis`.

**RunConstraintLiftInput type:** Defined in `kernel/src/drift/constraint-lift.ts` lines 23-31. The `maxHops` field is typed as `1 | 2 | 3` (literal union) — confirmed by direct file read at line 25: `readonly maxHops: 1 | 2 | 3;   // literal-union cap — refuse-unbounded-ripple-walk gate enforces`.

**DriftFindings button:** Renders conditionally when `constraintLiftEligible && constraintCitation !== null` — confirmed in DriftFindings.tsx line 103.

**HypotheticalImpact UI:** Non-stub; renders Hypothetical badge (`data-testid="hypothetical-impact-badge"`), depth radio (1/2/3), show-all toggle (`data-testid="hypothetical-impact-show-all-toggle"`), and `ComplianceReportView` child.

**Mandate B (no graph writes):** Verified — HypotheticalImpact.tsx and DriftFindings.tsx contain zero calls to `atomicAccept`, `proposeEdit`, `recordRejection`, `recordContractOverride`. The constraint-lift path in panel.ts routes through `constraintLiftHandler` (registered by extension.ts as a read-only RPC transport); it does not touch write RPCs.

**SC#1 verdict: VERIFIED** (automated checks pass; SC#1 visual aspect requires human-verify as flagged in plan)

#### SC#2: Ripple walk export + refuse-unbounded-ripple-walk.sh covers constraint-lift*.ts

**walkRippleEdges export:** `kernel/src/drift/ripple.ts` exports `walkRippleEdges` (confirmed by SUMMARY and that `constraint-lift.ts` imports `import { walkRippleEdges } from './ripple.js'` at line 21).

**refuse-unbounded-ripple-walk.sh coverage:** The gate script at `scripts/ci/refuse-unbounded-ripple-walk.sh` line 22 uses regex: `grep -E "^${KERNEL_DRIFT}/(ripple|constraint-lift).*\.ts$"` — confirmed by direct file read. The `(ripple|constraint-lift)` alternation is the Phase 16 widening.

**maxHops literal-union in constraint-lift.ts:** `readonly maxHops: 1 | 2 | 3` at line 25 — the gate would fire if any call site used `max_hops: 4` anywhere in the matched files.

**SC#2 verdict: VERIFIED**

#### SC#3: 0008_cross_repo_identity.sql adds repo_id TEXT NOT NULL DEFAULT 'primary' to nodes + edges + indexes; existing sentinels pass byte-equal

**Migration file:** Exists at `kernel/src/graph/migrations/0008_cross_repo_identity.sql`. Body confirmed verbatim:
- Line 19: `ALTER TABLE nodes ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary';`
- Line 21: `ALTER TABLE edges ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary';`
- Line 23: `CREATE INDEX IF NOT EXISTS nodes_repo_id ON nodes(repo_id);`
- Line 25: `CREATE INDEX IF NOT EXISTS edges_repo_id ON edges(repo_id);`

All 4 canonical statements present. The file uses `IF NOT EXISTS` for idempotency and includes Drizzle statement-breakpoints.

**Backward-compat sentinels:** Wave-by-wave evidence shows `as-of.spec.ts` (2), `query-by-anchor.spec.ts` (4), `traverse.spec.ts` (7), `traverse-smoke.spec.ts` (4) all PASS in the full kernel suite (406/406).

**Manual sqlite3 .schema:** Not programmatically verifiable — flagged as CHECKPOINT in plan. Human verification remains pending.

**SC#3 verdict: VERIFIED (automated); CHECKPOINT (manual .schema)**

#### SC#4: queryByRepo() DAO method + queryByAnchor optional repoId param

**queryByRepo:** Implemented in `kernel/src/graph/dao.ts` at line 328. Real Drizzle body uses `and(eq(nodes.repo_id, repoId), lte(...), or(...), lte(...))`. Not a stub.

**queryByAnchor repoId param:** `repoId: string = 'primary'` default param at line 421 of dao.ts — backward-compatible (all existing 2-arg callers default to 'primary').

**INDEX nodes_repo_id:** Created by migration; not verifiable without a live DB (human verify via `.indices nodes`).

**SC#4 verdict: VERIFIED (code); CHECKPOINT (index existence — requires live DB)**

#### SC#5: freshclone-smoke-cdp.cjs continues to PASS

Wave-by-wave evidence records 5/5 assertions PASS. The migration is backward-compatible (ALTER TABLE ADD COLUMN with NOT NULL DEFAULT backfills all existing rows). No kernel boot regression.

**SC#5 verdict: VERIFIED**

---

### 3. Mandate B Fence Verification

**Audit question:** Do webview / bridge paths call `atomicAccept` / `proposeEdit` / `recordRejection` / `recordContractOverride` for the constraint-lift flow?

**HypotheticalImpact.tsx:** Zero occurrences of any banned token. The component only filters rows and renders UI.

**DriftFindings.tsx:** Zero occurrences of any banned token. The `onConstraintLiftClick` handler calls `rpc.postConstraintLiftRequest(...)` — a read-only RPC.

**panel.ts (constraint-lift branch):** The occurrences of `recordContractOverride` in panel.ts are in comments describing the _override_ handler (lines 31-35), not in the constraint-lift code path (lines 407-444). The constraint-lift branch calls `this.constraintLiftHandler(...)` which routes to `KernelClient.constraintLift` (read-only `sendWithTimeout`). No write RPC is called.

**refuse-deep05-write.sh:** CI gate scans inspector/ — the constraint-lift code does not live in inspector/ — but the gate's overall exit 0 confirms no banned tokens crept into the inspector path.

**Mandate B fence verdict: VERIFIED — no write RPCs in constraint-lift flow**

---

### 4. Pitfall 1 Fence Verification (Date.now / new Date in constraint-lift handler path)

**kernel/src/drift/constraint-lift.ts:** The only occurrences of `Date.now` and `new Date` are in comments (lines 14, 118, 192 contain comment text). Zero executable calls. `generated_at` is set to `input.asOf` (line 192) — the REC-03 single-snapshot pattern.

**kernel/src/rpc/server.ts (constraint-lift handler, lines 291-303):** The handler body reads `params.asOf` and passes it to `runConstraintLiftAnalysis`. No `Date.now()` or `new Date()` call in this region. The `new Date().toISOString()` at line 306 belongs to the `ProposeEditRequest` handler — a different handler entirely.

**src/.../panel.ts (canvas.requestConstraintLift branch, lines 407-444):** One `new Date().toISOString()` at line 425 — this is the documented defensive fallback when `lp.graph_snapshot_tx_time` is null (first-open degraded path where no payload context is available). The VERIFICATION log accepts `≤1 code hit` here as passing. This is the exact pattern described in Pitfall 1 four-layer fence.

**src/.../HypotheticalImpact.tsx:** Zero executable `Date.now`/`new Date` calls. Comment at line 19 states the fence; no code-level violations.

**src/.../DriftFindings.tsx:** Zero occurrences of `Date.now` or `new Date`.

**Pitfall 1 fence verdict: VERIFIED — constraint-lift handler path is free of Date.now()/new Date() calls; panel.ts defensive fallback (≤1 hit) is within the accepted tolerance**

---

### 5. REQUIREMENTS.md Status Verification

**DEEP-03:** Absent from the Open section. Present in `Phase 16 — Ripple Analysis + Cross-Repo Schema Migration — Closed 2026-05-15` section with full prose and 13 closure commit hashes. Traceability index: `DEEP-03 | 16 | Closed 2026-05-15`.

**DEEP-06:** The Open section retains only `DEEP-06 phase-B` (cross-repo UI) as pending Phase 17 — correctly annotated. Phase-A closure entry in the Phase 16 Closed section. Traceability index: `DEEP-06 | 16 (schema-A), 17 (UI-B) | Phase-A Closed 2026-05-15; Phase-B Pending`.

**REQUIREMENTS.md verdict: VERIFIED** — DEEP-03 closed, DEEP-06 phase-A closed with phase-B explicitly pending Phase 17.

---

### 6. Phase-Close Commit Verification

The phase-close commit `f1f486fa41e` (subject: `docs(16): close Phase 16 — DEEP-03 + DEEP-06 phase-A GREEN`) exists on master. The commit modified 5 planning files (REQUIREMENTS.md, ROADMAP.md, STATE.md, 16-SUMMARY.md, 16-VALIDATION.md). No `Co-Authored-By` trailer present (per user memory). The commit predates the gsd-tools state regression fix commit (`635c048f6d6`).

---

### Observable Truths Summary

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `graph.constraintLift` RPC exists under requireAuth with RunConstraintLiftInput.maxHops 1\|2\|3 literal-union | VERIFIED | constraint-lift.ts line 25; server.ts lines 291-303 |
| 2 | `walkRippleEdges` is exported; refuse-unbounded-ripple-walk.sh covers (ripple\|constraint-lift)*.ts | VERIFIED | ripple.ts import in constraint-lift.ts; gate script line 22 regex |
| 3 | `0008_cross_repo_identity.sql` adds `repo_id TEXT NOT NULL DEFAULT 'primary'` to nodes + edges + 2 indexes | VERIFIED (code); CHECKPOINT (live DB) | Migration file lines 19-25; 4/4 canonical statements |
| 4 | `queryByRepo()` DAO method + `queryByAnchor` optional repoId='primary' default | VERIFIED | dao.ts lines 328, 421 |
| 5 | SC#5 freshclone-smoke-cdp.cjs 5/5 PASS | VERIFIED | Wave-by-wave evidence |
| 6 | HypotheticalImpact.tsx is non-stub; DriftFindings constraint-lift button renders conditionally | VERIFIED | HypotheticalImpact.tsx 97 lines real body; DriftFindings.tsx lines 103-112 |
| 7 | Mandate B fence holds — constraint-lift flow makes zero write-RPC calls | VERIFIED | Zero banned tokens in webview files; panel.ts routes read-only |
| 8 | Pitfall 1 fence holds — constraint-lift handler path free of Date.now()/new Date() | VERIFIED | constraint-lift.ts comments only; server.ts handler region clean; panel.ts ≤1 defensive fallback |
| 9 | REQUIREMENTS.md has DEEP-03 closed + DEEP-06 phase-A closed / phase-B pending Phase 17 | VERIFIED | REQUIREMENTS.md traceability index confirmed |

**Score: 9/9 truths verified (1 partial checkpoint for live DB human-verify on SC#3/SC#4)**

---

## Verifier Status

**status: passed**

All automated checks pass. Goal-backward audit finds no gaps. The one remaining CHECKPOINT item (manual `sqlite3 ~/.goatide/graph.db ".schema nodes"` + `.indices nodes` verification) is a human-verify task flagged in Plan 16-05 Task 2 — it is not a blocking gap for the automated goal-backward audit. The implementation exists, is substantive, is wired end-to-end, and the REQUIREMENTS.md status fields are correctly updated.

Phase 16 goal is achieved.

---

_Wave-by-wave evidence: 2026-05-15 (Plan 16-05 executor)_
_Goal-backward audit: 2026-05-14 (gsd-verifier)_
_Verifier: Claude (gsd-verifier)_
