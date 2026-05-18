---
phase: 22-distribution
plan: 04
subsystem: infra
tags: [electron-updater, auto-update, mandate-d, github-releases, dialog, wave-2]

# Dependency graph
requires:
  - phase: 22-distribution
    plan: 01
    provides: goatideUpdater.ts Wave-0 stub with VSCODE_DEV guard; IUpdateService no-op fence

provides:
  - goatideUpdater.ts fleshed out with full electron-updater wiring (lazy provider pattern)
  - _autoUpdaterProvider and _dialogApi testable seams (lazy require)
  - Mandate D dialog: Restart Now / Later + autoInstallOnAppQuit=false (never auto-restart)
  - initGoatIdeUpdater() call site in CodeApplication.startup() in app.ts
  - electron-updater@^6.8.3 in package.json dependencies (runtime requirement)
  - electron-builder.yml publish: section (provider: github, owner: rahulp7801, releaseType: draft)
  - 2 new unit tests: update-downloaded restart/later branches GREEN
affects:
  - 22-05 (C3 validation plan; manual UAT of install old -> publish release -> in-app prompt)

# Tech tracking
tech-stack:
  added:
    - "electron-updater@^6.8.3 (moved to dependencies for runtime availability and test import-map)"
  patterns:
    - "Lazy provider pattern: _autoUpdaterProvider.get() and _dialogApi.showMessageBox() for testable main-process-only APIs in renderer-process tests"
    - "Mandate D: autoInstallOnAppQuit=false + dialog.showMessageBox Restart Now/Later gate"
    - "IAutoUpdaterApi interface for mocking electron-updater in renderer unit tests"

key-files:
  created: []
  modified:
    - src/vs/goatide/update/goatideUpdater.ts
    - src/vs/goatide/update/test/goatideUpdater.test.ts
    - src/vs/code/electron-main/app.ts
    - package.json
    - package-lock.json
    - electron-builder.yml

key-decisions:
  - "Used lazy provider pattern (_autoUpdaterProvider, _dialogApi) instead of top-level static imports because electron-updater calls electron.app.getVersion() at module load time -- unavailable in renderer-process unit test context"
  - "Moved electron-updater from devDependencies to dependencies -- runtime requirement, and import-map in renderer.html only includes dependencies (not devDependencies)"
  - "IAutoUpdaterApi interface exported so test stubs satisfy TypeScript without importing electron-updater in renderer context"
  - "Known limitation documented: Windows kernel daemon file handle may block NSIS update install; explicit shutdown RPC deferred to v2.2"

patterns-established:
  - "Lazy provider pattern: use { get(): T } object exports for main-process-only APIs so renderer tests can replace .get without importing the main-process module"
  - "Mandate D Restart Now/Later dialog: never auto-restart; autoInstallOnAppQuit=false enforces user consent requirement"

requirements-completed:
  - C3

# Metrics
duration: 70min
completed: 2026-05-18
---

# Phase 22 Plan 04: Electron Updater Wiring Summary

**electron-updater@^6.8.3 wired to GitHub Releases with Mandate D Restart Now/Later dialog; lazy provider pattern enables renderer-process unit tests without main-process imports**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-05-18T10:52:00Z
- **Completed:** 2026-05-18T11:05:00Z
- **Tasks:** 6
- **Files modified:** 6

## Accomplishments

- goatideUpdater.ts Wave-0 stub fleshed out with full electron-updater wiring (VSCODE_DEV guard PRESERVED as first statement)
- Mandate D enforced: autoInstallOnAppQuit=false + Restart Now/Later dialog; quitAndInstall(false, true) ONLY on response 0
- Lazy provider pattern (_autoUpdaterProvider.get, _dialogApi.showMessageBox) enables renderer-process unit tests without importing main-process-only APIs
- 3/3 initGoatIdeUpdater tests GREEN (VSCODE_DEV guard + restart triggers quitAndInstall + later does NOT trigger)
- 5/5 total GoatIde update tests GREEN (2 noOpUpdateService + 3 initGoatIdeUpdater)
- Phase 18 SC13 regression gate PASS: 0 code.visualstudio.com requests (13/13 SCs PASS)
- electron-builder.yml publish section added (provider: github, owner: rahulp7801, repo: goatide, releaseType: draft)
- initGoatIdeUpdater() wired into CodeApplication.startup() as the final statement after eventuallyPhaseScheduler

## Task Commits

Each task committed atomically:

1. **Task 1: Install electron-updater@^6.8.3** - `476a9b4` (chore)
2. **Task 2+3: goatideUpdater.ts implementation + unit tests** - `89aa451` (feat)
3. **Task 4: app.ts call site** - `8d89b46` (feat)
4. **Task 5: electron-builder.yml publish section** - `74ab538` (chore)
5. **Task 6: Pitfall H verification** - verified inline (no separate commit needed; all checks PASS)

## Files Created/Modified

- `src/vs/goatide/update/goatideUpdater.ts` - Full electron-updater wiring; VSCODE_DEV guard preserved; lazy _autoUpdaterProvider + _dialogApi; Mandate D dialog
- `src/vs/goatide/update/test/goatideUpdater.test.ts` - 2 new test cases (update-downloaded restart + later); Wave-0 VSCODE_DEV guard test preserved
- `src/vs/code/electron-main/app.ts` - Import + call site for initGoatIdeUpdater() at end of startup()
- `package.json` - electron-updater moved from devDependencies to dependencies
- `package-lock.json` - Updated with electron-updater dependency resolution
- `electron-builder.yml` - publish: section added (GitHub Releases, draft releases)

## Decisions Made

- **Lazy provider pattern instead of static imports**: electron-updater calls `electron.app.getVersion()` at module load time, which is unavailable in Electron renderer (unit test context). Static `import { autoUpdater } from 'electron-updater'` caused `TypeError: Cannot read properties of undefined (reading 'getVersion')` in test runner. Solution: lazy `require('electron-updater')` inside a `_autoUpdaterProvider.get()` function; tests replace the `get` function with a stub.

- **_dialogApi pattern for dialog**: `dialog` is a main-process-only Electron API; `import { dialog } from 'electron'` in renderer context errors with `SyntaxError: The requested module 'electron' does not provide an export named 'dialog'`. Solution: lazy require inside `_dialogApi.showMessageBox()` function; tests replace the `showMessageBox` property with a stub.

- **electron-updater in dependencies (not devDependencies)**: The Electron renderer test runner's import map (renderer.html) reads from `package.json.dependencies` only, not `devDependencies`. Moving to `dependencies` ensures (a) it's in the import map if tests need it, (b) it's packaged in production builds correctly.

- **IAutoUpdaterApi interface**: Typed stub contract for tests without importing electron-updater; enables clean TypeScript stubs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lazy provider pattern required for electron-updater testability**
- **Found during:** Task 3 (unit tests)
- **Issue:** Static `import { autoUpdater } from 'electron-updater'` at module top causes `TypeError: Cannot read properties of undefined (reading 'getVersion')` in Electron renderer test context because electron-updater calls `electron.app.getVersion()` at module load time, and `app` is main-process only.
- **Fix:** Changed to lazy `require('electron-updater')` inside `_autoUpdaterProvider.get()`. Exported `_autoUpdaterProvider` and `_dialogApi` as testable seams. Added `IAutoUpdaterApi` interface for TypeScript.
- **Files modified:** src/vs/goatide/update/goatideUpdater.ts, src/vs/goatide/update/test/goatideUpdater.test.ts
- **Verification:** 3/3 initGoatIdeUpdater tests GREEN
- **Committed in:** 89aa451 (Tasks 2+3 commit)

**2. [Rule 1 - Bug] electron-updater moved to dependencies for import-map resolution**
- **Found during:** Task 3 (unit tests) - first iteration
- **Issue:** `electron-updater` as devDependency not included in renderer.html import map (only reads from `dependencies`), causing `Failed to resolve module specifier "electron-updater"` in test runner.
- **Fix:** Moved from devDependencies to dependencies in package.json; npm install to update package-lock.json.
- **Files modified:** package.json, package-lock.json
- **Verification:** Import map now includes electron-updater; tests run
- **Committed in:** 89aa451 (Tasks 2+3 commit, package.json included)

**3. [Rule 3 - Blocking] Removed unused eslint-disable directives**
- **Found during:** Task 3 commit (pre-commit hook)
- **Issue:** hygiene.ts counts ESLint warnings as errors. `eslint-disable-next-line local/code-no-dangerous-type-assertions` comments were unused (rule is 'off' for the goatide/** target) causing 3 hygiene warnings = 3 errors.
- **Fix:** Removed the 3 unused `eslint-disable-next-line` comments.
- **Files modified:** src/vs/goatide/update/goatideUpdater.ts
- **Verification:** `node --experimental-strip-types build/hygiene.ts` exits 0
- **Committed in:** 89aa451 (same commit after re-staging)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking)
**Impact on plan:** All auto-fixes necessary for test correctness and CI compliance. The lazy provider pattern is a better design than static imports for this use case. No scope creep.

## Known Limitations

**Windows kernel daemon file handle (v2.2 follow-up):** On Windows, the kernel sidecar daemon holds an open file handle to `kernel/dist/main.js`. If NSIS attempts to overwrite files during `quitAndInstall` while the daemon is still running, the install may fail. The user must retry. Electron's `will-quit` event naturally reaps spawned child processes in most cases. An explicit kernel-shutdown RPC across electron-main / extension host / kernel is OUT OF SCOPE for Phase 22 and is documented as a v2.2 follow-up item.

## Issues Encountered

- Pre-commit hook caught staged vs. working-copy mismatch (was linting old staged content from first failed commit attempt). Fixed by re-staging after each write.
- eslint `header/header` rule checked the git-indexed version, not working copy. Required explicit re-staging before running hygiene.

## User Setup Required

None - no external service configuration required. The GitHub Releases publish config in electron-builder.yml uses `releaseType: draft`; the operator must promote the draft release manually after reviewing the artifacts.

## Next Phase Readiness

- Plan 22-05 (C3 validation / SUMMARY closure) is ready to proceed: electron-updater is wired, all unit tests GREEN, Pitfall H gate PASS.
- Manual UAT owned by Plan 22-05: install old version -> publish new GitHub Release -> observe in-app prompt -> click Restart Now -> verify upgraded.
- Plans 22-02 (C1 macOS signing) and 22-03 (C2 Windows Azure signing) remain cert-gated and can proceed independently.

---
*Phase: 22-distribution*
*Completed: 2026-05-18*

## Self-Check: PASSED

All created/modified files exist on disk:
- FOUND: src/vs/goatide/update/goatideUpdater.ts
- FOUND: src/vs/goatide/update/test/goatideUpdater.test.ts
- FOUND: src/vs/code/electron-main/app.ts
- FOUND: electron-builder.yml
- FOUND: package.json
- FOUND: .planning/phases/22-distribution/22-04-electron-updater-SUMMARY.md

All 4 plan commits verified in git log: 476a9b4, 89aa451, 8d89b46, 74ab538. Compile clean. 5/5 GoatIde tests GREEN. Phase 18 SC13 PASS (0 CDN hits).
