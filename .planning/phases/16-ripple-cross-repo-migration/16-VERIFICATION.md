---
phase: 16-ripple-cross-repo-migration
verified: 2026-05-15
status: green
nyquist_compliant: true
wave_0_complete: true
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

- **[Rule 1 - Bug] Kernel tsc `confidence_band` type error** — `ConstraintLiftAnalysisResult.hypothetical_impact` typed as `ComplianceReport` (base type) while tests correctly accessed `confidence_band` (ConstraintLiftRow field). Fixed by introducing `ConstraintLiftReport` with properly-typed buckets + renaming local result type. Runtime behavior was already correct (vitest passed). Build now exits 0.

---

## Verification Completed

- **Date:** 2026-05-15
- **Kernel suite:** 119 files / 406 tests PASS (exit 0)
- **Bridge suite:** 120 passing / 3 pending / 0 failing (exit 0)
- **CI gates:** 5/5 exit 0
- **Meta-tests:** 3/3 META PASS
- **Freshclone smoke:** 5/5 assertions PASS
- **Phase close commit:** pending (Task 3)
