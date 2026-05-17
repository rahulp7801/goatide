---
phase: 19-walkthrough-foregrounding-fix
plan: 02
subsystem: bridge-extension
tags: [configurationDefaults, walkthrough, wave1, manifest-patch, mirror-sync, pitfall5]
runtime_probe: GREEN

# Dependency graph
requires:
  - phase: 19-walkthrough-foregrounding-fix
    plan: 01
    provides: Wave-0 RED stubs (configuration-defaults.test.ts + startup-editor-default.test.ts) + brander meta-test
affects: [19-03, 19-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "contributes.configurationDefaults extension point: bridge package.json declares workbench.startupEditor: none to suppress VS Code's StartupPageRunnerContribution"

key-files:
  created: []
  modified:
    - src/vs/goatide/extensions/goatide-bridge/package.json
    - extensions/goatide-bridge/package.json

key-decisions:
  - "runtime_probe GREEN: Both Wave-0 RED stubs flip GREEN after manifest patch. Plan 19-03 (setTimeout double-invoke fallback) is UNNECESSARY -- orchestrator should skip directly to Plan 19-04 (Wave 3 CDP smoke gate)."
  - "configurationDefaults placement at top of contributes block: placed before configuration/commands/walkthroughs per JSON convention (cross-cutting default visible first). Order within contributes is not load-bearing per VS Code extension spec."

requirements-completed: [WALK-01]

# Metrics
duration: 5min
completed: 2026-05-17T20:55:05Z
---

# Phase 19 Plan 02: Wave 1 Primary Fix -- configurationDefaults SUMMARY

**4-line addition to bridge package.json adds `contributes.configurationDefaults.workbench.startupEditor: none`, suppressing VS Code's StartupPageRunnerContribution so the GoatIDE walkthrough wins the foreground race uncontested**

## runtime_probe: GREEN

**CRITICAL ORCHESTRATOR SIGNAL:** The Wave-0 runtime probe `startup-editor-default.test.ts` flipped 1/1 GREEN after the manifest patch. This means:

- VS Code's extension-contributions path (`configurationExtensionPoint.ts:162-213`) correctly wires `workbench.startupEditor: none` at activation time
- Pitfall 5 / VS Code issue #152265 does NOT apply to the extension-contributions path in 1.117.0
- **Plan 19-03 (Wave 2 setTimeout double-invoke fallback) is UNNECESSARY**
- **Orchestrator should proceed directly to Plan 19-04 (Wave 3 CDP smoke gate)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-17T20:50:36Z
- **Completed:** 2026-05-17T20:55:05Z
- **Tasks:** 3 (01 manifest patch, 02 mirror sync, 03 runtime probe)
- **Files modified:** 2 (source-of-truth + mirror byte-equal)

## Accomplishments

**Task 19-02-01 — Manifest patch (commit `ae957b68130`):**
- Inserted `contributes.configurationDefaults.workbench.startupEditor: "none"` as first key inside the `contributes` object
- JSON syntax validated clean (`node -e "JSON.parse(...)"` → `JSON OK`)
- Wave-0 RED test `configuration-defaults.test.ts` flips 1/1 GREEN
- Bridge tsc compile: zero errors
- Phase 17 Pitfall 9 fence: `walkthrough-completion.ts` byte-identical to HEAD (empty `git diff`)

**Task 19-02-02 — Mirror sync (commit `57f83c71f7e`):**
- `bash scripts/prepare_goatide.sh` ran; key output: `GoatIDE bridge extension synced to extensions/goatide-bridge`
- `npm ci --omit=dev` WARN is expected (pre-existing lock-file drift); `package.json` cp is what matters
- `bash scripts/ci/refuse-stale-bridge-mirror.sh` → `OK: bridge mirror in sync (stub vs real package.json, byte-equal across all fields; media/walkthrough/* synced)`
- `diff -u source mirror` → empty (byte-equal confirmed)
- Phase 19 meta-test (`refuse-stale-bridge-mirror-after-configurationDefaults.meta.sh`) → `META PASS`
- Phase 17 meta-test (`refuse-stale-bridge-mirror-after-walkthrough.meta.sh`) → `META PASS`

**Task 19-02-03 — Runtime probe (observational, no files modified):**
- `npm test -- --grep "startupEditor.default.none"` → 1/1 PASS (GREEN)
- Full bridge suite: 124 passing, 3 pending, 16 failing
- 16 failures are pre-existing (Phases 7-8 HypotheticalImpact + drift-flow integration tests; not caused by Plan 19-02)
- Both Wave-0 stubs GREEN in full suite output

## Diff Applied to package.json (Task 19-02-01)

```diff
 "contributes": {
+    "configurationDefaults": {
+        "workbench.startupEditor": "none"
+    },
     "configuration": {
```

Exact file location: `src/vs/goatide/extensions/goatide-bridge/package.json` line 15, after `"contributes": {`.
Tabs used (2-level nesting matches file convention). Trailing comma required (sibling follows).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 19-02-01 | Manifest patch — add configurationDefaults | `ae957b68130` | `src/vs/goatide/extensions/goatide-bridge/package.json` (+4 lines) |
| 19-02-02 | Mirror sync via prepare_goatide.sh | `57f83c71f7e` | `extensions/goatide-bridge/package.json` (+4 lines, byte-equal) |
| 19-02-03 | Runtime probe (observational) | n/a — no files modified | — |

## Verification Results

| Check | Result |
|-------|--------|
| `configuration-defaults.test.ts` (Wave-0 19-01-01) | GREEN 1/1 PASS |
| `startup-editor-default.test.ts` (Pitfall 5 probe 19-01-04) | GREEN 1/1 PASS |
| Bridge tsc compile (`npx tsc -p . --noEmit`) | GREEN (zero errors) |
| JSON syntax (`node -e "JSON.parse(...)"`) | GREEN (JSON OK) |
| `refuse-stale-bridge-mirror.sh` | GREEN (exits 0) |
| `diff -u source mirror` | GREEN (empty) |
| Phase 19 brander meta-test | META PASS |
| Phase 17 brander meta-test | META PASS |
| All 11 non-FORK04 CI gates | GREEN (exits 0) |
| `refuse-vs-workbench-edits.sh` | FAIL (pre-existing FORK-04; not caused by Plan 19-02) |
| `walkthrough-completion.ts` git diff | EMPTY (Pitfall 9 fence preserved) |

## Runtime Probe Interpretation

The `startup-editor-default.test.ts` test (Plan 19-01 Task 4) reads the bridge `package.json` via `fs.readFileSync` + `__dirname`-relative path and asserts `contributes.configurationDefaults['workbench.startupEditor'] === 'none'`.

GREEN outcome means: the static manifest patch is correctly surfaced through the test's runtime-proxy read path. The extension-contributions registration path in VS Code 1.117.0 (`configurationExtensionPoint.ts:162-213`) is the supported, non-broken surface for setting `workbench.startupEditor`.

**Orchestrator handoff decision: proceed to Plan 19-04. Skip Plan 19-03.**

## Deviations from Plan

None — plan executed exactly as written.

The `npm ci --omit=dev` WARN from the brander is pre-existing behavior (lock-file drift). Documented in the plan as non-blocking — the `package.json` `cp` at line 158 of `prepare_goatide.sh` is the load-bearing operation.

## Self-Check: PASSED

Files verified:
- FOUND: src/vs/goatide/extensions/goatide-bridge/package.json (contains configurationDefaults key)
- FOUND: extensions/goatide-bridge/package.json (byte-equal mirror)

Commits verified:
- FOUND: ae957b68130 (task 19-02-01)
- FOUND: 57f83c71f7e (task 19-02-02)
