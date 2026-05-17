<!--
  Architecture Research — GoatIDE v2.1
  Researched: 2026-05-16
  Confidence: HIGH (all claims sourced from direct code inspection or official docs)
-->

# Architecture Patterns

**Domain:** GoatIDE v2.1 — new capabilities layered onto the existing fork
**Researched:** 2026-05-16
**Confidence:** HIGH — sourced from direct inspection of kernel/, bridge/, build/,
scripts/, and VS Code workbench internals. Web-verified for electron-builder/
electron-updater claims.

---

## Existing Architecture Baseline (do NOT re-research)

Three runtime components — see `.planning/PROJECT.md "Architecture"` section.
The v2.0-archive (`ARCHITECTURE.md`) documents all integration points and
patterns established through Phase 17. This file documents ONLY the v2.1
integration deltas.

---

## v2.1 Capability Area 1: Installable Distribution + Auto-Update

### Where electron-builder slots into the gulp build

The VS Code gulp build system (`build/gulpfile.vscode.ts`, `build/gulpfile.vscode.win32.ts`)
owns source compilation, optimization, and packaging into a VS Code app directory
(e.g. `VSCode-win32-x64/`). It does NOT produce a distributable installer — it
produces a portable app folder. The existing win32 pipeline uses InnoSetup via
`gulpfile.vscode.win32.ts:packageInnoSetup()` for Microsoft's own distribution.
GoatIDE must NOT touch that path (upstream sync hygiene).

**electron-builder is a post-gulp step, not a gulp replacement.**

The correct sequencing is:

```
Step 1 (existing): gulp vscode-win32-x64 / gulp vscode-darwin-arm64
   → produces .build/VSCode-win32-x64/ (portable app directory)

Step 2 (existing): scripts/prepare_goatide.sh
   → applies product.json branding + mirrors bridge extension
   → MUST run before packaging so the mirror is current

Step 3 (new): npx electron-builder --prepackaged .build/VSCode-win32-x64 --config electron-builder.yml
   → reads already-compiled app from --prepackaged path
   → produces GoatIDE-Setup-x64.exe (NSIS) on win32 or GoatIDE.dmg on darwin
   → generates latest.yml / latest-mac.yml for electron-updater
   → uploads installer + YAML to GitHub Releases
```

The key is `--prepackaged` (electron-builder flag): it skips electron-builder's
own compile step and packages an already-built Electron app directory. This avoids
any conflict with the gulp compile pipeline.

**`electron-builder.yml` at repo root** (confirmed correct from v2.0 architecture
research, Anti-Pattern 5). Never add a `build` key to root `package.json` — the
VS Code gulp tasks read `package.json` programmatically and that key conflicts.

Minimum `electron-builder.yml` shape:

```yaml
appId: ai.goatide.GoatIDE
productName: GoatIDE

win:
  target:
    - target: nsis
      arch: [x64, arm64]
  certificateFile: ${env.WIN_CERTIFICATE_PATH}
  certificatePassword: ${env.WIN_CERTIFICATE_PASSWORD}

mac:
  target:
    - target: dmg
      arch: [arm64, x64]
  identity: ${env.APPLE_IDENTITY}
  hardenedRuntime: true
  notarize:
    teamId: ${env.APPLE_TEAM_ID}

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true

publish:
  provider: github
  owner: <github-owner>
  repo: goatide

directories:
  output: dist/
```

**Bridge mirror must complete before `electron-builder` runs.** The `extensions/goatide-bridge/`
directory (the mirror at 2 `..` from root) is what gets packaged. If
`prepare_goatide.sh` has not run, the installer contains a stale bridge.
A packaging script (`scripts/package-goatide.sh`) should enforce this order:
`prepare_goatide.sh` → gulp compile → `electron-builder --prepackaged`.

### Where electron-updater plugs in

**Call site:** `src/vs/code/electron-main/main.ts`. This file is the Electron
main process entry for GoatIDE. The bootstrap calls `app.whenReady()` and
then instantiates services. The least-invasive injection point is immediately
after `app.whenReady()` but before the IPC server starts — calling
`initializeGoatideUpdater()` from `src/vs/goatide/update/goatideUpdater.ts`.

The v2.0 architecture research already pinned this file and pattern (HIGH
confidence — confirmed by reading the actual `main.ts`). Key guard:

```typescript
// src/vs/goatide/update/goatideUpdater.ts
import { autoUpdater } from 'electron-updater';

export function initializeGoatideUpdater(): void {
    if (process.env.VSCODE_DEV) {
        return; // dev mode: updater inactive (HARDEN-06 pattern)
    }
    autoUpdater.checkForUpdatesAndNotify().catch(e => {
        console.error('[goatide-updater] checkForUpdatesAndNotify failed:', e);
    });
}
```

**When to check for updates:** Once at startup (after `app.whenReady()`), with
a periodic fallback every 4 hours. The startup check is fire-and-forget — it
must not block the main window opening. Periodic check: use `setInterval` inside
`goatideUpdater.ts`, also gated on `!process.env.VSCODE_DEV`.

**UI surface:** electron-updater's `autoUpdater.checkForUpdatesAndNotify()` shows
a native system notification when an update is available, with a "Restart to
update" button. For a custom in-app notification (e.g. status-bar entry), listen
to `autoUpdater.on('update-available', ...)` and call
`vscode.window.showInformationMessage()` from the bridge — but this requires
an IPC bridge from the Electron main process to the extension host. The simpler
path for v2.1 is the native notification (zero bridge changes).

**What electron-builder generates for auto-update:**

When `electron-builder` runs with `publish: { provider: github }`, it generates
and uploads:
- `latest.yml` (Windows NSIS target)
- `latest-mac.yml` (macOS DMG target)

These YAMLs contain `version`, `path`, `sha512`, `releaseDate`, and optional
`stagingPercentage`. The electron-updater on the installed GoatIDE polls the
GitHub Releases API for these files to decide whether to download.

**Code-signing certificate injection:** Use CI environment variables, never
committed secrets. For Windows: `WIN_CERTIFICATE_PATH` + `WIN_CERTIFICATE_PASSWORD`
(PKCS#12 .pfx). For macOS: `APPLE_IDENTITY` (Developer ID Application cert
CN in keychain) + `APPLE_TEAM_ID` + `APPLE_ID` + `APPLE_ID_PASSWORD` for
notarization. electron-builder reads these from env automatically when the
`electron-builder.yml` keys reference `${env.XXX}`.

**macOS notarization (C1):** `hardenedRuntime: true` + `notarize.teamId` in
`electron-builder.yml` triggers `notarytool` submission as part of the build.
Requires Apple Developer Program membership. In CI: use the
`@electron/notarize` package or rely on electron-builder's built-in notarize
support (available since electron-builder v24+).

**Dependencies placement:**
- `electron-builder` → root `devDependencies` (build-time only, not in packaged app)
- `electron-updater` → root `dependencies` (must ship in the packaged app's
  `node_modules` so the Electron main process can `require('electron-updater')`)

### How Phase 18 verification harness reaches a real installed binary

The current `phase17-smoke-cdp.cjs` harness launches the **dev-mode** Electron
binary from `.build/electron/` with `VSCODE_DEV=1` and
`--extensionDevelopmentPath`. This is fundamentally different from a real
installed GoatIDE in two ways:

1. **Binary:** Dev mode uses the raw `electron` binary from `.build/electron/`.
   A real installed GoatIDE uses the bundled, signed GoatIDE binary.
2. **Extension loading:** Dev mode loads the bridge from
   `src/vs/goatide/extensions/goatide-bridge/` (dev path, 5 `..`).
   A real installed GoatIDE loads the bridge from `extensions/goatide-bridge/`
   (the mirror, 2 `..`), which goes through the normal extension host loader.

**Phase 18 verification has two valid architectures. Choose one explicitly:**

**Option A — Dev-mode-first (lower risk, recommended for Phase 18):**
Run the existing `phase17-smoke-cdp.cjs` harness first (dev mode). If it
passes, proceed to a real installable build verification as a separate CI
step. Phase 18 proves the install path works; dev-mode smoke remains the
fast feedback loop. This approach avoids blocking Phase 18 on the full
distribution pipeline (which requires code-signing certs).

**Option B — Installable-first (higher fidelity, deferred):**
Build a signed installable with `electron-builder --prepackaged`, install
it on the OS (mount DMG and run the installer .app on macOS; run the NSIS
.exe on Windows silently via `/S`), and then CDP-attach to the installed
process via `playwright._electron.launch({ executablePath: installedBinaryPath })`.
The key difference from dev-mode: `VSCODE_DEV` is NOT set; the updater
should be active; the bridge registration gap should be closed (mirror
at 2 `..` is what loads).

**Recommended call:** Option A for Phase 18 because code-signing certs for
C1/C2 have not yet been procured. Phase 18 should extend
`phase17-smoke-cdp.cjs` to also verify:
- Bridge loads from the mirror path (not dev path): check
  `renderer.log` for absence of "Loading development extension at..."
- `resolveKernelPath` selects the 2-`..` candidate (not the 5-`..` one)
- electron-updater is inactive (VSCODE_DEV guard verified)

For the installable-binary route (when certs are available): a new
`scripts/test/phase18-install-smoke-cdp.cjs` should:
1. Locate the built installer at `dist/GoatIDE-Setup-*.exe` or `dist/GoatIDE-*.dmg`
2. On macOS: `hdiutil attach GoatIDE.dmg -mountpoint /tmp/goatide-dmg && cp -R /tmp/goatide-dmg/GoatIDE.app /Applications/GoatIDE.app && hdiutil detach /tmp/goatide-dmg`
3. On Windows: `GoatIDE-Setup-x64.exe /S` (NSIS silent install)
4. Resolve the installed binary path (platform-specific, not `.build/electron/`)
5. `playwright._electron.launch({ executablePath: installedBinaryPath, args: [ROOT], env: { ...process.env } })` — no `VSCODE_DEV`
6. Attach CDP, run the same SC assertions as `phase17-smoke-cdp.cjs`

The Phase 18 harness should reuse the `waitForCondition` utility and the
SC-numbered assertion pattern from `phase17-smoke-cdp.cjs` to maintain
consistency.

---

## v2.1 Capability Area 2: DecisionNode Authoring Write Path

### Current state

`goatide.canvas.addDecisionNode` is a placeholder command in `extension.ts`
(registered in Phase 17 Plan 17-03) that calls `showInformationMessage`.
The `CitationList.tsx` empty-state CTA fires `canvas.requestAddDecisionNode`
→ `panel.ts` routes it to the command.

### New components needed

**Kernel side — new RPC:**

The write path requires a new kernel RPC: `graph.createDecisionNode`. It
takes a `{ body: string; anchorFile: string; asOf: string }` payload and
calls `GraphDAO.seed()` with `kind: 'DecisionNode'` and the provided body.
This follows the same append-only pattern as all existing seed calls.

```typescript
// kernel/src/rpc/methods.ts — new request type
export interface CreateDecisionNodeParams {
    body: string;
    anchorFile: string; // used to build the NodePayload ticket_id from the file path
    asOf: string;
}
export interface CreateDecisionNodeResult {
    node_id: string;
    ticket_id: string;
}
export const CreateDecisionNodeRequest = new RequestType<
    CreateDecisionNodeParams, CreateDecisionNodeResult, Error
>('graph.createDecisionNode');
```

**Mandate A compliance:** `graph.createDecisionNode` does NOT accept an LLM
rationale string. The `body` field must be user-authored text only. The
`refuse-llm-in-canvas.meta.sh` CI gate already enforces no LLM tokens in
`canvas/**`; the write-path UI must pass the same gate. The body is whatever
the user types in a form — no auto-suggestion, no LLM prefix.

**Mandate B compliance:** The kernel-side handler calls `GraphDAO.seed()`,
which is the one allowed mutation in the append-only graph. This is NOT a
violation of Mandate B (which prohibits inspector write-back, not all writes).
The inspector MUST NOT call this RPC — the `refuse-deep05-write.sh` gate must
be extended to add `createDecisionNode` to its BANNED token list alongside
`atomicAccept|proposeEdit|recordRejection|recordContractOverride`.

**Bridge side — where the form lives:**

The authoring form should live in the canvas webview (same React tree as
`App.tsx`), not in the extension host `panel.ts`. Rationale: the form needs
VS Code-themed UI (already bootstrapped via the webview) and the user should
see it in context with the existing receipt.

Pattern:
1. User clicks "Add DecisionNode" CTA in `CitationList.tsx`
2. `canvas.requestAddDecisionNode` message posts to `panel.ts`
3. `panel.ts` posts back a `canvas.showDecisionNodeForm` message
4. `App.tsx` renders `<DecisionNodeForm />` (new React component)
5. User fills body, submits → `canvas.submitDecisionNode` message posts to `panel.ts`
6. `panel.ts` calls `kernel.createDecisionNode(...)` via `KernelClient`
7. `panel.ts` posts `canvas.decisionNodeCreated { node_id }` back to webview
8. Webview shows success state; form closes

The `KernelClient.createDecisionNode()` method is a **write** method and must
NOT be on `ReadonlyKernelClient`. The inspector receives only `ReadonlyKernelClient`
(Mandate B); the canvas panel holds the full `KernelClient`.

**Save-gate interaction:** Creating a DecisionNode does NOT trigger the save-gate.
It is an explicit user action, not an intercept of `onWillSaveTextDocument`. The
CTA in the empty-state exists precisely for when there are zero citations — no
anchor to trigger a save-gate flow. The `createDecisionNode` RPC writes a node
but not an Attempt or Receipt; it does not touch the tier classification path.

**Post-hoc rejection (Reject button in dispatchHover):**

The `dispatchHover` POLISH-04 modal shows a compact receipt for benign-tier saves.
Phase 17 POLISH-04 shipped without the Reject button (stub). To make it real:

1. The `recordRejection` kernel RPC already exists (Phase 4 CANV-10) and is wired
   in `KernelClient`. It takes `{ staging_path: string }` and retracts the last
   committed Attempt for that staging path.
2. The hover status-bar message (`vscode.window.setStatusBarMessage()`) is
   transient (4s auto-dismiss) — the Reject affordance cannot live there.
3. Instead: the "Open full receipt" fallback link in the hover already opens the
   CanvasPanel. The Reject button should live there, inside the canvas webview.
4. In the canvas webview, an `<AttemptActions />` component (new) is rendered
   when `lastPayload.staging_path` is defined. It shows a "Reject this commit"
   button. Clicking fires `canvas.requestRejection { staging_path }` → `panel.ts`
   calls `kernel.recordRejection({ staging_path })` → posts result back.
5. `recordRejection` is already on `KernelClient` (NOT `ReadonlyKernelClient`,
   correct — it is a write method). No new kernel RPC needed.

---

## v2.1 Capability Area 3: Cross-Repo Activation — Multi-Daemon Kernel Orchestration

### Current model (single-daemon, from Phase 17)

The bridge spawns exactly one kernel sidecar at activate time via
`kernel.ensureKernel({ kernelPath })` in `extension.ts`. That sidecar owns a
single SQLite DB at `~/.goatide/graph.db` (resolved via `resolveGoatideConfigDir()`).
All nodes/edges carry `repo_id='primary'` by default; the `repo_id` column
introduced in Phase 16 enables query-layer filtering but does NOT change the
single-sidecar model.

The current cross-repo command (`goatide.openCrossRepoGraph`) reads ALL nodes
from the single DB and shows them in the Graph Inspector. Cross-repo edges (where
`src.repo_id != dst.repo_id`) are styled as dashed amber — but in v2.0 they never
fire because all nodes are `repo_id='primary'`.

### What v2.1 needs for real cross-repo writes

For cross-repo edges to actually appear in the graph, nodes from multiple repos must
be written with distinct `repo_id` values. This requires either:

1. **Single-DB multi-repo model (recommended for v2.1 Phase 1):** Every repo
   writes into the same `~/.goatide/graph.db` with its `repo_id` fingerprint.
   The single kernel sidecar handles all repos. Bridge must pass the correct
   `repo_id` when calling `kernel.proposeEdit()` or `kernel.atomicAccept()`.
   The save-gate reads the current workspace folder's `repo_id` (from
   `enumerateWorkspaceRepos()` — already built in Phase 17) and passes it with
   each write.

2. **Per-repo daemon model (deferred, v2.2):** Each repo has its own kernel
   sidecar and its own SQLite DB. The bridge routes RPCs to the correct daemon.
   Multi-DB stitching at the query layer. More complex; not needed for v2.1
   unless the single-DB model hits a concurrency limit.

**Recommended v2.1 architecture: single-DB multi-repo.** Changes required:

**Kernel side:** All write RPCs (`proposeEdit`, `atomicAccept`, `recordRejection`,
`seed`) must accept an optional `repo_id` parameter that overrides the default
`'primary'`. This is a backward-compatible extension — callers that don't pass
`repo_id` get `'primary'`.

**Bridge side (save-gate write path):**

1. At activate time, call `enumerateWorkspaceRepos()` (already in
   `src/inspector/workspace-repos.ts`) to resolve the active workspace's
   `repo_id`.
2. Cache the `repo_id` in `extension.ts` (or a lightweight `WorkspaceRepoState`
   helper) and re-resolve when `vscode.workspace.onDidChangeWorkspaceFolders`
   fires.
3. Pass `repo_id` to `kernel.proposeEdit()` via the `tier-dispatch.ts` call
   site. The bridge `ProposeEditParams` Zod schema must gain an optional
   `repo_id` field.
4. Same for `kernel.atomicAccept()` and `kernel.recordRejection()`.

**`KernelDegradedBanner` stays single-banner** for v2.1 (single kernel, so single
liveness state). Multi-daemon degraded-state handling is a v2.2 concern.

**Process lifecycle:** The single daemon spawned at activate survives IDE close
(Mandate A — the `--daemon` detached spawn pattern). It persists across workspace
folder changes. The `resolveGoatideConfigDir()` path (lockfile at
`~/.goatide/kernel.lock`, DB at `~/.goatide/graph.db`) does not change.

**Connection state machine:** `ConnectionStateMachine` in `kernel/connection-state.ts`
remains unchanged — it tracks one daemon, not multiple.

**New file needed:** `src/vs/goatide/extensions/goatide-bridge/src/kernel/workspace-repo-state.ts`
— a minimal class/module that holds the active `repo_id` string, updates it via
`onDidChangeWorkspaceFolders`, and exposes `getActiveRepoId(): string` for the
save-gate path.

---

## v2.1 Capability Area 4: Walkthrough Foregrounding Fix

### Root cause (confirmed from source inspection)

`maybeAutoOpenWalkthrough()` in `walkthrough-completion.ts` calls:
```typescript
await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID);
```

The `workbench.action.openWalkthrough` handler in
`src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts`
calls `editorService.openEditor()` with `{ selectedCategory: WALKTHROUGH_ID, showWelcome: false }`.
This opens the Getting Started panel with the GoatIDE walkthrough selected.

The race: `StartupPageRunnerContribution.run()` in `startupPage.ts` also calls
`openGettingStarted()` on `LifecyclePhase.Restored`, opening the Welcome page
with the default VS Code walkthrough (or whatever `workbench.startupEditor` is set
to). Both calls arrive at the Getting Started editor at approximately the same
time. VS Code's editor deduplication logic (`editor?.typeId === gettingStartedInputTypeId`)
means whichever call arrives second finds the editor already open and no-ops
(for `openGettingStarted`) — but `openWalkthrough` with a category bypasses
this check and selects a different category.

The actual race is **category-selection order**, not panel visibility. If
`StartupPageRunnerContribution.run()` calls `openGettingStarted(true)` (opens
the Welcome page with showTelemetryNotice), and then the GoatIDE walkthrough
command arrives, the result depends on which `openEditor` call resolves first.
Because `run()` awaits `LifecyclePhase.Restored` and `maybeAutoOpenWalkthrough`
is fire-and-forget at activate time (before `Restored`), the GoatIDE walkthrough
command can arrive BEFORE VS Code's startup page — which should win the race.

**But the actual problem is that GoatIDE has `product.json` branding changes
and no `enableTelemetry: true`** (since this is a fork and the telemetry
opt-out branch fires first). The `startupPage.ts` `tryShowOnboarding()` and the
telemetry notice branch gating mean the exact behavior depends on the GoatIDE
`product.json` telemetry flags.

**Fix options:**

1. **Set `workbench.startupEditor` to `none` in GoatIDE default settings:**
   The GoatIDE fork can ship a default `settings.json` in `resources/` that
   sets `"workbench.startupEditor": "none"`. This prevents `StartupPageRunner`
   from competing entirely. The GoatIDE walkthrough then exclusively owns
   first-launch. This is the least-invasive fix. File location:
   `resources/app/goatide-defaults.json` (referenced from `product.json`
   `"defaultSettings"` key, or via a VS Code preferences override file).

2. **Use `workbench.action.openWalkthrough` with `{ inactive: false }` and
   `{ toSide: false }` after a `LifecyclePhase.Restored` await:**
   Change `maybeAutoOpenWalkthrough` to await the `LifecyclePhase.Restored`
   event before calling `openWalkthrough`. This guarantees the GoatIDE
   command arrives AFTER the Welcome page runner, allowing it to switch the
   selected category. Access lifecycle via a lightweight IPC message or a
   new `vscode.window.onDidStartup` (which does not exist in the API — this
   approach is not viable from an extension).

3. **Fork `startupPage.ts` to add GoatIDE walkthrough priority:**
   Modify `StartupPageRunnerContribution.run()` in the VS Code workbench to
   check for GoatIDE's onboarding completion flag first and open the GoatIDE
   walkthrough if not complete. This is the highest-fidelity fix but touches
   `src/vs/workbench/` (flagged by `refuse-vs-workbench-edits.sh` CI gate).

**Recommended fix for v2.1: Option 1.** Override `workbench.startupEditor` to
`"none"` in the GoatIDE product default settings. Add the GoatIDE-specific
default settings file. Then ensure `maybeAutoOpenWalkthrough` in the bridge
fires without competition. This avoids any workbench fork change.

Implementation:
- New file: `resources/app/goatide-settings.json` (or append to
  `product.json`'s `"defaultSettings"` key if VS Code supports it).
- Alternative: inject `"workbench.startupEditor": "none"` into the user
  settings during first-run via `vscode.workspace.getConfiguration('workbench').update(...)`.
  This is brittle (writes to user settings) — avoid.
- Best: VS Code forks can override defaults via `product.json`'s
  `"configurationDefaults"` key (if available in 1.117). Inspect the
  upstream `product.json` schema for `configurationDefaults`. If present,
  add: `"configurationDefaults": { "workbench.startupEditor": "none" }`.

**Phase 18 verification for this fix:** The CDP smoke SC3b probe already
exists in `phase17-smoke-cdp.cjs` (polls for walkthrough title in the window
title). If the fix works, SC3b flips from SOFT-FAIL to PASS.

---

## Component Map — New vs Modified for v2.1

### New Files

| File | Capability | Notes |
|------|-----------|-------|
| `electron-builder.yml` | Distribution | Repo root; standalone config (Anti-Pattern 5 fence) |
| `src/vs/goatide/update/goatideUpdater.ts` | Distribution | electron-updater init; VSCODE_DEV guard |
| `scripts/package-goatide.sh` | Distribution | Orchestrates: prepare_goatide.sh → gulp compile → electron-builder |
| `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/DecisionNodeForm.tsx` | Authoring | React form for body input; no LLM prompt |
| `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/AttemptActions.tsx` | Authoring | Reject button component in canvas webview |
| `src/vs/goatide/extensions/goatide-bridge/src/kernel/workspace-repo-state.ts` | Cross-repo | Tracks active `repo_id` for save-gate; reacts to folder changes |
| `scripts/test/phase18-smoke-cdp.cjs` | Verification | Extends phase17 harness; verifies mirror-path bridge load + SC3b fix |

### Modified Files

| File | Capability | What Changes |
|------|-----------|-------------|
| `src/vs/code/electron-main/main.ts` | Distribution | Conditional call to `initializeGoatideUpdater()` after `app.whenReady()` |
| `root package.json` | Distribution | Add `electron-updater` to `dependencies`; `electron-builder` to `devDependencies` |
| `kernel/src/rpc/methods.ts` | Authoring + Cross-repo | Add `CreateDecisionNodeRequest`; add `repo_id` optional to `ProposeEditParams` |
| `kernel/src/rpc/server.ts` | Authoring + Cross-repo | Register `graph.createDecisionNode` handler; extend proposeEdit handler to accept `repo_id` |
| `kernel/src/graph/dao.ts` | Authoring + Cross-repo | Implement `createDecisionNode()` via existing `seed()`; pass `repo_id` to mutation methods |
| `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts` | Authoring + Cross-repo | Add `createDecisionNode()` write method; extend `proposeEdit()` params |
| `src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts` | Authoring | Re-export `CreateDecisionNodeRequest` type (bridge mirror pattern) |
| `scripts/ci/refuse-deep05-write.sh` | Authoring | Add `createDecisionNode` to BANNED token list for inspector/ scope |
| `src/vs/goatide/extensions/goatide-bridge/src/canvas/panel.ts` | Authoring | Wire `canvas.requestAddDecisionNode` → form show flow; `canvas.submitDecisionNode` → kernel write |
| `src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts` | Authoring | Add `canvas.showDecisionNodeForm`, `canvas.submitDecisionNode`, `canvas.decisionNodeCreated` message types |
| `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/App.tsx` | Authoring | Mount `<DecisionNodeForm />` conditional on `showDecisionNodeForm` state |
| `src/vs/goatide/extensions/goatide-bridge/src/save-gate/tier-dispatch.ts` | Cross-repo | Read `repo_id` from `WorkspaceRepoState`; pass to `kernel.proposeEdit()` |
| `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` | Cross-repo + Walkthrough | Instantiate `WorkspaceRepoState`; update `goatide.canvas.addDecisionNode` from stub to real form launcher |
| `product.json` | Walkthrough | Add `configurationDefaults: { "workbench.startupEditor": "none" }` (if key is supported); OR via separate mechanism |
| `scripts/prepare_goatide.sh` | Distribution | Preserve `configurationDefaults` override across upstream sync (brander idempotency) |

---

## Data Flow Changes by Capability

### Distribution + Auto-Update data flow (new)

```
CI: npx electron-builder --prepackaged .build/VSCode-win32-x64 --config electron-builder.yml
    ↓ reads electron-builder.yml
    ↓ signs binary with WIN_CERTIFICATE_PATH cert
    ↓ produces GoatIDE-Setup-x64.exe + latest.yml
    ↓ uploads both to GitHub Releases (GITHUB_TOKEN)

Installed GoatIDE first launch:
    ↓ Electron main process app.whenReady()
    ↓ initializeGoatideUpdater() called from main.ts
    ↓ VSCODE_DEV not set → updater active
    ↓ autoUpdater.checkForUpdatesAndNotify()
        ↓ fetches latest.yml from GitHub Releases
        ↓ compares version against current
        ↓ if newer: downloads installer, shows native notification
        ↓ on user confirm: installs update, restarts
```

### DecisionNode authoring write flow (new)

```
User sees empty-state "Add DecisionNode" CTA in CanvasPanel webview
    ↓ CitationList.tsx: onClick → onAddDecisionNode callback
    ↓ canvas/rpc.ts postAddDecisionNode()
    ↓ panel.ts handleMessage('canvas.requestAddDecisionNode')
    ↓ posts 'canvas.showDecisionNodeForm' to webview
App.tsx renders <DecisionNodeForm />
    ↓ User types body text, clicks Submit
    ↓ canvas/rpc.ts: postSubmitDecisionNode({ body })
    ↓ panel.ts handleMessage('canvas.submitDecisionNode')
    ↓ kernel.createDecisionNode({ body, anchorFile, asOf: lastPayload.graph_snapshot_tx_time })
        (NEVER Date.now() — Pitfall 1 fence; uses lastPayload asOf)
kernel/src/rpc/server.ts CreateDecisionNodeRequest handler
    ↓ dao.seed({ kind: 'DecisionNode', body, ticket_id: buildTicketId(anchorFile), valid_from: asOf })
    ↓ returns { node_id, ticket_id }
panel.ts posts 'canvas.decisionNodeCreated' to webview
App.tsx closes form, shows success state
```

### Cross-repo write path data flow (new for v2.1 single-DB model)

```
Bridge activate():
    ↓ WorkspaceRepoState.initialize(vscode.workspace.workspaceFolders)
    ↓ enumerateWorkspaceRepos() → [{ folder, repoId, remoteUrl }]
    ↓ stores active repoId for the primary workspace folder

User saves file:
    ↓ on-will-save.ts fires
    ↓ tier-dispatch.ts reads WorkspaceRepoState.getActiveRepoId() → 'abc123def456'
    ↓ kernel.proposeEdit({ diff, destructive, asOf, session_priority, repo_id: 'abc123def456' })
kernel ProposeEditRequest handler:
    ↓ dao.seed({ ..., repo_id: 'abc123def456' })
    ↓ node written with non-primary repo_id
    ↓ Graph Inspector cross-repo edge styling activates (src.repo_id != dst.repo_id)
```

---

## Build Order for v2.1 Phases

The ordering is driven by two hard dependencies:
(a) Phase 18 (verification) should come first — it closes the dev-mode → installable
    trust gap and surfaces any v2.0 breakage before adding more code.
(b) Distribution (C1/C2/C3) requires code-signing certs (C1: Apple Developer ID,
    C2: EV cert) which have not been procured; this may gate progress.

```
Phase 18: E2E Verification Gate (FIRST — gates everything else)
    Goal: Prove v2.0 features work on a real installable build (or extended dev-mode).
    Key: Extend phase17-smoke-cdp.cjs with:
         - SC11 fix (cross-repo command in single-folder workspace)
         - SC12 fix (settings UI dropdown render)
         - SC3b walkthrough foregrounding probe
    Deliverable: phase18-smoke-cdp.cjs with all 12 SCs passing (or explicit deferral
    per SC with documented reason).
    Does NOT require: code-signing certs (dev-mode Option A)
    Bridge mirror regen: no (no package.json changes)

Phase 19: Walkthrough Foregrounding Fix (SECOND — low blast radius, high UX value)
    Goal: Make SC3b (walkthrough foreground probe) pass.
    Key: Inspect product.json for configurationDefaults support. If available, add
         "workbench.startupEditor": "none" and update prepare_goatide.sh brander.
         If not available, find equivalent mechanism in this VS Code version.
    Does NOT require: code-signing certs, kernel changes, bridge mirror regen
    Validation: phase18-smoke-cdp.cjs SC3b flips to PASS

Phase 20: DecisionNode Authoring Write Path (THIRD — extends existing canvas)
    Goal: Replace showInformationMessage placeholder with real write flow.
    Key build order:
         Wave 0: CreateDecisionNodeRequest type + ci gate extension (refuse-deep05-write.sh) + RED tests
         Wave 1: Kernel handler (dao.createDecisionNode → dao.seed())
         Wave 2: KernelClient.createDecisionNode() bridge method
         Wave 3: canvas messages + panel.ts wire-up
         Wave 4: DecisionNodeForm.tsx React component + App.tsx mount
         Wave 5: AttemptActions.tsx Reject button + recordRejection wiring
         Wave 6: phase-verify
    Bridge mirror regen: NO (no package.json changes — DecisionNodeForm is webview-only)
    Mandate A gate: refuse-llm-in-canvas.meta.sh must pass (form body is user text only)

Phase 21: Cross-Repo Activation — Single-DB Multi-Repo (FOURTH)
    Goal: Real cross-repo edges appear in Graph Inspector.
    Key build order:
         Wave 0: WorkspaceRepoState module + ProposeEditParams repo_id extension + RED tests
         Wave 1: Kernel proposeEdit/atomicAccept/recordRejection accept optional repo_id
         Wave 2: tier-dispatch.ts reads WorkspaceRepoState; passes repo_id to kernel
         Wave 3: extension.ts instantiates WorkspaceRepoState + wires onDidChangeWorkspaceFolders
         Wave 4: phase-verify (open 2-folder workspace, save file, assert cross-repo edge visible)
    Bridge mirror regen: NO (no package.json changes)
    Depends on: Phase 18 (must prove single-repo path still works before adding multi-repo writes)

Phase 22: Distribution + Auto-Update (LAST — requires external certs)
    Goal: C1 macOS notarization, C2 Windows EV code-signing, C3 unified electron-updater.
    Key build order:
         Wave 0: electron-builder.yml + goatideUpdater.ts + scripts/package-goatide.sh
         Wave 1: main.ts wiring of initializeGoatideUpdater()
         Wave 2: Add electron-updater to root dependencies; electron-builder to devDependencies
         Wave 3: CI script for building signed installables (GitHub Actions step)
         Wave 4: phase-verify (install built binary; run phase18-install-smoke-cdp.cjs)
    Gated on: Apple Developer ID (C1) + EV certificate (C2) procurement
    Does NOT modify bridge — no mirror regen
    Fallback if certs not available: ship unsigned installable for self-testing;
    defer signed C1/C2 to v2.2
```

**Phase ordering rationale:**

- Phase 18 first because two v2.0 CDP SCs (SC11, SC12) are SOFT-FAIL and SC3b is
  SOFT-FAIL — these must be closed before new code lands.
- Walkthrough fix (19) before authoring (20) because SC3b is the walkthrough
  regression gate and Phase 20 will change extension.ts (risking N3 ordering
  invariant breakage if not already fixed).
- Authoring (20) before cross-repo activation (21) because both modify `tier-dispatch.ts`
  and kernel write RPCs — landing them sequentially avoids merge conflicts.
- Distribution (22) last because: (a) certs not yet procured; (b) `main.ts` has the
  widest blast radius (Electron main process); (c) all graph features should be verified
  before adding updater complexity.

---

## Mandate Compliance per New Capability

| Capability | Mandate A | Mandate B | Mandate D |
|-----------|-----------|-----------|-----------|
| Distribution / auto-update | Not applicable | Not applicable | Not applicable |
| DecisionNode authoring | `refuse-llm-in-canvas.meta.sh` still gates canvas/; form body is user-authored | `createDecisionNode` is a write RPC — must be added to `refuse-deep05-write.sh` BANNED list for inspector/ scope; full KernelClient (not ReadonlyKernelClient) receives it | DecisionNode creation is explicit user action, not a save-tier decision — does not interact with destructive-tier fence |
| Cross-repo activation | Not applicable | `ReadonlyKernelClient` in inspector stays read-only; write-path repo_id extension only on full KernelClient | Not applicable |
| Walkthrough foregrounding | Not applicable | Not applicable | Not applicable |

---

## Critical Pitfalls for v2.1 Phases

### Pitfall 1 (existing, extends to authoring): Never `Date.now()` in the write path
`createDecisionNode` must use `lastPayload.graph_snapshot_tx_time` as the `asOf` for the
seed call — never `new Date().toISOString()`. Same rule as all existing CanvasPanel flows.

### Pitfall 2 (new for authoring): DecisionNode form submit races with kernel reconnect
If the kernel is in degraded state when the user submits the form, `kernel.createDecisionNode()`
will fail. The `panel.ts` handler must check `kernel.isConnected()` before attempting the
write and post a `canvas.decisionNodeCreationFailed` message back to the webview on error.

### Pitfall 3 (new for distribution): Bridge mirror must be current before packaging
If `prepare_goatide.sh` has not run (or ran before the latest `package.json` changes),
the packaged installer contains the old bridge. `scripts/package-goatide.sh` must enforce
the mirror step before `electron-builder`. Also run `refuse-stale-bridge-mirror.sh` as a
pre-package gate.

### Pitfall 4 (new for distribution): electron-updater inactive guard must be verified
In dev mode (`VSCODE_DEV=1`), `goatideUpdater.ts` must return early. Phase 18 verification
must confirm `autoUpdater.isUpdaterActive()` returns `false` in the dev launch. The existing
`freshclone-smoke-cdp.cjs` should be extended to assert this.

### Pitfall 5 (existing, extends to cross-repo): repo_id must come from fingerprint(), never raw URL
`WorkspaceRepoState` must use `fingerprint(remoteUrl)` (the SHA-256-based 12-char hash)
when deriving `repo_id`. Never pass a raw git remote URL into the SQL `repo_id` column
(SQL injection risk + inconsistency with existing `queryByAnchor` scoping).

### Pitfall 6 (new for cross-repo): WorkspaceRepoState fallback for non-git folders
When a workspace folder has no git origin (local-only repo), `enumerateWorkspaceRepos()`
returns `repoId: 'primary'`. `WorkspaceRepoState.getActiveRepoId()` must fall back to
`'primary'` gracefully — never throw on missing remote URL.

### Pitfall 7 (new for walkthrough): product.json `configurationDefaults` key must survive upstream sync
If the walkthrough fix adds anything to `product.json`, it must be in
`prepare_goatide.sh`'s idempotent jq patch so it is restored after upstream sync.
The brander currently patches `.nameShort`, `.applicationName`, etc. — add the
new key to the jq pipeline and the sanity assertion.

---

## Anti-Patterns to Avoid in v2.1

### Anti-Pattern 1: electron-builder compile-from-source on the VS Code fork
Letting electron-builder compile the app from source (no `--prepackaged`) causes
it to run its own `npm install` and compile step, which conflicts with the fork's
custom build pipeline (TypeScript pin at ~5.9.0, esbuild transpile). Always use
`--prepackaged` pointing at the gulp-produced app directory.

### Anti-Pattern 2: Adding electron-updater to bridge package.json devDependencies
`electron-updater` is a main-process module. Importing it in the bridge extension
host (Node.js context inside VS Code's extension host) causes it to look for
an `app.getPath('userData')` call that only exists in Electron's main process.
It belongs in the root `dependencies`, called only from `goatideUpdater.ts` in
`src/vs/code/electron-main/`.

### Anti-Pattern 3: DecisionNode form calling kernel write from the webview directly
The webview cannot call kernel RPCs directly (it communicates only via
`acquireVsCodeApi().postMessage()`). All kernel write calls must flow through
`panel.ts` which holds the `KernelClient` reference. The webview posts a message;
`panel.ts` calls the kernel; `panel.ts` posts the result back.

### Anti-Pattern 4: Calling `enumerateWorkspaceRepos()` on every save
`enumerateWorkspaceRepos()` calls the VS Code git extension API which is async
and potentially slow. Call it once at activate time, cache in
`WorkspaceRepoState`, and update only on `onDidChangeWorkspaceFolders`.

### Anti-Pattern 5 (inherited): Adding `build` key to root `package.json` for electron-builder
Covered in v2.0 ARCHITECTURE.md. Use `electron-builder.yml` at repo root.

---

## Sources

- GoatIDE `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` — activation wire-up, N3 invariant, command registration order (direct inspection)
- GoatIDE `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts` — KernelClient method list, existing write RPCs (direct inspection)
- GoatIDE `kernel/src/daemon/index.ts` — single-daemon `StartDaemonArgs` shape; no `GOATIDE_REPO_ID` env var currently (direct inspection)
- GoatIDE `kernel/src/graph/dao.ts` — `queryByRepo()` + `repo_id` field on NodeRow/EdgeRow; existing `seed()` append-only pattern (direct inspection)
- GoatIDE `scripts/prepare_goatide.sh` — bridge mirror step ordering; brander idempotency pattern (direct inspection)
- GoatIDE `scripts/test/phase17-smoke-cdp.cjs` — current dev-mode CDP harness; SC3b SOFT-FAIL walkthrough probe; install vs dev-mode distinction (direct inspection)
- GoatIDE `build/gulpfile.ts` + `build/gulpfile.vscode.ts` + `build/gulpfile.vscode.win32.ts` — gulp pipeline scope: compile + optimize, NOT installer packaging; InnoSetup path for upstream (direct inspection)
- GoatIDE `src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts` — `StartupPageRunnerContribution.run()` walkthrough foreground sequence; `LifecyclePhase.Restored` await; `openGettingStarted()` dedup guard (direct inspection)
- GoatIDE `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts` — `workbench.action.openWalkthrough` handler; `editorService.openEditor({ selectedCategory })` mechanism (direct inspection)
- GoatIDE `src/vs/goatide/extensions/goatide-bridge/src/onboarding/walkthrough-completion.ts` — `maybeAutoOpenWalkthrough` fire-and-forget pattern; `WALKTHROUGH_ID` format (direct inspection)
- GoatIDE `src/vs/goatide/extensions/goatide-bridge/src/inspector/workspace-repos.ts` — `enumerateWorkspaceRepos()` + `fingerprint()` implementations (direct inspection)
- GoatIDE `.planning/phases/17-cross-repo-ui-polish/17-SUMMARY.md` — v2.1 handoff notes; single-DB deployment model decision; walkthrough foregrounding deferral rationale (direct inspection)
- electron-builder documentation — NSIS auto-update support; `--prepackaged` flag; `latest.yml` generation; GitHub Releases publish provider; Squirrel.Windows deprecated status (MEDIUM confidence — web-verified via WebFetch)
- VS Code GitHub issue #232425 — walkthrough timing/initialization race documentation; Lean 4 precedent for registration race (MEDIUM confidence — web-verified)
- GoatIDE `.planning/research/v2.0-archive/ARCHITECTURE.md` — v2.0 component map; Anti-Pattern 5 (electron-builder.yml vs package.json `build` key) (direct inspection)

---

*Architecture research for: GoatIDE v2.1 — verify + ship new capabilities*
*Researched: 2026-05-16*
