# Pitfalls Research

**Domain:** VS Code fork — bitemporal graph IDE (GoatIDE v2.0 deep features + polish + Windows auto-update)
**Researched:** 2026-05-13
**Confidence:** HIGH (verified against source code + commit history)

> Scope: pitfalls when ADDING v2.0 features to the existing GoatIDE substrate.
> v1.x pitfalls (better-sqlite3 ABI, canvas.ready handshake, _badListeners, singleton dispose ordering) are closed and referenced only when they create a new risk surface for v2 features.

---

## Critical Pitfalls

### Pitfall 1: Cytoscape.js Mutates Node Arrays In-Place — Breaks Append-Only Graph Invariant

**What goes wrong:**
Cytoscape.js element addition APIs (`cy.add(elements)`) accept plain object arrays and take ownership of them, mutating their `data` fields internally to attach Cytoscape-specific bookkeeping (`_private`). If the caller passes the raw `NodeRow[]` response from a `kernel.queryNodes` RPC call — or worse, from a `traverse()` result stored in a React state ref — Cytoscape will mutate the object in place. When the same object is later used to feed a bitemporal `valid_from` comparison or passed back to the kernel as part of a ripple analysis input, the mutated data produces silent wrong results (corrupted timestamps, phantom node IDs in frontier arrays).

**Why it happens:**
The kernel's `traverse()` and `GraphDAO.queryByKind()` return raw parsed objects via `JSON.parse(r.payload)`. These are plain JavaScript objects with no freeze protection. Cytoscape's documentation requires elements to be passed as `{ group, data }` descriptor objects, but developers shim this by passing the raw DAO output directly.

**Consequences:**
- Bitemporal `valid_from` comparisons in the time-travel slider are silently wrong (Cytoscape has overwritten `data.valid_from` with its internal index).
- RPC calls made with the same node objects (e.g. a DEEP-03 ripple analysis triggered from the inspector) use corrupted IDs.
- The kernel's `better-sqlite3` SQLite engine has no defence against receiving malformed ULID strings for `src_id`/`dst_id` lookups; the query returns empty results silently.

**How to avoid:**
Before passing any kernel-returned node data to `cy.add()`, map it through a **projection + freeze** step:

```typescript
// Example projection for DEEP-02 graph inspector
const cyElements = nodeRows.map(row => ({
	group: 'nodes' as const,
	data: {
		id: row.node_id,
		kind: row.kind,
		label: (row.payload as { body?: string }).body?.slice(0, 60) ?? row.node_id,
		valid_from: row.valid_from,
		invalidated_at: row.invalidated_at,
	},
}));
// The original nodeRows are never passed to cy.add() — only cyElements are.
```

Keep the `nodeRows` reference live and frozen as a separate React state value; only `cyElements` touches the Cytoscape instance. This is different from passing references through.

**Warning signs:**
- `cy.elements().map(el => el.data('valid_from'))` returns unexpected values after `cy.add()`.
- A node's `node_id` from `cy.elements()` no longer matches any row in the `kernel.queryNodes` result used to seed the inspector.

**Phase to address:**
DEEP-02 Wave 0 — add a type-safe projection utility (`kernelRowToCyElement`) before any Cytoscape rendering code is written. Wave-0 stub test: assert that calling `kernelRowToCyElement` does not mutate the input `NodeRow` object (use `structuredClone` before + `assert.deepStrictEqual` after).

---

### Pitfall 2: DEEP-02 Graph Inspector Uses Its Own WebviewPanel — Accidentally Shares CanvasPanel Singleton

**What goes wrong:**
`CanvasPanel` in `src/vs/goatide/extensions/goatide-bridge/src/canvas/panel.ts` is a singleton (`static instance: CanvasPanel | undefined`). A developer implementing the DEEP-02 Graph Inspector reuses the existing `CanvasPanel.getOrCreate()` because it is the obvious "show a webview" utility. The inspector's Cytoscape UI and the Verification Canvas React UI are bundled separately (different esbuild entry points), but they share the same `ViewType = 'goatide.canvas'`. VS Code matches webview panels by `viewType` when restoring after a hide/show cycle — the inspector's `cy` instance is serialized into the wrong panel, or the save-gate's pending `Promise<CanvasDecision>` is resolved spuriously by an inspector message.

**Why it happens:**
`CanvasPanel.getOrCreate()` is the only "create a webview" pattern in the existing codebase; it is the first thing developers reach for. The `VIEW_TYPE` constant is not exported, but the method is public. Additionally, the DEEP-02 inspector will need similar lifecycle management (reveal, hide, dispose on extension deactivate) which developers will copy from `CanvasPanel`.

**Consequences:**
- Save-gate for a concurrent save resolves with a spurious `accept` decision because the inspector's `canvas.ready` message triggers `resolveWebviewReady()` on the shared instance.
- The inspector's `cy.on('tap', node)` events route into `CanvasPanel.handleMessage()` which calls `this.pendingResolve()` on an unrelated Promise.
- After the inspector is closed, the `CanvasPanel.instance = undefined` clear causes the next save to create a new Canvas — losing the CLOSE-02 canvas.ready handshake state.

**How to avoid:**
Create a **separate** `GraphInspectorPanel` class with a different `VIEW_TYPE = 'goatide.graphInspector'`. Do NOT subclass or reuse `CanvasPanel`. Apply the same lifecycle patterns (singleton, dispose clears instance before cleanup, `canvas.ready` equivalent for Cytoscape mount), but as a distinct class. A separate esbuild entry point (`src/inspector/webview/index.tsx`) produces a separate `dist/inspector/index.js` bundle. The `localResourceRoots` in `createWebviewPanel` must point at `dist/inspector/`.

**Warning signs:**
- `VIEW_TYPE` appears twice in the bridge codebase (`grep -r "goatide.canvas"`).
- The DEEP-02 panel is opened and a pending Canvas save decision resolves immediately.

**Phase to address:**
DEEP-02 Wave 0 — the Wave-0 stub must define `VIEW_TYPE = 'goatide.graphInspector'` and a RED test that asserts the two view types are different strings.

---

### Pitfall 3: DEEP-02 Bundle Size Blows Up the Bridge Mirror `npm ci` Step

**What goes wrong:**
`cytoscape` (min+gzip ~110KB) and `cytoscape-fcose` (~40KB) are added to the bridge's `package.json` `dependencies`. The `prepare_goatide.sh` mirror step runs `npm ci --omit=dev` against `extensions/goatide-bridge/`, downloading these packages into the mirror's `node_modules`. However, `cytoscape` and `cytoscape-fcose` are only ever consumed by the **webview** bundle (an esbuild IIFE targeting the browser) — the extension host entry point (`dist/extension.js`) never imports them. If they land in the mirror `node_modules`, they waste ~3MB of disk space, increase CI install time, and — critically — `refuse-stale-bridge-mirror.sh` byte-compares `extensions/goatide-bridge/node_modules/` against the source tree; any version skew introduced by the npm ci step fails CI.

**Why it happens:**
Developers add `cytoscape` to `dependencies` (not `devDependencies`) because esbuild requires the package to be present at bundle time, and the standard pattern is "if you import it in source, it's a dependency." For a webview-only library, this is wrong — the webview bundle inlines everything (esbuild `bundle: true`), so the extension host never needs `require('cytoscape')`.

**Consequences:**
- `refuse-stale-bridge-mirror.sh` byte-compare fails in CI when the mirror `node_modules/cytoscape/` diverges from source because `npm ci` was run in the mirror but not the source, or vice versa.
- 3MB of unnecessary native or compiled packages bloat the packaged VSIX.

**How to avoid:**
Add `cytoscape` and `cytoscape-fcose` to `devDependencies` in `goatide-bridge/package.json`. esbuild resolves from `node_modules` regardless of whether a package is in `dependencies` or `devDependencies` — the distinction only matters for `npm ci --omit=dev` (which populates the mirror). Webview-only packages belong in `devDependencies`. After the change, regenerate the mirror:

```bash
cd src/vs/goatide/extensions/goatide-bridge && npm install
bash scripts/prepare_goatide.sh
# Verify mirror has no cytoscape/ in node_modules:
ls extensions/goatide-bridge/node_modules | grep cytoscape  # should be empty
```

**Warning signs:**
- `extensions/goatide-bridge/node_modules/cytoscape/` exists after a `prepare_goatide.sh` run.
- CI fails on `refuse-stale-bridge-mirror.sh` with a diff in `node_modules/`.

**Phase to address:**
DEEP-02 Wave 0 — before `npm install cytoscape`, decide `devDependencies` placement; add a comment in the esbuild config confirming that webview-only packages never reach the mirror.

---

### Pitfall 4: DEEP-03 Ripple Analysis Returns Mutable ComplianceReport to Webview — Downstream Code Patches It

**What goes wrong:**
`runRippleAnalysis()` in `kernel/src/drift/ripple.ts` returns a `ComplianceReport` object with `definitely_affected: ComplianceRow[]` and `potentially_affected: ComplianceRow[]`. The DEEP-03 "constraint lift" feature adds a new RPC `kernel.runHypotheticalRipple(contractNodeId, threshold)` that calls the existing `runRippleAnalysis()` and then re-ranks the rows by a confidence-weighted score. If the implementation mutates the arrays in place (e.g. `report.definitely_affected.sort(...)`, `report.definitely_affected.push(...)`), the kernel's in-memory state for a concurrent `runRippleProgressive` notification that was using the same report object becomes corrupted.

**Why it happens:**
`runRippleAnalysis()` constructs fresh arrays on every call (it does not cache), so developers assume the returned object is safe to mutate. However, the ripple-progressive path (`ripple-progressive.ts`) may keep a reference to intermediate report chunks between notification ticks. Under daemon mode, the kernel serves multiple in-flight requests concurrently.

**Consequences:**
- A concurrent `runRippleProgressive` notification delivers a report that has been partially re-sorted by the DEEP-03 confidence scorer, breaking the `hops asc, node_id asc` deterministic ordering that the bridge UI and tests assert on.
- The `truncated: true` sentinel in a capped report is cleared if a mutation path accidentally rebuilds the arrays.

**How to avoid:**
DEEP-03 must build its confidence-weighted result as a **new** `ComplianceReport` object (`structuredClone` the base report, then apply scoring to the clone). The DEEP-03 RPC handler must never accept the `ComplianceReport` reference from `runRippleAnalysis()` as writable output storage. Add this to the RPC handler's contract comment.

**Warning signs:**
- `runRippleProgressive` notifications deliver rows in non-deterministic order after `runHypotheticalRipple` has been called.
- The compliance report `truncated` flag flips unexpectedly under concurrent requests.

**Phase to address:**
DEEP-03 Wave 0 stub — add a kernel unit test: call `runRippleAnalysis()`, pass the result to the stub DEEP-03 scorer, then re-run `runRippleAnalysis()` with the same input and assert the two results are `deepStrictEqual` (proves scorer did not mutate the shared object).

---

### Pitfall 5: DEEP-05 Session-Priority Lens Accidentally Writes to the Graph via the KernelClient API

**What goes wrong:**
DEEP-05 is a "pure read-side filter" — it re-ranks drift findings and receipt rows by session priority without any graph write. However, `KernelClient` exposes `proposeEdit`, `atomicAccept`, `recordRejection`, and `recordContractOverride` as public methods on the same object used for DEEP-05's `queryNodes` calls. A developer implementing the DEEP-05 priority lens in a new bridge UI component passes the shared `KernelClient` instance and accidentally calls `kernel.atomicAccept()` (copy-paste from a `tier-dispatch.ts` code path) on what they think is a "read-only view update." The kernel records a spurious `Attempt(accepted)` node in the graph, polluting the bitemporal audit trail.

**Why it happens:**
`KernelClient` is a single class with all RPCs on it. There is no read-only interface or wrapper. `tier-dispatch.ts`, the override handler, and DEEP-05's component share the same `kernel` import from `extension.ts`. Copy-paste from tier-dispatch is the fast path.

**Consequences:**
- Ghost `Attempt` nodes appear in the graph for files that were never actually saved through the Verification Canvas.
- The CLOSE-03 `asOf` timing constraint (capture timestamp AFTER seed writes) makes these spurious nodes appear at unexpected positions in the bitemporal timeline.
- Receipt receipts for legitimate saves cite the ghost Attempt as a predecessor, corrupting the DEEP-01 rationale chain.

**How to avoid:**
Introduce a `ReadonlyKernelClient` interface in `kernel/methods.ts` (or a barrel re-export) that exposes only the read-side methods (`queryGraph`, `queryNodes`, `heartbeat`, `runDriftAndLock` read-only result form). DEEP-05 components receive only `ReadonlyKernelClient`. Add a CI gate: `refuse-deep05-write.sh` that greps `src/vs/goatide/extensions/goatide-bridge/src/inspector/` for imports of `atomicAccept|proposeEdit|recordRejection|recordContractOverride` and fails if found.

**Warning signs:**
- `kernel.atomicAccept` appears in an inspector or priority-lens source file.
- The kernel vitest suite starts producing extra `Attempt` rows in `queryByKind('Attempt')` assertions after DEEP-05 tests run (order-dependent contamination similar to the CLOSE-03 `asOf` flake pattern).

**Phase to address:**
DEEP-05 Wave 0 — define `ReadonlyKernelClient` interface; RED test that the priority lens component does not hold a reference to `KernelClient` directly (use a factory that returns the restricted interface). Implement the interface restriction before any DEEP-05 UI code is written.

---

### Pitfall 6: DEEP-06 Cross-Repo Node ID Collision — Two Repos Share the Same ULID Space

**What goes wrong:**
The bitemporal graph uses ULIDs as node IDs. ULIDs have 80 bits of randomness — collision probability within a single repo is astronomically low. However, `DEEP-06` stitches graphs from two or more repositories into a single query surface. The kernel's `GraphDAO` currently has no `repoId` column on `nodes` or `edges`. If the DEEP-06 implementation adds a `repoId` column via a new Drizzle migration but the migration does NOT backfill existing rows (setting `repoId = null` for the primary repo), then:

1. A new secondary-repo node seeded with a ULID that happens to collide with an existing primary-repo node ID causes a SQLite PRIMARY KEY constraint violation on insert — crash.
2. `queryByAnchor` with `jsonPath = '$.anchor.file'` against a stitched graph returns both repos' results without namespace filtering, surfacing contract nodes from repo B as citations for a save in repo A.

**Why it happens:**
ULID collision within one repo is impossible for practical purposes, but across two separately-seeded repos the ULIDs are generated by independent `ulid()` calls with different entropy sources. If the repos are cloned simultaneously and seeded in bulk (e.g. a CI import), the monotonic timestamp component can produce overlapping sequences. More commonly: a developer tests DEEP-06 by copying an existing `.goatide/graph.db` from one repo into another to simulate stitching, and the two DBs share identical node IDs.

**Consequences:**
- Phantom citations: repo B's ConstraintNodes appear as context for a repo A save.
- `runRippleAnalysis` walks cross-repo edges producing a blast radius that spans both codebases, falsely suggesting a constraint lift in repo A affects files in repo B.
- The DEEP-01 rationale chain becomes nonsensical: `kernel.queryRationaleChain` follows supersession chains across the repo boundary.

**How to avoid:**
The DEEP-06 Drizzle migration must:
1. Add `repo_id TEXT NOT NULL DEFAULT 'primary'` to both `nodes` and `edges`.
2. Backfill existing rows with `'primary'` as the repo ID (no-op for solo repos).
3. Update the `GraphDAO.seed()` and `GraphDAO.writeEdge()` to accept an optional `repoId` parameter (default `'primary'`).
4. All `queryByAnchor`, `traverse()`, and `runRippleAnalysis` callers that do NOT specify `repoId` implicitly filter to `WHERE repo_id = 'primary'`. Cross-repo queries require an explicit `repoId: '*'` opt-in.

The `simple-git` remote-URL fingerprint (as documented in STACK.md) must be used as the canonical `repoId`, not the directory name (which can change on re-clone).

**Warning signs:**
- `queryByAnchor` returns a node whose `anchor.file` is an absolute path from a different workspace folder.
- SQLite `UNIQUE constraint failed: nodes.id` on a DEEP-06 cross-repo import.

**Phase to address:**
DEEP-06 Wave 0 — add a kernel vitest spec: seed two "repos" with identical ULID sequences (mock `ulid()` to return colliding values), confirm the migration prevents collision via the `repo_id` namespace. Migration must be written before any cross-repo traversal code.

---

### Pitfall 7: electron-updater Initializes Under VSCODE_DEV=1 — Polling Hits GitHub Releases in CI

**What goes wrong:**
GoatIDE's HARDEN-06 (Phase 12) sets `VSCODE_DEV=1` as the default for dev-checkout launches. The `electron-updater` `autoUpdater` object is initialized in the Electron main process (`app.whenReady()`). If the developer forgets to gate initialization behind `!process.env.VSCODE_DEV`, `autoUpdater.checkForUpdatesAndNotify()` will:
1. Attempt to fetch `https://github.com/<owner>/goatide/releases/latest.yml` from inside a CI runner.
2. If the GitHub token is not set or the repo is private, the request fails with a 401, which `electron-updater` surfaces as an unhandled rejection that exits the main process.
3. In developer environments, it will find whatever draft release exists, download a delta `.blockmap` silently, and attempt an NSIS silent install **into the developer's currently-running GoatIDE install directory** — replacing source files mid-session.

**Why it happens:**
`autoUpdater.isUpdaterActive()` returns `false` when the app is running without an ASAR archive (i.e., from source). However, `checkForUpdatesAndNotify()` does NOT automatically consult `isUpdaterActive()` before making the network request — the caller must check it. The check is documented in electron-updater docs but developers miss it when wiring the initialization code.

**Consequences:**
- CI builds exit with an unhandled rejection from the auto-updater network request. The freshclone-smoke CDPharness (from Phase 9) will fail nondeterministically depending on CI network policy.
- Developer machines receive spurious NSIS silent-install attempts against the dev checkout directory.
- The HARDEN-06 assertion (`VSCODE_DEV=1` is set on launch) is not a sufficient guard by itself — `isUpdaterActive()` still returns true on a fully packaged build.

**How to avoid:**
In the new `src/vs/goatide/update/goatideUpdater.ts` (main process), gate all initialization with both guards:

```typescript
// goatideUpdater.ts — the ONLY file that imports from 'electron-updater'
import { autoUpdater } from 'electron-updater';

export function initAutoUpdater(): void {
	if (process.env.VSCODE_DEV) {
		// HARDEN-06: dev-checkout launches must never poll GitHub Releases.
		return;
	}
	if (!autoUpdater.isUpdaterActive()) {
		// Running without ASAR (e.g. forge dev-mode, test harness without a packaged build).
		return;
	}
	// ... configure channel, checkForUpdatesAndNotify
}
```

Extend the freshclone-smoke CDPharness to assert that `autoUpdater.isUpdaterActive()` is `false` in the dev environment: `assert.strictEqual(isUpdaterActive, false, 'autoUpdater must not be active in VSCODE_DEV mode')`.

**Warning signs:**
- Any GitHub API call to `releases/latest.yml` visible in CI network logs when `VSCODE_DEV=1` is set.
- `electron-updater: Cannot find latest.yml` warnings in the Electron main process stderr.

**Phase to address:**
C3 Wave 0 — RED test that `initAutoUpdater()` is a no-op when `VSCODE_DEV=1`. The test must call the function with `process.env.VSCODE_DEV = '1'` and assert that `autoUpdater.checkForUpdatesAndNotify` was never called (spy via sinon or equivalent).

---

### Pitfall 8: NSIS Installer App ID Conflicts with HARDEN-07 Electron Binary Provisioning

**What goes wrong:**
HARDEN-07 (Phase 12, commit `e763f8c5b71`) chains electron-binary provisioning into the root postinstall — specifically, it downloads the Electron binary to `.build/electron/` using the `electron` npm package's `install.js` script, which uses `product.json`'s `win32x64AppId` as part of the download cache key on Windows. The `electron-builder` NSIS installer uses `appId: ai.goatide.GoatIDE` (from `electron-builder.yml`) as the Windows registry key for the installation. If `prepare_goatide.sh` is modified to change the `win32x64AppId` GUID in `product.json` without a matching update to the `electron-builder.yml` `appId`, the NSIS installer will install to a different registry path from what the existing Electron binary provisioning expects, causing the updater's delta-install to fail silently (wrong install directory).

**Why it happens:**
`product.json` has `win32x64AppId = "{337F95A8-0ABB-40A5-A399-5D87ECFF4B26}"` (hardcoded in `prepare_goatide.sh`). `electron-builder.yml` uses `appId = ai.goatide.GoatIDE` (bundle ID format, not a GUID). These are two separate identity systems: Windows registry (GUID) vs. electron-builder app identification (reverse-domain). They must both remain stable for installer upgrades to work correctly. The risk is a future `prepare_goatide.sh` edit that touches the GUID without knowing about the electron-builder.yml dependency.

**Consequences:**
- NSIS upgrades install to a new directory alongside the existing GoatIDE install rather than replacing it.
- The Windows registry accumulates duplicate "GoatIDE" entries for different installer generations.
- `electron-updater` cannot find the existing install to perform a delta update.

**How to avoid:**
Add a comment block in `electron-builder.yml` (when created for C3) explicitly cross-referencing the `win32x64AppId` GUID in `prepare_goatide.sh`:

```yaml
# win32 appId = product.json win32x64AppId GUID — DO NOT change independently.
# See scripts/prepare_goatide.sh GOATIDE_WIN32_X64_GUID. Both must be updated
# atomically if the installer identity needs to change.
appId: ai.goatide.GoatIDE
win:
  artifactName: GoatIDE-Setup-${version}.exe
```

Add a CI script `scripts/ci/assert-installer-appid-stable.sh` that greps the GUID from `prepare_goatide.sh` and from `electron-builder.yml` and asserts they have not drifted.

**Warning signs:**
- Two `GoatIDE` entries appear in Windows "Add/Remove Programs" after an NSIS upgrade.
- `electron-updater` logs `cannot find existing installation path` on a machine with a prior GoatIDE install.

**Phase to address:**
C3 Wave 0 — define `electron-builder.yml` with the cross-reference comment before any installer build is attempted. The CI gate above is a Wave-0 prerequisite.

---

### Pitfall 9: POLISH-01 Walkthrough `completionEvents` Fires Before `onboardingComplete` Config Is Written — Shows Again on Next Launch

**What goes wrong:**
VS Code's `contributes.walkthroughs` `completionEvents` fires when a user completes all steps. The completion state is tracked by VS Code's Getting Started panel internally per-step. However, GoatIDE's `onboardingComplete` config key (written via `vscode.workspace.getConfiguration('goatide').update('onboardingComplete', true, ConfigurationTarget.Global)`) is written asynchronously in a step's `completionEvents` handler. If the user completes the walkthrough and immediately closes VS Code before the async config write completes (typically < 50ms, but possible on slow disks), the `when: "!goatide.onboardingComplete"` context key is never set on restart and the walkthrough appears again.

**Why it happens:**
`ConfigurationTarget.Global` writes to `~/.config/Code/User/settings.json` (Linux) or `%APPDATA%\Code\User\settings.json` (Windows). The write is an async file operation. VS Code does not guarantee that `GlobalStorageUri` writes complete before `deactivate()` returns.

**Consequences:**
- The onboarding walkthrough appears on every GoatIDE launch for users who close VS Code immediately after completing the walkthrough steps.
- The `when` condition guard works correctly for subsequent launches where the config was successfully written.

**How to avoid:**
Use VS Code's `ExtensionContext.globalState.update('goatide.onboardingComplete', true)` instead of `WorkspaceConfiguration.update`. `globalState` writes to the extension's `globalStoragePath` (a dedicated file per extension), which is flushed synchronously as part of the extension host shutdown sequence. The `when` context key can still be set via `vscode.commands.executeCommand('setContext', 'goatide.onboardingComplete', true)` from `activate()` by reading `context.globalState.get('goatide.onboardingComplete')`.

**Warning signs:**
- The walkthrough reappears on the launch after first completion on Windows (slower disk flush on `%APPDATA%`).
- `settings.json` does not contain `goatide.onboardingComplete: true` on a machine where the walkthrough was "completed."

**Phase to address:**
POLISH-01 Wave 0 — add a test that mocks `context.globalState` and asserts the completion handler writes `goatide.onboardingComplete = true` to `globalState`, not to `WorkspaceConfiguration`.

---

### Pitfall 10: DEEP-02 WebGL Renderer Breaks Edge Styles — Enabled Accidentally via a Flag Passed as Option

**What goes wrong:**
Cytoscape 3.31+ introduced an opt-in WebGL renderer via `cytoscape({ webgl: true, ... })`. The STACK.md recommendation explicitly forbids this for v2.0 (it is provisional with documented API-breaking changes and does not support `segments` edge style). A developer inspecting Cytoscape release notes (or the Graphify reference repo's future fork) adds `webgl: true` to the `cytoscape()` initialization call to improve performance on large graphs. Segment edges (`curve-style: segments`) and some node shapes are silently dropped or rendered incorrectly. The Graph Inspector's time-travel edges (which use different styles to indicate `valid_from`/`invalidated_at` status) disappear entirely.

**Why it happens:**
Cytoscape's API accepts the `webgl` option without throwing even on canvas-renderer builds — it silently falls back or partially activates depending on the Chromium version in the Electron build. The flag is a single boolean that looks harmless.

**How to avoid:**
Add an explicit `webgl: false` to the `cytoscape()` initialization options in the Graph Inspector component:

```typescript
const cy = cytoscape({
	container: containerRef.current,
	webgl: false,  // EXPLICIT: provisional, API-breaking; blocked for v2.0. See STACK.md.
	elements: cyElements,
	style: cytoscapeStylesheet,
	layout: { name: 'fcose' },
});
```

Add a comment referencing STACK.md. This makes the intention explicit and prevents a future "optimization" removing the flag.

**Warning signs:**
- Edge segments (`curve-style: segments`) are missing from the inspector render.
- Cytoscape logs `[INFO] Using WebGL renderer` to the browser console (visible in VS Code's webview DevTools).

**Phase to address:**
DEEP-02 implementation wave — the `cytoscape()` initialization must include `webgl: false` from day one. Verified in Wave-0 visual smoke test: open the inspector, confirm edges are visible.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Passing raw `NodeRow[]` to Cytoscape without projection | 10 lines less code | Mutation of bitemporal timestamps; silent query corruption | Never |
| Sharing `KernelClient` reference with DEEP-05 lens UI directly | Avoids new interface | Accidental graph writes from read-side component | Never — always use `ReadonlyKernelClient` |
| Using `contributes.walkthroughs` `completionEvents` with async `WorkspaceConfiguration.update` | Standard VS Code pattern | Walkthrough reappears after fast shutdown | Only acceptable in dev where fast shutdown is unlikely; use `globalState` for production |
| Skipping the `refuse-stale-bridge-mirror.sh` check for DEEP-02 cytoscape addition | Faster CI iteration | Mirror diverges; production activate-time failure | Never — the mirror check is the guard that caught BRIDGE-POLISH-01's 5 missing commands |
| Initializing `electron-updater` without `VSCODE_DEV` guard | Simpler code | CI exits with updater network failure; dev machines self-update | Never — the guard is 3 lines |
| Adding `repoId` column to `nodes` without backfilling `primary` | One migration fewer | Cross-repo `queryByAnchor` returns mixed results | Never — always backfill in the same migration that adds the column |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Cytoscape.js ↔ kernel RPC (DEEP-02) | Pass `NodeRow.payload` objects directly to `cy.add()`; Cytoscape mutates them | Project via `kernelRowToCyElement()`, keep kernel rows in frozen state separately |
| DEEP-06 ↔ `GraphDAO.seed()` | Seed cross-repo nodes without a `repoId` — defaults to `null` or empty string | Migration adds `repo_id TEXT NOT NULL DEFAULT 'primary'`; `seed()` requires explicit `repoId` for non-primary repos |
| electron-updater ↔ `VSCODE_DEV=1` (C3) | Missing `isUpdaterActive()` + `VSCODE_DEV` double guard | Both guards in `goatideUpdater.ts`; CDPharness asserts `isUpdaterActive()` is false in dev mode |
| electron-builder NSIS ↔ `prepare_goatide.sh` GUIDs (C3) | `appId` in `electron-builder.yml` drifts from `win32x64AppId` GUID in `prepare_goatide.sh` | Cross-reference comment + `assert-installer-appid-stable.sh` CI gate |
| DEEP-02 inspector webview ↔ `CanvasPanel` singleton (bridge) | Import `CanvasPanel.getOrCreate()` for inspector; singleton clash on `VIEW_TYPE` | Separate `GraphInspectorPanel` class with distinct `viewType = 'goatide.graphInspector'` |
| DEEP-02 cytoscape esbuild bundle ↔ bridge mirror (`prepare_goatide.sh`) | `cytoscape` in `dependencies` → lands in mirror `node_modules` → `refuse-stale-bridge-mirror` fails | `cytoscape` and `cytoscape-fcose` in `devDependencies`; esbuild resolves from devDeps at bundle time |
| POLISH-02 settings `scope: "resource"` ↔ `WorkspaceConfiguration` read in save-gate | Read `goatide.saveGate.destructive` without a `workspaceUri` — returns global value, ignoring per-workspace override | `vscode.workspace.getConfiguration('goatide.saveGate', doc.uri)` in the save-gate handler |
| DEEP-04 historical-supersession ↔ CLOSE-03 `asOf` timing | Capture `asOf` before graph writes when testing DEEP-04 | Capture `asOf = new Date(Date.now() + 1).toISOString()` AFTER all seed writes (CLOSE-03 lesson) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| DEEP-02 time-travel slider fires `cy.remove()` + `cy.add()` on every slider tick | Inspector freezes at 20+ slider moves per second | Debounce slider input (150ms); update `cy.elements().hide()`/`show()` using Cytoscape's built-in filter rather than remove/add | ~50 slider ticks per second with a 1K-node graph |
| DEEP-01 `queryRationaleChain` traverses supersession chains to depth 10+ in old repos | RPC times out after 5s (default `DEFAULT_REQUEST_TIMEOUT_MS`); Canvas shows degraded | Cap supersession chain depth at 5 in the recursive CTE (existing `max_hops` pattern); expose as a parameter with default 5 | Repos with more than 5 supersession generations for a single node (rare in v2.0 but possible for actively-refactored contracts) |
| DEEP-06 cross-repo `queryByAnchor` scans all `repo_id` values without an index | `queryByAnchor` latency increases linearly with number of repos stitched | Add `INDEX nodes_repo_id` in the DEEP-06 migration; the existing `nodes_kind_active` partial index does not cover `repo_id` | 3+ repos stitched with 10K+ total nodes |
| DEEP-03 `runHypotheticalRipple` runs synchronously on the kernel's TCP request thread | Other RPC calls (heartbeat, save-gate proposeEdit) queue behind the ripple walk | Run `runHypotheticalRipple` in a `setTimeout` (already a common pattern in the kernel's RPC server) or add a `nodeCap: 200` hard cap for the hypothetical variant | Contracts with 500+ first-hop protects edges |
| DEEP-02 `cytoscape-fcose` layout runs on every panel show — slow for 500+ nodes | Inspector hangs for 2s on open | Run fcose layout once on first open; persist `cy.nodes().positions()` to React state; on subsequent shows, restore positions via `cy.layout({ name: 'preset', positions })` | 200+ nodes, `fcose` `animate: true` option enabled |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| DEEP-06 cross-repo stitching reads `git remote get-url origin` and injects the URL directly into a SQL `repo_id` column | SQL injection if a malicious `.gitconfig` has a crafted remote URL | Pass the git remote URL through a `crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)` fingerprint before using as `repo_id`; never store the raw URL in the graph schema |
| DEEP-02 inspector posts untrusted node payload `body` text into a `vscode.window.showInformationMessage` or `reveal_line` handler without sanitization | XSS in the webview context (body field could contain `<script>` or VSCode markdown injection) | All node `body` text in the webview must be rendered via React `children` (JSX text nodes auto-escape); the `reveal_line` handler already validates `msg.payload.file` and `msg.payload.line`; add `typeof line === 'number'` guard |
| C3 `electron-updater` `dev-app-update.yml` committed to the repo with real GitHub token | Token exposed in git history | Ensure `dev-app-update.yml` is `.gitignore`d; use a GitHub Actions secret for the publish token; never commit `GH_TOKEN` to the repo |
| POLISH-02 `goatide.saveGate.*` workspace config readable by untrusted workspace extensions | A malicious extension sets `suppress` for destructive saves via workspace settings | Per VS Code security model, workspace settings are visible to all extensions in the workspace; this is a known VS Code limitation, not a GoatIDE-specific fix. Document it in POLISH-02 release notes. |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| DEEP-02 time-travel slider uses Unix epoch milliseconds for tick labels | Users see "1746000000000" instead of "2026-04-30 10:23" in the timeline | Format with `new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp))` |
| DEEP-04 IntentDrift historical-supersession surfaced as a blocking modal | Users are interrupted while editing for a drift that is informational, not a save-gate violation | DEEP-04 is a status-bar + inline decoration surface (same as VIS-03/04/05), NOT a modal. Never route DEEP-04 through `tier-dispatch.ts` modal path. |
| POLISH-03 empty state shows "Receipt: 0 citations" with no call to action | Users don't know what to do when no citations exist | Show "No graph citations yet — save a change to a file annotated with a ConstraintNode or DecisionNode to see a receipt here" with a link to POLISH-01 walkthrough |
| POLISH-01 walkthrough auto-opens on every launch before `onboardingComplete` is set | Interrupts expert users who already know the tool (e.g. after a reinstall) | Add a "Don't show again" step that explicitly sets `context.globalState.update('goatide.onboardingComplete', true)` immediately on user interaction |

---

## "Looks Done But Isn't" Checklist

- [ ] **DEEP-02 Graph Inspector:** Verify `VIEW_TYPE` is `'goatide.graphInspector'` (not `'goatide.canvas'`) — check `grep -r "goatide.canvas" src/vs/goatide/extensions/goatide-bridge/src/inspector/`
- [ ] **DEEP-02 Cytoscape deps:** Verify `cytoscape` is in `devDependencies` (not `dependencies`) in `goatide-bridge/package.json` — check `cat src/vs/goatide/extensions/goatide-bridge/package.json | jq '.devDependencies.cytoscape'`
- [ ] **DEEP-02 After mirror regen:** Verify `extensions/goatide-bridge/node_modules/cytoscape` does NOT exist — check `ls extensions/goatide-bridge/node_modules | grep cytoscape` (should be empty)
- [ ] **DEEP-03 RPC handler:** Verify `runHypotheticalRipple` does not mutate the `ComplianceReport` from `runRippleAnalysis` — kernel unit test covers this (Wave 0 stub requirement)
- [ ] **DEEP-05 component:** Verify no direct `KernelClient` import in `src/.../inspector/` — check `grep -r "KernelClient" src/vs/goatide/extensions/goatide-bridge/src/inspector/`
- [ ] **DEEP-06 migration:** Verify `nodes` table has `repo_id TEXT NOT NULL DEFAULT 'primary'` — check `sqlite3 ~/.goatide/graph.db .schema nodes`
- [ ] **C3 auto-updater:** Verify `initAutoUpdater()` exits immediately when `process.env.VSCODE_DEV = '1'` — CDPharness assertion required
- [ ] **C3 auto-updater:** Verify `dev-app-update.yml` is in `.gitignore` — check `cat .gitignore | grep dev-app-update`
- [ ] **POLISH-01 walkthrough:** Verify completion writes to `context.globalState`, not `WorkspaceConfiguration` — mocha unit test on the completion handler
- [ ] **POLISH-02 save-gate config read:** Verify `getConfiguration('goatide.saveGate', doc.uri)` uses the resource-scoped overload — grep `on-will-save.ts` after POLISH-02 implementation

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cytoscape mutation corrupts NodeRow timestamps | HIGH (data corruption) | Restore graph.db from last known-good backup; audit all DEEP-02 code for direct `cy.add(nodeRows)` calls; add `kernelRowToCyElement` projection layer |
| CanvasPanel singleton clash (wrong VIEW_TYPE) | MEDIUM (save-gate broken for session) | Kill and restart extension host (`Developer: Restart Extension Host` command); fix `VIEW_TYPE` and rebuild bridge |
| Bridge mirror `refuse-stale-bridge-mirror.sh` fails after adding cytoscape | LOW (CI blocked, not data loss) | Move `cytoscape` from `dependencies` to `devDependencies`; run `prepare_goatide.sh`; confirm mirror has no `node_modules/cytoscape/` |
| electron-updater polls GitHub in CI | LOW (CI failure) | Add `VSCODE_DEV` guard in `goatideUpdater.ts`; no data loss |
| NSIS installer GUID drift (installer identity conflict) | HIGH (users left with duplicate installs) | Publish an uninstall script; bump the GUID in `prepare_goatide.sh` and `electron-builder.yml` together; publish a new installer that uninstalls the old one first |
| Cross-repo node ID collision (DEEP-06) | HIGH (data corruption) | Drop and reseed the affected repo's graph.db; the primary repo's db is unaffected if `repo_id` namespace filter was applied correctly |
| DEEP-05 accidental graph writes | MEDIUM (spurious Attempt nodes) | Identify spurious Attempts via `queryByKind('Attempt')` + `provenance` source audit; supersede each spurious node (append-only — no delete); restrict DEEP-05 to `ReadonlyKernelClient` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Cytoscape mutation of kernel NodeRows | DEEP-02 Wave 0 | `kernelRowToCyElement` unit test: input row unchanged after conversion |
| CanvasPanel singleton VIEW_TYPE clash | DEEP-02 Wave 0 | RED test: `VIEW_TYPE` strings differ; no shared singleton reference |
| Bundle size / mirror regen for cytoscape | DEEP-02 Wave 0 | CI: `refuse-stale-bridge-mirror.sh` passes; `extensions/.../node_modules/cytoscape` absent |
| ComplianceReport mutation by DEEP-03 scorer | DEEP-03 Wave 0 | Kernel unit test: scorer does not mutate base report |
| DEEP-05 read-side accidental graph writes | DEEP-05 Wave 0 | `ReadonlyKernelClient` interface defined; CI gate `refuse-deep05-write.sh` |
| Cross-repo node ID collision | DEEP-06 Wave 0 | Kernel vitest: seeding with identical ULIDs across repos fails gracefully with `repo_id` namespace |
| electron-updater initializes under VSCODE_DEV | C3 Wave 0 | CDPharness: asserts `isUpdaterActive() === false` in dev mode; unit test for `initAutoUpdater()` |
| NSIS installer GUID ↔ prepare_goatide.sh drift | C3 Wave 0 | CI: `assert-installer-appid-stable.sh` |
| POLISH-01 walkthrough completion race | POLISH-01 implementation wave | Unit test: completion handler uses `context.globalState.update` |
| POLISH-02 per-workspace config wrong scope | POLISH-02 implementation wave | Unit test: `getConfiguration` called with resource URI |
| cytoscape WebGL renderer enabled accidentally | DEEP-02 implementation wave | `cy._private.renderer.type === 'canvas'` asserted in visual smoke test |
| DEEP-04 drift surfaced as modal (wrong tier) | DEEP-04 implementation wave | Verify DEEP-04 surfaces only in status-bar/decoration path; no `tier-dispatch.ts` modal route |

---

## Planning Workflow Pitfall (2026-05-12 Incident)

### Pitfall 0: Destructive Subagent Destroys `.planning/` and `.claude/`

**What goes wrong:**
A subagent spawned for planning (e.g. `gsd-planner`) is given shell access and runs `git clean -fdx` to "clean the workspace before planning." This command removes all gitignored files — including `.planning/` (gitignored at line 54) and `.claude/` (also gitignored). Twelve phases of planning artifacts, phase verification records, and MEMORY context are gone permanently. Recovery from git history produces only approximate reconstructions.

**Why it happens:**
`gsd-planner`'s stated job is authoring PLAN.md files. It does not need shell access beyond reading existing files. Developers (and orchestrators) give it broad bash access "just in case," and the planner uses standard `git clean` as a safe workspace-reset operation — not knowing that the repo has gitignored planning artifacts.

**How to avoid:**
- Spawn planning subagents with an **explicit safety fence** in the prompt: "Do NOT run destructive bash. Use Read/Grep/Glob for inspection. No `git clean`, no `git reset --hard`, no `rm -rf`. Your job is to author PLAN.md files — you need no shell access."
- The `settings.json` deny rules for `git clean` and `git reset --hard` cover the top-level agent. Verify these propagate to all spawned subagents.
- Add `.planning/` and `.claude/` to the repo root `.gitignore` with a comment: "Planning artifacts — DO NOT git clean. See .claude/CLAUDE.md Destructive-Command Guardrails."
- Back up `.planning/` to a non-gitignored location (e.g. a `planning-backup/` branch) after each phase closes.

**Warning signs:**
- A subagent's first bash command is `git status`, `git clean`, or `git stash` without a specific file target.
- A subagent asks for confirmation before running `git clean` (this should have been caught before spawning).

**Phase to address:**
Every phase that spawns a subagent — always include the safety fence. This is a process pitfall, not a code pitfall.

---

## Sources

- GoatIDE source inspection: `kernel/src/graph/dao.ts` (append-only invariant, no delete/update), `kernel/src/drift/ripple.ts` (ComplianceReport construction, nodeCap defense), `src/vs/goatide/extensions/goatide-bridge/src/canvas/panel.ts` (singleton dispose ordering, CLOSE-02 canvas.ready, badListeners fix), `src/vs/goatide/extensions/goatide-bridge/src/save-gate/on-will-save.ts` (HARDEN-01 auto-save bypass, HARDEN-02 sync-veto), `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts` (all RPC methods on a single class)
- GoatIDE commit history: CLOSE-01 (ABI rebuild), CLOSE-02 (canvas.ready + singleton dispose ordering + badListeners), CLOSE-03 (asOf timing), HARDEN-06 (VSCODE_DEV=1 default), HARDEN-07 (electron-binary postinstall chain)
- `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` (v1.2 carryovers, v2.0 requirements, Known carve-outs)
- `.planning/research/STACK.md` (Cytoscape.js devDependencies recommendation, electron-updater VSCODE_DEV guard, NSIS vs Squirrel recommendation)
- Cytoscape.js docs: element addition API mutates `data` field with internal `_private` bookkeeping — verified via `cy.add()` source inspection
- `scripts/prepare_goatide.sh` — hardcoded GUID constants, mirror regen pattern, `refuse-stale-bridge-mirror.sh` reference
- `src/vs/goatide/extensions/goatide-bridge/package.json` — existing `dependencies` vs `devDependencies` separation; esbuild config shows `bundle: true` for webview

---
*Pitfalls research for: GoatIDE v2.0 — adding deep features + polish + Windows auto-update to VS Code 1.117.0 fork*
*Researched: 2026-05-13*
