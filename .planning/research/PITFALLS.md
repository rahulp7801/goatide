# Pitfalls Research

**Domain:** VS Code fork — GoatIDE v2.1 (distribution + authoring UI + multi-daemon + walkthrough fix added to existing fork)
**Researched:** 2026-05-16
**Confidence:** HIGH (verified against source code + v2.0-archive pitfalls + upstream research)

> **Scope:** Pitfalls when ADDING v2.1 capabilities to the existing GoatIDE substrate (Phase 18 verification + C1/C2/C3 distribution + DecisionNode authoring + multi-daemon + walkthrough foregrounding). v2.0 pitfalls (Pitfalls 1–10 in `v2.0-archive/PITFALLS.md`) are closed — this file covers NEW pitfalls introduced at the v2.1 integration seam. Cross-references to v2.0 pitfalls are noted where a v2.1 feature re-opens a closed risk.

---

## Critical Pitfalls

### Pitfall A: CDP Smoke Harness Breaks Silently on Real Installed Build — Fuses Disable Remote Debugging

**What goes wrong:**
The Phase 17 CDP harness (`scripts/test/phase17-smoke-cdp.cjs`) launches GoatIDE via `playwright._electron.launch()` with `VSCODE_DEV=1` and `--extensionDevelopmentPath`. It works in dev mode because Electron has no fuses applied. For Phase 18, the test must run against a **real installed build** — which means the Electron binary has been packaged by `electron-builder` and code-signed. If `electron-builder.yml` includes the `EnableNodeCliInspectArguments` fuse set to disabled (a security hardening practice), or if the build pipeline uses `@electron/fuses` to disable `EnableNodeCLIArguments`, `--remote-debugging-port` is silently ignored by the packaged binary and CDP attach never connects. `playwright._electron.launch()` times out waiting for the DevTools websocket, but the timeout error message does not mention fuses — it looks like the app did not start.

**Why it happens:**
Developers configure fuses to improve production security, then try to run the same `playwright._electron.launch()` CDP harness against the signed build. The two environments (dev-mode binary vs. packaged+signed binary) have different fuse states. The CI may package with fuses disabled for security but then run the same smoke test that relied on dev-mode fuses being on. The Phase 17 harness was authored against dev mode only — this was explicitly documented as a known gap (SC11/SC12 noted as needing human eyes on the real installed build).

**Consequences:**
- Phase 18 E2E verification cannot attach CDP to the installed GoatIDE binary — all 12 smoke checks fail with a timeout rather than a meaningful assertion.
- If the team ships a production binary and then tests dev-mode as a proxy, the gap between the two environments is never closed.
- `--extensionDevelopmentPath` is NOT honored by a packaged ASAR build; the bridge loads from inside the ASAR, not from the source tree. Any test that relies on the dev bridge path fails silently.

**How to avoid:**
Phase 18 must build a **test-flavored** package: use an `electron-builder` configuration profile (`electron-builder.test.yml`) that enables `EnableNodeCliInspectArguments` fuse and omits `--extensionDevelopmentPath` override. The Phase 18 harness launches the installed binary with `--remote-debugging-port=9223` injected via the `app.commandLine.appendSwitch` path, not as a CLI argument (which is fuse-gated). Alternatively, structure the test harness to use `playwright._electron.launch()` with the `--inspect` argument only against a dedicated test package.

```
// Phase 18 harness — launch the installed binary differently from dev-mode:
//   1. Use the installed .exe / .app / AppImage path (not .build/electron/)
//   2. Pass --remote-debugging-port as a Chromium switch via app.commandLine
//      (or accept that Phase 18 tests run against a CDP-enabled test build, not the exact GA artifact)
//   3. Do NOT pass --extensionDevelopmentPath — the ASAR build loads extensions from inside the archive
```

**Warning signs:**
- `playwright._electron.launch()` times out at 90 000ms with "Browser closed" before any window opened.
- `stderr` from the Electron process contains nothing — it didn't start in a way that emits CDP websocket info.
- The installed binary path resolves correctly but CDP connect fails with ECONNREFUSED on port 9223.

**Phase to address:**
Phase 18 Wave 0 — decide the installed-binary test strategy before writing a single test. If CDP attach is impossible for the GA signed artifact, the Phase 18 harness must be split: (a) a "test package" variant that has fuses allowing CDP, and (b) a post-install smoke that exercises observable OS behavior (app appears in installed apps list, launches without UAC prompt, menu bar shows GoatIDE branding) without CDP.

---

### Pitfall B: Mandate A Regression via Authoring Form — Empty-State CTA Grows LLM Autocomplete Suggestions

**What goes wrong:**
Phase 17 POLISH-03 wired the "Add DecisionNode" CTA in `CitationList.tsx` as a placeholder that calls `goatide.canvas.addDecisionNode` (a stub `showInformationMessage`). v2.1 replaces that stub with a real authoring form (a webview input panel or a VS Code `InputBox` sequence). If the authoring form adds any AI-assisted suggestions — even a local heuristic that generates candidate `body` text from the current file diff — the text enters the graph as graph-anchored rationale. This violates Mandate A (no LLM-generated text in the receipt path) even if the user edits the suggestion before saving.

The `refuse-llm-in-canvas.meta.sh` fence scans `canvas/webview/*.ts,*.tsx` for function-call tokens (`prompt(`, `generate(`, etc.). A React-managed authoring form that merely renders a `<textarea>` with an LLM-fetched placeholder `defaultValue` does NOT trigger the grep (the call is in the host side, not the webview source files). The Mandate A fence has a blind spot for host-side generation that populates the webview form.

**Why it happens:**
The authoring form is new UI and developers naturally think "let's be helpful" by pre-populating fields. The existing `refuse-llm-in-canvas.meta.sh` covers only the `canvas/webview/` tree, not the host side `canvas/panel.ts` or a new `canvas/authoring-panel.ts`. A developer who knows the fence exists may conclude "the fence passes = Mandate A is satisfied" without realizing the fence does not cover host-side pre-population.

**Consequences:**
- LLM-generated text enters `DecisionNode.body` in the bitemporal graph as if it were author-written rationale.
- All downstream receipts that cite the polluted node display LLM text as "explicit" rationale — permanently (append-only graph; there is no delete).
- The Mandate A constitutional guarantee is broken even if the fence script still exits 0.

**How to avoid:**
Two controls:
1. Extend `refuse-llm-in-canvas.meta.sh` to also scan `canvas/panel.ts`, `canvas/authoring*.ts`, and any new `canvas/` host-side files for the same banned token patterns.
2. Author the authoring form with an explicit `data-testid="authoring-body-no-llm"` assertion: a unit test that mounts the form, simulates open-with-no-args, and asserts the `textarea` has an empty `defaultValue` (not a generated string).

The authoring form body text MUST originate from user keystrokes only. No `defaultValue` from kernel RPC, no placeholder from a heuristic, no hint text that could be accepted without modification.

**Warning signs:**
- The authoring panel opens with pre-populated text in the body field.
- `kernel.queryNodes({ kind: 'DecisionNode' })` returns rows whose `payload.body` matches text that was never typed by the user (matches diff summary text or file-name heuristics).
- `refuse-llm-in-canvas.meta.sh` exits 0 but the authoring panel's host handler calls any generation RPC.

**Phase to address:**
v2.1 Authoring UI Wave 0 — before writing any authoring form JSX, extend the Mandate A fence to cover host-side authoring files. Add a unit test for empty `defaultValue`. This is a Wave-0 prerequisite, not a post-implementation check.

---

### Pitfall C: Mandate B Regression — Inspector "Edit Node" Affordance Calls the Authoring Write RPC

**What goes wrong:**
v2.1 ships the real `goatide.canvas.addDecisionNode` write path. The Graph Inspector panel (`GraphInspectorPanel`, view type `goatide.graphInspector`) currently shows nodes as read-only. A developer implementing the authoring UI also adds an "Edit" button to the inspector node tooltip (or a context menu) to make it easy to jump from inspecting a node to editing it. The edit action calls the new `addDecisionNode` RPC handler — which is a write RPC. This violates Mandate B: inspector/ MUST NOT call any write RPC.

The `refuse-deep05-write.sh` CI gate currently scans for `atomicAccept`, `proposeEdit`, `recordRejection`, `recordContractOverride`. The NEW write RPC for authoring will have a different name (e.g., `kernel.createDecisionNode` or `kernel.upsertDecisionNode`). The existing Mandate B gate does NOT include the new RPC name and will not catch this regression.

**Why it happens:**
The authoring UI ships a new write RPC. The `refuse-deep05-write.sh` BANNED array was authored for the four pre-v2.1 write RPCs and is not forward-declared to include v2.1 RPCs. A developer who adds an "edit" button to the inspector sees no CI gate failure because the gate scans for the old names only.

**Consequences:**
- Inspector path becomes a write surface, violating the ReadonlyKernelClient guarantee.
- Graph mutation can be triggered from the time-travel inspector, which has no save-gate interception (no `onWillSaveTextDocument` hooks) — graph writes bypass tier classification.
- Mandate D is not reachable from the inspector; a destructive write (e.g., a node that supersedes an existing node) would never trigger the destructive-save confirmation modal.

**How to avoid:**
When the new write RPC is named (e.g., `createDecisionNode`), add it to the `BANNED` array in `refuse-deep05-write.sh` before implementing any inspector code:

```bash
BANNED=(
    "atomicAccept"
    "proposeEdit"
    "recordRejection"
    "recordContractOverride"
    "createDecisionNode"        # v2.1 authoring write RPC — must not appear in inspector/
    "upsertDecisionNode"        # anticipated alias
)
```

The `ReadonlyKernelClient` interface must also be extended to explicitly OMIT the new write RPC (Pick<> exclusion).

**Warning signs:**
- Any `import` of the new write RPC name appears in `src/vs/goatide/extensions/goatide-bridge/src/inspector/` files.
- The inspector panel exposes a button, context menu item, or keyboard shortcut that results in a graph write without passing through `tier-dispatch.ts`.

**Phase to address:**
v2.1 Authoring UI Wave 0 — immediately after naming the write RPC, extend `refuse-deep05-write.sh` BANNED array and update `ReadonlyKernelClient`. Do this BEFORE any inspector code touches the new RPC.

---

### Pitfall D: DecisionNode Authoring Triggers Save-Gate → Save-Gate Calls Authoring RPC → Infinite Loop

**What goes wrong:**
The save-gate is wired to `onWillSaveTextDocument`. When a user creates a DecisionNode by editing the contracts file (the canonical mechanism), the save of the contracts file itself triggers `dispatchTier()`. If `dispatchTier()` is also called as part of the authoring write path (because the authoring flow saves a generated file or modifies the contracts file as a side-effect), the result is:

1. User triggers "Add DecisionNode" → authoring form saves the new node text to `contracts.md`.
2. `onWillSaveTextDocument` fires for `contracts.md`.
3. `dispatchTier()` runs → calls `kernel.proposeEdit` → `buildReceipt` → `queryByAnchor` → looks for anchors in `contracts.md` → finds the new DecisionNode that was just being authored → tries to compose a receipt for the node that is mid-creation.
4. The receipt-building call hits the kernel while the authoring RPC is still in flight → race or deadlock on the kernel's TCP request queue.

A more subtle variant: the authoring form is a webview that saves a temporary staging file. `scanForOrphanStagingFiles` runs recovery on activation and finds the half-written staging file, treating it as an orphan from a prior crash.

**Why it happens:**
The save-gate intercepts ALL text document saves. The authoring flow that writes to `contracts.md` is just another text document save. Developers assume the authoring RPC and the save-gate are separate paths — they are not, unless the authoring flow explicitly bypasses `onWillSaveTextDocument` (e.g., by writing via `fs.writeFile` outside the VS Code document model, which has its own pitfalls).

**Consequences:**
- The kernel TCP request queue deadlocks: `createDecisionNode` and `proposeEdit` are both in-flight and the kernel processes them sequentially, but `proposeEdit` depends on the state that `createDecisionNode` is still writing.
- In the non-deadlock variant: the receipt for the contracts file save fires before the new node is visible in the graph (race on `valid_from` ordering), so the receipt shows 0 citations for the very file that was just annotated.

**How to avoid:**
The authoring write path MUST NOT write to a file that is watched by `onWillSaveTextDocument`. Three valid patterns:
1. The "Add DecisionNode" command writes the new node directly to the kernel via RPC (`kernel.createDecisionNode`) — no file write at all. The contracts file is updated via a separate "sync graph to contracts file" command that the user triggers explicitly.
2. The authoring flow writes to the kernel RPC first, then uses `vscode.workspace.applyEdit()` with a `WorkspaceEdit` that inserts the new node section into the contracts file — but uses the `reason: 'refactor'` metadata so the save-gate can distinguish authoring edits from user-initiated saves (`event.reason === TextDocumentSaveReason.AfterDelay || === 'refactor'`).
3. The authoring flow marks the contracts file save with a known metadata token so the save-gate can short-circuit: check for a custom environment variable or a `Map<fsPath, boolean>` flag set by the authoring command before `onWillSaveTextDocument` fires.

**Warning signs:**
- After triggering "Add DecisionNode", the GoatIDE status bar freezes on "GoatIDE: saving..." and never resolves.
- The kernel log shows two concurrent in-flight RPCs with the same `change_id`.
- `scanForOrphanStagingFiles` recovers a staging file after every "Add DecisionNode" action.

**Phase to address:**
v2.1 Authoring UI Wave 0 — design the write path so it does not trigger `onWillSaveTextDocument` reentrancy. Document the chosen pattern in the Wave-0 plan before authoring any UI code.

---

### Pitfall E: Multi-Daemon DB Writer Collision — Two Daemons Open the Same graph.db

**What goes wrong:**
v2.0 uses a single-DB model: one `~/.goatide/graph.db` regardless of how many repos are open. v2.1 multi-daemon orchestration spawns one kernel sidecar per workspace folder. If two sidecars are spawned for a multi-root workspace and both resolve to `~/.goatide/graph.db` as their DB path, `better-sqlite3` opens the file in WAL mode from two separate processes. SQLite WAL mode is designed for multiple readers and one writer per process, but two writers in separate processes accessing the same WAL file will produce:
- `SQLITE_BUSY` errors on `BEGIN EXCLUSIVE TRANSACTION` statements in the graph mutations.
- WAL corruption if both writers flush checkpoints simultaneously (the WAL file header is not protected by the DB's internal locking in this scenario when both processes use `better-sqlite3` with `pragma journal_mode = WAL`).

**Why it happens:**
The single-DB model was a deliberate decision for v2.0 (see PROJECT.md Key Decisions: "Single-DB + `repo_id` partitioning for cross-repo"). The multi-daemon v2.1 work re-opens this decision. Developers who implement the daemon spawning logic naturally reach for the same `~/.goatide/graph.db` path that the single-daemon model used, because `resolveKernelPath()` is the only kernel-path utility and it returns the single-DB path.

**Consequences:**
- Graph writes from repo B corrupt in-progress writes from repo A (both writing to `nodes` with different `repo_id` but colliding WAL state).
- The kernel's `pragma wal_autocheckpoint = 100` triggers from daemon A while daemon B has open read transactions, leaving the WAL file in an inconsistent truncation state.
- Neither daemon crashes explicitly — `better-sqlite3` returns `SQLITE_BUSY` which the kernel's error handler surfaces as a generic "RPC error", masking the root cause.

**How to avoid:**
Two valid approaches:
1. **One DB per repo:** Each daemon writes to `~/.goatide/<repo_fingerprint>/graph.db`. The `repo_fingerprint` is the SHA-256(12) of the git remote URL (already implemented in `kernel/src/graph/repo-fingerprint.ts`). Cross-repo stitching reads both DB files via `ATTACH DATABASE`. This is the only approach that guarantees no WAL collision.
2. **One DB, one writer daemon:** Keep single-DB but enforce that only one daemon may open the DB in `readwrite` mode. Additional daemons open with `PRAGMA query_only = ON`. Cross-repo writes are proxied through the primary daemon's RPC endpoint. This is simpler for v2.1 scope.

Whichever approach is chosen, add a kernel startup assertion: on open, `PRAGMA journal_mode` must return `wal`, and the kernel should immediately check for a process-level lock on the WAL file (via a second `flock` or SQLite application-lock on a sentinel table row). If the lock is already held, fail fast with a clear error.

**Warning signs:**
- `kernel.log` shows `SQLITE_BUSY` errors in the `proposeEdit` or `atomicAccept` handlers after multi-daemon spawn.
- The `graph.db-wal` file grows unboundedly (no checkpoint succeeds).
- `kernel.queryNodes()` returns inconsistent results between the two daemons for the same `repo_id`.

**Phase to address:**
v2.1 Multi-Daemon Wave 0 — write the DB-per-repo or single-writer decision as a concrete ADR. Add a kernel startup guard that fails fast with an explicit error if a second daemon tries to open the same DB path in readwrite mode.

---

### Pitfall F: macOS Notarization Fails on `better-sqlite3` Native Binary — Not Signed with Hardened Runtime

**What goes wrong:**
`better-sqlite3` ships a pre-built native `.node` binary (or is compiled via `node-gyp` during `npm install`). When `electron-builder` packages GoatIDE for macOS distribution, all embedded binaries — including `.node` native modules — must be signed with the `com.apple.security.cs.allow-unsigned-executable-memory` entitlement AND the hardened runtime flag (`codesign -o runtime`). Apple's notarization service rejects the submission if any embedded binary lacks the hardened runtime.

The `better-sqlite3` prebuild distributed via npm is typically signed only for npm distribution, not with the hardened runtime required for macOS notarization. `electron-builder`'s `afterSign` hook does not automatically re-sign node addons.

**Why it happens:**
`electron-builder`'s default signing step signs the top-level `.app` bundle and the main `Electron` binary. It does NOT recursively sign `.node` files inside `node_modules` unless explicitly configured with the `signIgnore` exclusion (inverted) or a custom `afterSign` hook. Developers who test signing locally pass `--skip-notarize` during development, then hit the rejection only when submitting to Apple's notarization service in CI.

**Consequences:**
- Apple notarization API returns: `The executable does not have the hardened runtime enabled` for `kernel/node_modules/better-sqlite3/build/Release/better_sqlite3.node`.
- The entire submission is rejected; GoatIDE cannot be distributed via macOS Gatekeeper.
- Re-signing manually is possible but breaks the code-signing certificate chain if done after `electron-builder` has already signed the app bundle.

**How to avoid:**
Add a `beforeSign` hook in `electron-builder.yml` that re-signs all `.node` files before the main app bundle is signed:

```javascript
// build/sign-node-addons.js — runs before electron-builder signs the .app
const { execSync } = require('child_process');
const path = require('path');
const glob = require('glob');

exports.default = async function(context) {
    if (process.platform !== 'darwin') { return; }
    const nodeFiles = glob.sync('**/*.node', { cwd: context.appOutDir, absolute: true });
    for (const f of nodeFiles) {
        execSync(`codesign --force --deep --sign "${process.env.CSC_NAME}" ` +
                 `--entitlements build/entitlements.mac.plist ` +
                 `--options runtime "${f}"`);
    }
};
```

The `entitlements.mac.plist` must include `com.apple.security.cs.allow-unsigned-executable-memory` (required for V8 JIT) and `com.apple.security.cs.allow-dyld-environment-variables` (required for Electron's `ELECTRON_RUN_AS_NODE` mode used by the kernel sidecar).

**Warning signs:**
- Apple notarization rejection email mentions `better_sqlite3.node` or any `.node` file.
- `spctl --assess --type exec --verbose` on the packaged `.app` reports `not signed` for the kernel sidecar helper.
- `codesign -dv --verbose=4 <app>/Contents/Resources/kernel/node_modules/better-sqlite3/build/Release/better_sqlite3.node` shows no hardened runtime in the flags.

**Phase to address:**
v2.1 C1 (macOS notarization) Wave 0 — author the `beforeSign` hook and entitlements plist as the first deliverable before any packaging attempt. Test the signing chain on a locally-packaged `.app` before submitting to Apple's notarization service.

---

### Pitfall G: Windows EV Signing Cannot Run in CI — Hardware Token Requirement Since June 2023

**What goes wrong:**
As of June 2023, CA/B Forum mandates that the private key for EV code signing certificates must be stored on a FIPS 140 Level 2+ hardware security module (HSM) or hardware token. Physical USB tokens cannot be connected to a virtual CI runner (GitHub Actions, Azure Pipelines). Therefore, the `electron-builder` signing step for Windows EV-signed builds cannot run in the standard CI pipeline — the signing certificate private key is literally not reachable.

Additionally, the March 2024 Microsoft SmartScreen change removed EV certificates' instant-reputation bypass. A new EV cert now goes through the same reputation-building process as OV certificates, meaning the first N downloads of a GoatIDE installer signed with a fresh EV cert will show SmartScreen warnings regardless of the certificate type.

**Why it happens:**
Historical guidance said "use an EV cert and SmartScreen is suppressed." Both assumptions are now wrong. Developers who follow pre-2023 guides will plan for CI-based EV signing with a PFX file, discover the hardware requirement, and then have no signing plan at all — blocking the Windows distribution milestone.

**Consequences:**
- The C2 (Windows EV signing) milestone cannot be completed with a standard GitHub Actions runner without an HSM service.
- Even if signing is solved, SmartScreen warnings still appear for the first weeks of distribution on a new cert.
- The `kernel/dist/main.js` helper (spawned as a separate Node.js process) must also be signed for SmartScreen to trust it — a helper executable that is unsigned will trigger SmartScreen on first execution.

**How to avoid:**
Use Microsoft's **Trusted Signing** service (formerly Azure Code Signing) which stores the EV-class private key in an Azure HSM and exposes it via an authenticated REST API — no physical token required. The `electron-builder` Windows signing config can call the Trusted Signing Azure CLI action:

```yaml
# electron-builder.yml
win:
  sign: ./build/trusted-sign.js   # custom signer that calls az trustedsigning sign
  signingHashAlgorithms: ['sha256']
  timeStampServer: 'http://timestamp.acs.microsoft.com'
```

For SmartScreen reputation: submit the first build to Microsoft's Software Submission portal once released. Plan for a 2–4 week window where SmartScreen warns before the reputation accrues.

**Warning signs:**
- `electron-builder` on Windows CI exits with: `Error: No certificate was found that can be used for signing`.
- The signed `.exe` shows SmartScreen "Unknown publisher" on first execution despite being EV-signed.
- The kernel sidecar `node.exe` wrapper triggers SmartScreen separately from the main GoatIDE `.exe`.

**Phase to address:**
v2.1 C2 (Windows EV signing) Wave 0 — decide the signing infrastructure before writing any build configuration. If Trusted Signing is chosen, provision the Azure resource and test the signing API call against a dummy `.exe` before wiring into `electron-builder`. Document the SmartScreen reputation timeline in the release notes.

---

### Pitfall H: electron-updater Channel YML Conflicts with VS Code's Own Update Infrastructure

**What goes wrong:**
VS Code (the upstream fork base) has its own update infrastructure: `code.visualstudio.com/api/update/<platform>/<channel>/<version>`. The VS Code main process at `src/vs/code/electron-main/app.ts` initializes its own updater (`IUpdateService`) that polls the VS Code update URL. GoatIDE's fork must DISABLE VS Code's built-in updater (which points at VS Code's CDN, not GoatIDE's GitHub Releases) and replace it with `electron-updater` (which reads `latest.yml` from GoatIDE's GitHub Releases).

If VS Code's built-in updater is not disabled, two updaters run simultaneously:
1. VS Code's `IUpdateService` polls `code.visualstudio.com` → finds no update for a fork (wrong CDN) → silently fails or emits a confusing "update unavailable" notification with VS Code branding.
2. `electron-updater` polls GitHub Releases → finds the GoatIDE update → downloads and installs NSIS over the existing install.

The NSIS install replaces the binary that the user is currently running. VS Code's updater, which had a pending restart-to-update cycle, now restarts into the new binary — but the product version in `product.json` was updated by the NSIS install while VS Code's in-memory state expected the old version. This causes a version mismatch assertion in VS Code's main process on startup.

**Why it happens:**
VS Code fork authors focus on disabling the VS Code Update menu item in the UI but do not trace `IUpdateService` initialization in `src/vs/code/electron-main/app.ts`. The service is registered via DI and starts polling on activation regardless of the UI menu state.

**Consequences:**
- Duplicate update notifications with VS Code branding confuse the user ("Update VS Code to 1.XX" when they are running GoatIDE).
- The NSIS install during an active session causes a version mismatch crash on VS Code's restart-to-update path.
- `electron-updater`'s `latest.yml` is named by convention (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`). If VS Code's infrastructure also uses YAML channel files with the same names on the same distribution host (unlikely but possible if the fork is hosted on the same GitHub org as VS Code releases), the channel names collide.

**How to avoid:**
In GoatIDE's fork, override `IUpdateService` with a no-op implementation before adding `electron-updater`. In `src/vs/code/electron-main/app.ts`, find the `IUpdateService` registration and replace it with a stub that returns `UpdateType.Idle` and never polls. Add a CI gate that asserts `code.visualstudio.com` does not appear in any GoatIDE network request log during a test launch.

The `electron-updater` initialization should live in a new `src/vs/goatide/update/goatideUpdater.ts` — the ONLY file that imports from `electron-updater`. Apply both guards from v2.0 Pitfall 7: `process.env.VSCODE_DEV` and `autoUpdater.isUpdaterActive()`.

**Warning signs:**
- The GoatIDE menu shows "Check for Updates…" with VS Code branding.
- Network logs show requests to `code.visualstudio.com/api/update/` from a running GoatIDE instance.
- After NSIS silent install, the extension host logs: `productVersion !== installedVersion`.

**Phase to address:**
v2.1 C3 (auto-update) Wave 0 — before writing any `electron-updater` code, stub out `IUpdateService`. Verify the stub with a test: launch GoatIDE, wait 60s, assert no request was made to `code.visualstudio.com`.

---

### Pitfall I: Walkthrough Foregrounding Fix Resets `onboardingComplete` — Pitfall 9 Async-Flush Race Returns

**What goes wrong:**
Phase 17 POLISH-01 correctly uses `context.globalState` (not `WorkspaceConfiguration`) to write `goatide.onboardingComplete`. The v2.1 walkthrough foregrounding fix must make the GoatIDE walkthrough WIN the first-launch race against VS Code's built-in "Setup VS Code" walkthrough. The naive implementation is to reset `onboardingComplete` to `false` on version bump (so the walkthrough re-fires for the new version). If the reset is implemented via `WorkspaceConfiguration.update` (the wrong API) instead of `context.globalState.update`, the v2.0 Pitfall 9 async-flush race returns: the user completes the walkthrough → closes VS Code quickly → the async write doesn't flush → the walkthrough appears again on the next launch.

A second variant: the foregrounding fix changes the mechanism from `workbench.action.openWalkthrough` (the current `maybeAutoOpenWalkthrough` implementation) to calling the VS Code internal `walkthroughs.selectStep` command with the GoatIDE step ID. This internal command requires knowledge of VS Code's walkthrough rendering order, which changes between upstream releases. A future upstream sync that reorders walkthrough rendering would silently break the foregrounding.

**Why it happens:**
The `workbench.action.openWalkthrough` API opens the walkthrough panel but does not guarantee foreground placement if the VS Code "Setup VS Code" walkthrough is already displayed. The fix requires understanding the VS Code Getting Started panel's step priority system — which is an internal VS Code detail, not a public extension API. Developers find various workarounds (reset `onboardingComplete`, call internal commands) without recognizing that these are brittle.

**Consequences:**
- If `onboardingComplete` is reset via `WorkspaceConfiguration.update`: the walkthrough reappears on every launch after fast-close (Pitfall 9 regression). Since the fix was explicitly needed for foregrounding, the developer may also reset it unconditionally on version bump — meaning ALL users see the walkthrough again, not just new installs.
- If an internal VS Code command is used: the next upstream sync from `microsoft/vscode@1.117.0` to a newer pin changes the internal command behavior and the foregrounding breaks silently.

**How to avoid:**
The correct foregrounding mechanism is to set the `onboardingComplete` context key to `false` via `vscode.commands.executeCommand('setContext', 'goatide.onboardingComplete', false)` at activation for new installs only — not for returning users. The `when` condition in `package.json contributes.walkthroughs` should be `!goatide.onboardingComplete`, which is already implemented in Phase 17. The foregrounding problem is that VS Code's Getting Started panel prioritizes its own "Setup VS Code" walkthrough above extension walkthroughs.

The correct fix is to set a higher `order` value on the GoatIDE walkthrough in `contributes.walkthroughs` — VS Code's Getting Started panel renders walkthroughs in ascending `order` (lower number = first). Set GoatIDE walkthrough `order` to 0 (or the lowest positive integer) if VS Code's default walkthrough uses a higher order value. Verify this does not break upstream sync by checking the VS Code source for the default walkthrough's order value.

Do NOT call any `workbench.internal.*` commands. Do NOT use `WorkspaceConfiguration.update` for `onboardingComplete`.

**Warning signs:**
- The Phase 17 walkthrough completion test (`test/unit/walkthrough-completion.test.ts`) still passes but the walkthrough reappears after fast-close in a manual test.
- VS Code logs show `workbench.action.openWalkthrough` firing but the Getting Started panel shows VS Code's "Setup VS Code" as the active step.
- After the foregrounding fix, `grep -r "WorkspaceConfiguration.update" src/vs/goatide/extensions/goatide-bridge/src/onboarding/` returns any result.

**Phase to address:**
v2.1 Walkthrough Foregrounding Wave 0 — before any fix implementation, audit what `contributes.walkthroughs.order` the Phase 17 package.json uses and what VS Code's internal walkthrough order is. The existing `walkthrough-completion.test.ts` must be extended to assert that the completion handler still uses `context.globalState.update` (not a regression check, but an active assertion in the new test suite).

---

### Pitfall J: Bridge Mirror CI Gate Fires After Any v2.1 Authoring Package.json Change

**What goes wrong:**
v2.1 authoring UI will add a new `goatide.canvas.addDecisionNode` command to its real implementation — but the Phase 17 stub is already in `package.json`. More likely: the authoring form needs a new `contributes.commands` entry (e.g., `goatide.canvas.submitDecisionNode`), a new `contributes.menus` entry, or a new configuration property. Any change to `src/vs/goatide/extensions/goatide-bridge/package.json` that is not immediately followed by `bash scripts/prepare_goatide.sh` causes `refuse-stale-bridge-mirror.sh` to fail CI.

The mirror fence (`refuse-stale-bridge-mirror.sh`) does a canonical JSON byte-comparison of all fields — including `scripts` and `devDependencies`. The mirror also byte-checks `media/walkthrough/*.md`. Any v2.1 file that adds to the bridge tree without a mirror regen will fail CI immediately, but developers often forget mid-feature when they make multiple `package.json` changes across a wave.

**Why it happens:**
v2.1 authoring UI, multi-daemon wiring, and electron-updater initialization will all need bridge `package.json` changes (new commands, new configuration keys). The pattern is: make the change, build the source, run tests — but forget `scripts/prepare_goatide.sh` before committing. The CI gate catches it but only after push.

**Consequences:**
- CI fails on `refuse-stale-bridge-mirror.sh` blocking all other CI steps.
- If the developer force-pushes to fix without re-running `prepare_goatide.sh`, they may accidentally commit a mirror that was regenerated from a partially-built bridge (e.g., with an uncommitted `package.json` change).

**How to avoid:**
Add `bash scripts/prepare_goatide.sh` to the root `compile` and `build-bridge` npm scripts so it runs automatically. Currently, `prepare_goatide.sh` is documented as a manual step. Making it automatic eliminates the forgetting.

Alternatively, add a pre-commit hook (not a CI gate) that runs `refuse-stale-bridge-mirror.sh` and blocks the commit if the mirror is stale. This catches the failure before push rather than after.

**Warning signs:**
- CI fails on `refuse-stale-bridge-mirror.sh` within 30 minutes of a `package.json` change.
- The fix commit message is "regen mirror" or "run prepare_goatide" — a repeated pattern indicates the automation is missing.

**Phase to address:**
v2.1 Phase 18 prep (or v2.1 authoring UI Wave 0) — automate `prepare_goatide.sh` in the compile script. Add this before any v2.1 `package.json` changes land.

---

### Pitfall K: Phase 18 E2E Verification Uses LLM-Generated Baseline for Receipt Text Assertion — Mandate A Regression in the Test Suite

**What goes wrong:**
Phase 18 verification must walk all v2.0 user-visible features E2E on a real installed build. One of those features is the receipt displayed in the Verification Canvas. If the test harness verifies the receipt content by comparing it against a snapshot that was generated by asking Claude "what should this receipt say?" (rather than a snapshot captured from the live kernel output), the verification suite introduces LLM-generated text into the receipt assertion path. This is a test-level Mandate A violation.

The risk is subtle: the developer writes a test that asserts `receipt.citations[0].body_preview.includes('some expected text')` where `'some expected text'` was typed by the developer after reading Claude's suggestion. The text itself is not in the production code, but the test oracle was LLM-assisted.

**Why it happens:**
Phase 17 CDP smoke (SC11, SC12) was noted as needing human eyes — the developer who writes Phase 18 verification may use Claude to draft the expected receipt strings. These strings then enter the test as literal comparisons. The Mandate A fence scans `canvas/webview/` for LLM function-call tokens — it does not scan test files and cannot detect LLM-derived string literals.

**Consequences:**
- The test assertion is wrong if the kernel produces different receipt text than what Claude predicted (different node body, different citation ordering).
- A false-positive test (green) gives false confidence that the receipt path is working when the kernel is actually producing different output.
- The principle of Mandate A (receipts trace to real graph citations) is violated in the test oracle.

**How to avoid:**
Phase 18 receipt assertions must use **captured kernel output** as the baseline, not predicted text. The correct pattern:
1. Seed the kernel with a known DecisionNode (exact body text specified in the test setup).
2. Trigger a save of the anchored file.
3. Capture the receipt from the live `kernel.queryRationaleAt` RPC response.
4. Assert `receipt.citations.length >= 1` and `receipt.citations[0].node_id === expectedNodeId` (which was captured from the seed step).

Never assert on `body_preview` text unless the exact text was specified in the test setup (not derived from LLM suggestion).

**Warning signs:**
- Phase 18 test code contains string literals like `'The developer decided to use...'` or `'Because the constraint requires...'` as expected receipt content.
- A test passes with a freshly-seeded kernel but fails when the kernel DB already has nodes from a prior test run (citation ordering is different).

**Phase to address:**
Phase 18 Wave 0 — establish the receipt-assertion pattern before any test is written. The pattern must be: seed → trigger → capture → assert on IDs, not on body text derived from anywhere other than the seed setup.

---

## Moderate Pitfalls

### Pitfall L: Multi-Daemon KernelDegradedBanner Assumes Single Kernel — Wrong State for Per-Repo Degraded Display

**What goes wrong:**
`KernelDegradedBanner` (in `src/vs/goatide/extensions/goatide-bridge/src/status-bar/kernel-degraded.ts`) monitors a single `KernelConnectionState` instance. With multi-daemon, each workspace folder has its own kernel connection state. If repo A's kernel is healthy but repo B's kernel is degraded, the banner's single-instance model can show either "healthy" (wrong — B is degraded) or "degraded" (wrong — A is fine).

**How to avoid:**
Multi-daemon implementation must either (a) extend `KernelDegradedBanner` to accept an array of `KernelConnectionState` instances and show degraded if ANY is degraded, or (b) create one banner per workspace folder. Pattern (a) is simpler for v2.1 scope and consistent with the "worst-case wins" principle for status bar indicators.

**Phase to address:**
v2.1 Multi-Daemon Wave 1 — extend `KernelDegradedBanner` before wiring the per-repo kernel instances.

---

### Pitfall M: Post-Hoc Rejection (Reject Button) Creates Double-Rejection — `recordRejection` Called Twice

**What goes wrong:**
POLISH-04 added the `dispatchHover` path for benign-tier saves. The v2.1 "Reject" button in `dispatchHover` modal calls `kernel.recordRejection({ change_id })`. If the user clicks Reject, closes the modal, and then clicks Reject again in a second notification that was already queued (e.g., the `dispatchHover` ephemeral status bar message was still visible), `recordRejection` is called twice with the same `change_id`. The kernel's `recordRejection` creates an `Attempt(rejected)` node each time. Two rejected `Attempt` nodes for the same `change_id` produce two rejection rows in the bitemporal graph — both valid, both visible in `queryByKind('Attempt')`. Subsequent `traverse()` calls following the rejection chain find both and may produce duplicate citations.

**How to avoid:**
Add a `disposedChangeIds: Set<string>` guard in `dispatchHover` (or in the host's message handler): after `recordRejection` succeeds for a `change_id`, mark it as disposed and no-op on subsequent rejection requests for the same `change_id`. The guard must be in the host (not the webview) because the webview may send multiple messages before the host has processed the first.

**Phase to address:**
v2.1 Authoring UI (Reject button) Wave 0 — the guard must be a Wave-0 RED test: `dispatchHover` called twice with the same `change_id` → `kernel.recordRejection` called exactly once. Assert with a call-count spy.

---

### Pitfall N: Upstream Sync Merge Conflicts Grow With v2.1 Divergence

**What goes wrong:**
v2.1 adds `electron-updater` initialization to `src/vs/code/electron-main/app.ts` (to disable VS Code's `IUpdateService`) and adds multi-daemon spawn logic to `extension.ts`. Both files are frequently modified in the VS Code upstream. When the next upstream sync from `microsoft/vscode@1.117.0` to a newer pin occurs, these files will have merge conflicts that require understanding both the VS Code change and the GoatIDE change.

**How to avoid:**
Minimize the surface area of changes to upstream VS Code files:
- Do NOT modify `src/vs/code/electron-main/app.ts` directly. Instead, create a GoatIDE-specific service override registered via DI BEFORE `IUpdateService` is instantiated. This follows the VS Code DI pattern and limits the upstream-sync conflict surface to the DI registration site, not the full `app.ts` file.
- In `extension.ts`, keep the multi-daemon spawn in a new `src/vs/goatide/extensions/goatide-bridge/src/kernel/multi-daemon.ts` module. `extension.ts` calls `await ensureMultiDaemonKernels(context, kernel)` — one line, easy to rebase.
- Tag all GoatIDE-specific lines with `// GOATIDE-FORK` comments so the upstream-sync ceremony can quickly identify GoatIDE modifications in a diff.

**Phase to address:**
All v2.1 phases — apply the "GOATIDE-FORK comment" convention from the first commit. Enforce via a CI lint rule: any modification to a file in `src/vs/code/` or `src/vs/workbench/` that lacks a `// GOATIDE-FORK` comment on the GoatIDE-specific line fails CI.

---

## Minor Pitfalls

### Pitfall O: electron-updater `dev-app-update.yml` Committed to Repo — Token Exposure

**What goes wrong:**
Testing `electron-updater` locally requires a `dev-app-update.yml` at the project root that contains the GitHub token for the releases endpoint. If committed, the token is exposed in git history.

**How to avoid:**
Ensure `dev-app-update.yml` is in `.gitignore` (check: `grep dev-app-update .gitignore`). Use GitHub Actions secrets for the `GH_TOKEN` in CI. This is the same pattern documented in v2.0-archive Pitfall 7. Check the gitignore BEFORE creating the file.

**Phase to address:**
v2.1 C3 Wave 0 — verify `.gitignore` entry exists before creating `dev-app-update.yml`.

---

### Pitfall P: Walkthrough Media Binary Assets Need Mirror Sync — `refuse-stale-bridge-mirror.sh` Now Checks `media/walkthrough/`

**What goes wrong:**
If the walkthrough foregrounding fix adds media assets (SVG icons, PNG screenshots) to `media/walkthrough/`, these must be synced to `extensions/goatide-bridge/media/walkthrough/` by `prepare_goatide.sh`. The Phase 17 version of `refuse-stale-bridge-mirror.sh` already checks for markdown file drift in `media/walkthrough/` (lines 81–99 of the script). Binary assets added without updating `prepare_goatide.sh` to include them in the mirror sync will cause `diff -r` to detect drift and fail CI.

**How to avoid:**
`prepare_goatide.sh` must use `rsync` or `cp -r` (not a file-by-file list) to sync the entire `media/walkthrough/` directory including any new binary files. Verify this after adding any binary asset.

**Phase to address:**
v2.1 Walkthrough Foregrounding — if any binary asset is added, extend `prepare_goatide.sh` to include it in the sync step.

---

### Pitfall Q: `PendingAttemptsQueue` Drains Against Wrong Daemon in Multi-Daemon World

**What goes wrong:**
`PendingAttemptsQueue` (Phase 4, Plan 04-06) queues Attempt records when the kernel is offline and drains them via `queue.drainAll(kernel)` on reconnect. With multi-daemon, there are multiple `kernel` instances. The queue root is `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` — the first workspace folder. If repo A's kernel disconnects and reconnects, the drain call uses `kernel` (which may be repo A's or repo B's depending on how multi-daemon wires the reconnect command). If the wrong daemon drains, Attempts from repo A are submitted to repo B's kernel, creating cross-repo ghost Attempts.

**How to avoid:**
Each daemon instance must have its own `PendingAttemptsQueue` rooted at its workspace folder path. The reconnect command must identify which daemon reconnected and drain only that daemon's queue. Add a `repoId` parameter to `PendingAttemptsQueue` and assert it matches the draining daemon's configured `repoId`.

**Phase to address:**
v2.1 Multi-Daemon Wave 1 — design the per-daemon queue before any reconnect command is extended.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Signing GoatIDE `.app` without re-signing `better_sqlite3.node` | Faster local test builds | Apple notarization rejection; blocks macOS distribution | Never — notarization requires all embedded binaries signed |
| Using VS Code's `IUpdateService` alongside `electron-updater` | One less stub to write | Duplicate update notifications; version-mismatch crash on restart | Never — VS Code's updater must be stubbed out |
| Using `WorkspaceConfiguration.update` for `onboardingComplete` version bump | Familiar VS Code API | Pitfall 9 async-flush race returns; walkthrough reappears after fast close | Never — always use `context.globalState.update` |
| Skipping `prepare_goatide.sh` after `package.json` changes | Faster iteration cycle | CI fails on `refuse-stale-bridge-mirror.sh` | Only acceptable if the commit explicitly excludes the mirror change (e.g., WIP branch) — always run before merging |
| Asserting receipt body text against LLM-predicted strings in Phase 18 tests | Faster test authoring | False positives; Mandate A principle violated in the oracle | Never — assert on node IDs seeded in test setup |
| Multi-daemon sharing a single `graph.db` without a writer guard | Simpler daemon spawn | WAL corruption under concurrent writes; silent data loss | Only acceptable if all daemons after the first are strictly read-only (requires explicit enforcement) |
| Adding "Edit" button in inspector without extending `refuse-deep05-write.sh` | Convenient UX | Mandate B violation; inspector becomes a write surface | Never — extend the BANNED array first |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `electron-builder` macOS notarization ↔ `better-sqlite3` | Sign only the main `.app` bundle | `beforeSign` hook re-signs all `.node` files with hardened runtime + entitlements before main bundle signing |
| Windows EV signing ↔ CI runners | Assume EV cert PFX can be used on GitHub Actions runner | Use Microsoft Trusted Signing (Azure HSM API); no physical token needed on the CI runner |
| `electron-updater` ↔ VS Code fork `IUpdateService` | Initialize `electron-updater` alongside VS Code's updater | Stub `IUpdateService` first; `electron-updater` initialization lives in `goatideUpdater.ts` with VSCODE_DEV + isUpdaterActive guards |
| DecisionNode authoring form ↔ `onWillSaveTextDocument` | Authoring flow writes to contracts file → triggers save-gate reentrancy | Authoring writes directly to kernel RPC; no file write triggers `onWillSaveTextDocument` |
| Multi-daemon spawn ↔ `graph.db` WAL mode | Both daemons resolve to same DB path | DB-per-repo with `repo_fingerprint` as directory key, OR single-writer with explicit WAL-lock guard |
| Phase 18 CDP harness ↔ packaged signed build | Use same `playwright._electron.launch()` as dev-mode | Build a test package with CDP-enabling fuse; keep GA package with fuse disabled |
| v2.1 `package.json` changes ↔ `refuse-stale-bridge-mirror.sh` | Forget to run `prepare_goatide.sh` after `package.json` edits | Automate `prepare_goatide.sh` in the compile script; or add pre-commit hook |
| Reject button (`dispatchHover`) ↔ `recordRejection` double-call | No guard on repeated rejection for same `change_id` | `disposedChangeIds: Set<string>` guard in host message handler |
| Walkthrough foregrounding ↔ `onboardingComplete` reset | Reset via `WorkspaceConfiguration.update` (wrong API) | Reset via `context.globalState.update`; set `order` on walkthrough contribution for foreground priority |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Multi-daemon spawn on every VS Code window open | Kernel processes accumulate; port collisions after 5+ windows | Spawn daemon only when workspace folder has a `.goatide` config file (opt-in per repo) | 3+ VS Code windows open simultaneously |
| `queryGraphSnapshot` called across all daemons sequentially in cross-repo view | Inspector "Cross-Repo Graph" button hangs for 5+ seconds with 3 repos | Parallel `Promise.all` across daemon RPC calls for `queryGraphSnapshot`; set 3s timeout per daemon | 3+ repos with 1K+ nodes each |
| `electron-updater` `checkForUpdatesAndNotify()` called at startup on every launch | Network call on every IDE launch adds 200–500ms to perceived startup | Call only once per 24h (cache last-check timestamp in `context.globalState`); skip check if offline | Every launch on a slow network |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing `dev-app-update.yml` with real GitHub token | Token exposed in git history; grants release write access | `dev-app-update.yml` in `.gitignore` before file is created; CI uses `GH_TOKEN` secret |
| Using `--remote-debugging-port` in GA signed build | Any local process can attach CDP to the signed app and inspect arbitrary renderer state | Disable `EnableNodeCliInspectArguments` fuse in GA build; enable only in test package build |
| Storing the new write RPC token (e.g., `createDecisionNode`) only in extension host memory without auth check | A malicious VS Code extension in the same workspace could call the RPC if the kernel TCP port is exposed | The kernel TCP RPC auth gate (Phase 5, TELE-05) already requires an auth token; multi-daemon must not relax this |
| macOS entitlements over-permissive (`allow-jit`, `disable-library-validation`) | Enables code injection into the signed app | Use minimum required entitlements: `cs.allow-unsigned-executable-memory` (V8 JIT only); NOT `disable-library-validation` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Walkthrough foregrounding fix resets walkthrough for returning users | Expert users who completed POLISH-01 walkthrough see it again on v2.1 upgrade | Version-gate the reset: only reset `onboardingComplete` if stored version < v2.1; use `context.globalState.get('goatide.lastOnboardingVersion', '0')` |
| SmartScreen warning on first Windows download despite EV signing | New users see "Unknown publisher" warning and dismiss GoatIDE as untrusted | Pre-submit to Microsoft Software Submission portal before public release; document 2–4 week reputation window in release notes |
| Multi-daemon "Cross-Repo Graph" opens but repo B's nodes show `repo_id='primary'` instead of B's fingerprint | User sees duplicate nodes with wrong labels in the inspector | Assert in Phase 18 that `repo_id` is the SHA-256(12) fingerprint, not the literal string `'primary'`, for non-primary repos |
| `dispatchHover` Reject button has no undo affordance | User clicks Reject by accident; the rejection is now in the append-only graph | Show an "Undo rejection" option in the subsequent status-bar message that calls `kernel.supersede(rejectionNodeId)` within a 5s window |

---

## "Looks Done But Isn't" Checklist

- [ ] **macOS notarization:** Verify `codesign -dv --verbose=4 <app>/Contents/Resources/kernel/node_modules/better-sqlite3/build/Release/better_sqlite3.node` shows `flags=0x10000(runtime)` — hardened runtime flag set.
- [ ] **Windows signing:** Verify the signed `.exe` triggers NO SmartScreen prompt on a clean VM with no prior GoatIDE reputation — check Microsoft's Software Submission portal response, not just the local machine.
- [ ] **electron-updater disabled in dev mode:** Verify `initAutoUpdater()` is a complete no-op when `process.env.VSCODE_DEV === '1'` — unit test asserts `checkForUpdatesAndNotify` was never called (sinon spy).
- [ ] **VS Code IUpdateService stubbed:** Verify zero requests to `code.visualstudio.com/api/update/` in GoatIDE network logs — assert in Phase 18 CDPharness network interception.
- [ ] **Mandate A fence extended:** Verify `refuse-llm-in-canvas.meta.sh` also scans `canvas/panel.ts` and any new `canvas/authoring*.ts` — grep for the fence script's CANVAS_DIR path to confirm coverage.
- [ ] **Mandate B fence extended:** Verify `refuse-deep05-write.sh` BANNED array includes the new v2.1 write RPC name — grep the script after the RPC is named.
- [ ] **Authoring form body text is empty on open:** Verify the authoring form `textarea` has an empty `defaultValue` (no pre-population from kernel, diff, or LLM) — unit test mounts the form and asserts `textarea.value === ''`.
- [ ] **Multi-daemon DB guard:** Verify each daemon fails fast with a clear error if a second daemon tries to open the same DB in readwrite mode — kernel startup test.
- [ ] **Walkthrough completion still uses globalState:** Verify `grep -r "WorkspaceConfiguration.update" src/vs/goatide/extensions/goatide-bridge/src/onboarding/` returns zero results — add as a CI meta-test after the foregrounding fix.
- [ ] **Double-rejection guard:** Verify calling `dispatchHover` reject twice with the same `change_id` calls `kernel.recordRejection` exactly once — sinon call-count assertion.
- [ ] **Phase 18 receipt assertions:** Verify no Phase 18 test asserts on `body_preview` strings unless the exact text was seeded in the test setup — code review checklist item.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Apple notarization rejected for `better_sqlite3.node` | MEDIUM (rebuild + resubmit, 2–4 hours) | Re-sign `better_sqlite3.node` with `codesign -o runtime`; re-package; resubmit to Apple notarization |
| VS Code `IUpdateService` conflict — version mismatch crash | HIGH (users get a crash loop on startup) | Publish a hotfix build with the `IUpdateService` stub; NSIS installer includes a cleanup step for the old install directory |
| Multi-daemon WAL corruption | HIGH (data loss in affected repo's graph.db) | Switch affected repo to the backup DB copy (if recent backup exists); if not, use `sqlite3 graph.db ".recover"` to recover rows; reseed from kernel CLI |
| Mandate A violation — LLM text in DecisionNode body | HIGH (permanent — append-only graph, no delete) | Supersede the polluted node with a corrected node (new `body` text typed by the user); mark the superseded node's `payload.source` field as `'llm-polluted'` for audit; update all edges pointing to the old node to point at the corrected one |
| Mandate B violation — inspector calls write RPC | MEDIUM (graph state polluted by ghost Attempts) | Identify ghost Attempts via `queryByKind('Attempt')` filtered by `provenance.source === 'inspector'`; supersede each ghost node; extend `refuse-deep05-write.sh` BANNED array; rebuild bridge |
| `refuse-stale-bridge-mirror.sh` fails after authoring changes | LOW (CI blocked, no data loss) | Run `bash scripts/prepare_goatide.sh`; verify with `refuse-stale-bridge-mirror.sh` exits 0; commit the regenerated mirror |
| Phase 18 CDP harness cannot attach to installed binary | MEDIUM (Phase 18 scope must be redesigned) | Split harness: test package with CDP fuse on for assertions; GA package smoke test without CDP (observable OS state only) |
| Walkthrough reappears after Pitfall I regression | LOW (user annoyance) | Publish a patch that sets `context.globalState.update('goatide.onboardingComplete', true)` on activation if the user has seen the walkthrough before (version-gate check) |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CDP smoke harness breaks on signed installed build (A) | Phase 18 Wave 0 | Wave-0 plan documents test-package vs. GA-package strategy; harness adapted before any SC is written |
| Mandate A regression via authoring form pre-population (B) | v2.1 Authoring UI Wave 0 | `refuse-llm-in-canvas.meta.sh` coverage extended; authoring form `textarea.value === ''` unit test GREEN |
| Mandate B regression — inspector edit calls new write RPC (C) | v2.1 Authoring UI Wave 0 | `refuse-deep05-write.sh` BANNED updated; `ReadonlyKernelClient` Pick<> excludes new RPC |
| Save-gate reentrancy loop from authoring write path (D) | v2.1 Authoring UI Wave 0 | Authoring design docs confirm no `onWillSaveTextDocument` trigger; reentrancy unit test GREEN |
| Multi-daemon DB WAL collision (E) | v2.1 Multi-Daemon Wave 0 | Kernel startup guard test: second daemon readwrite open on same DB path fails with explicit error |
| macOS `better-sqlite3` notarization failure (F) | v2.1 C1 Wave 0 | `beforeSign` hook signed `.node` files; `spctl --assess` passes on local `.app` before CI submission |
| Windows EV hardware token — CI signing blocked (G) | v2.1 C2 Wave 0 | Trusted Signing service provisioned and tested on dummy `.exe` before `electron-builder.yml` is authored |
| VS Code `IUpdateService` conflicts with `electron-updater` (H) | v2.1 C3 Wave 0 | No requests to `code.visualstudio.com` in Phase 18 CDPharness network log; version-mismatch crash test GREEN |
| Walkthrough foregrounding resets `onboardingComplete` wrong API (I) | v2.1 Walkthrough Wave 0 | `grep WorkspaceConfiguration.update` in onboarding/ returns zero; completion test still uses `globalState` |
| Bridge mirror CI gate fires after authoring changes (J) | All v2.1 phases | `prepare_goatide.sh` automated in compile script; pre-commit hook added |
| Phase 18 receipt assertions use LLM-predicted text (K) | Phase 18 Wave 0 | Receipt assertion pattern documented; code review checklist item enforced |
| KernelDegradedBanner single-instance wrong for multi-daemon (L) | v2.1 Multi-Daemon Wave 1 | Banner extended to accept array of states; "any degraded = banner shows" unit test GREEN |
| Double-rejection on Reject button (M) | v2.1 Authoring UI Wave 0 | `disposedChangeIds` guard; call-count spy asserts `recordRejection` called exactly once per `change_id` |
| Upstream-sync conflict surface grows with v2.1 divergence (N) | All v2.1 phases | `GOATIDE-FORK` comment convention; CI lint for untagged modifications in `src/vs/code/` |
| `dev-app-update.yml` token exposure (O) | v2.1 C3 Wave 0 | `grep dev-app-update .gitignore` returns the file; CI uses secrets |
| Walkthrough media binary assets miss mirror sync (P) | v2.1 Walkthrough — if binary assets added | `prepare_goatide.sh` uses `rsync`/`cp -r` on `media/walkthrough/`; `refuse-stale-bridge-mirror.sh` passes |
| `PendingAttemptsQueue` drains against wrong daemon (Q) | v2.1 Multi-Daemon Wave 1 | Per-daemon queue with `repoId` assertion; drain target matches draining daemon's `repoId` |

---

## Sources

- GoatIDE source inspection: `scripts/test/phase17-smoke-cdp.cjs` (dev-mode CDP harness; fuse-sensitivity analysis), `scripts/ci/refuse-deep05-write.sh` (BANNED array — confirmed does not include v2.1 RPC names), `scripts/ci/refuse-stale-bridge-mirror.sh` (byte-equal fence scope), `scripts/test/refuse-llm-in-canvas.meta.sh` (Mandate A fence scope — confirmed covers only `canvas/webview/`, not host-side), `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/CitationList.tsx` (POLISH-03 empty-state CTA wire; `onAddDecisionNode` prop), `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` (activation ordering, multi-daemon spawn entrypoint analysis, single-kernel assumptions in `PendingAttemptsQueue`, `KernelDegradedBanner`), `src/vs/goatide/extensions/goatide-bridge/src/onboarding/walkthrough-completion.ts` (globalState usage verified — Pitfall I target confirmed correct), `extensions/goatide-bridge/dist/save-gate/tier-dispatch.js` (benignSetting read in silent branch only; destructive branch cannot de-escalate — Mandate D structure confirmed)
- `.planning/PROJECT.md`: Mandates A/B/D definitions, v2.1 scope, bridge mirror registration gap, single-DB decision rationale
- `.planning/ROADMAP.md`: Phase 17 ship record (POLISH-01..04, DEEP-06 cross-repo dormant), v2.1 active items
- `.planning/research/v2.0-archive/PITFALLS.md`: Pitfalls 7/8/9 (electron-updater VSCODE_DEV guard, NSIS GUID, walkthrough completion) — v2.1 pitfalls H/G/I extend these without duplicating
- Electron Fuses documentation (electronjs.org/docs/latest/tutorial/fuses): `EnableNodeCliInspectArguments` fuse gates `--inspect`/`--remote-debugging-port` on packaged builds — MEDIUM confidence (official Electron docs, confirmed against fuse plugin electron-builder docs)
- CA/B Forum EV hardware token mandate (June 2023): physical HSM requirement confirmed via multiple signing certificate vendor pages — HIGH confidence (multiple vendor sources agree)
- Microsoft SmartScreen EV reputation change (March 2024): EV certs no longer bypass SmartScreen — MEDIUM confidence (from ssl-insights.com, Microsoft Learn SmartScreen reputation page)
- Microsoft Trusted Signing service: CI-compatible HSM signing API, replaces physical token for Windows signing — MEDIUM confidence (Microsoft Learn docs, multiple blog posts)
- Apple macOS notarization requirements: all embedded binaries must have hardened runtime; `better_sqlite3.node` is an embedded native binary — HIGH confidence (Apple Developer Documentation, multiple post-mortems)
- `electron-updater` update loop / channel YML drift: documented in electron-builder GitHub issues — MEDIUM confidence (GitHub issues, not official docs)

---
*Pitfalls research for: GoatIDE v2.1 — adding distribution + authoring + multi-daemon + walkthrough fix to existing VS Code fork*
*Researched: 2026-05-16*
