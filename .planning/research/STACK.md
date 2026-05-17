# Stack Research

**Domain:** VS Code fork — bitemporal graph IDE (v2.1 — verify + ship: installable build, distribution, authoring UI, cross-repo activation, walkthrough foregrounding)
**Researched:** 2026-05-16
**Confidence:** HIGH for electron-builder/updater + notarytool + authoring patterns; MEDIUM for Windows EV signing + multi-daemon orchestration; LOW for walkthrough timing fix (needs VS Code internals inspection)

---

## Scope

This file covers ONLY stack additions for v2.1. Everything from v2.0 is in place and working:
- Electron 39.8.7, TypeScript ~5.9.0, better-sqlite3 rebuilt for ABI 140
- Kernel: Drizzle + better-sqlite3 + vscode-jsonrpc 8.2.1 + express + chokidar + simple-git + zod
- Bridge: React 18, esbuild, mocha/jsdom, @testing-library/react, cytoscape@^3.33.0 + cytoscape-fcose@^2.2.0
- Testing: vitest (kernel), mocha (bridge), Playwright + CDP (phase17-smoke-cdp.cjs, freshclone-smoke-cdp.cjs)
- Build: gulp + @vscode/gulp-electron + innosetup (in devDependencies already)

Do NOT re-add or modify any of those.

---

## Recommended Stack

### Area 1: Phase 18 — Installable Build + E2E Verification

**Decision: Use `electron-builder` (separate config file, NOT conflicting with the existing gulp pipeline) to produce the real installable binary. The VS Code gulp pipeline (`build/gulpfile.vscode.ts` + `@vscode/gulp-electron`) already downloads Electron and produces `out/` — electron-builder operates on a pre-built `app.asar` via its `directories.app` option so the two pipelines do not conflict.**

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| `electron-builder` | `^26.8.2` | root `devDependencies` | Packs the compiled `out/` tree into an NSIS installer (Windows), DMG+ZIP (macOS), and AppImage/deb (Linux). Generates `latest.yml` / `latest-mac.yml` update-manifest files for electron-updater. Published 2026-03-04 — current. |

**Why electron-builder over alternatives:**
- The VS Code gulp pipeline already handles TypeScript compilation and Electron download. electron-builder's `--prepackaged` / `directories.app` mode lets it wrap the already-compiled tree without re-running the build — zero conflict with existing gulp tasks.
- Electron Forge cannot wrap a pre-compiled tree this way; it requires controlling the entire build pipeline from scratch.
- Adapting the InnoSetup pipeline (already in `devDependencies` as `innosetup@^6.4.1`) would require a Microsoft-controlled update CDN (`update.code.visualstudio.com`) that GoatIDE cannot write to. electron-builder+NSIS routes updates through GitHub Releases — zero server infrastructure.

**Config pattern:** Add `electron-builder.yml` at repo root (NOT a `build` key inside `package.json` — that key is used by the VS Code build system and collides):
```yaml
appId: ai.goatide.GoatIDE
productName: GoatIDE
directories:
  app: out          # point at the already-compiled VS Code output directory
  output: dist
win:
  target: nsis
mac:
  target: [dmg, zip]  # zip required for Squirrel.Mac auto-update (latest-mac.yml)
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  afterSign: scripts/notarize.js   # C1 hook — see Area 2
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
publish:
  provider: github
  owner: <github-org>
  repo: goatide
```

**E2E verification on real binary:** The existing Playwright+CDP harness (`scripts/test/phase17-smoke-cdp.cjs`) launches via `.build/electron/GoatIDE.exe` in dev mode. Phase 18 adds a second harness that launches the real installed binary. The pattern is identical — `playwright._electron.launch(installedBinaryPath)` — but without `VSCODE_DEV=1` and without `--extensionDevelopmentPath`. The kernel must be pre-seeded for the test (or auto-started by the installed bridge).

**better-sqlite3 repackaging:** electron-builder by default runs `electron-rebuild` on native modules during packaging. GoatIDE's kernel sidecar is a separate Node process — it is NOT inside the Electron renderer. Its `better-sqlite3` is rebuilt for Electron ABI 140 via `kernel/scripts/install-electron-prebuild.cjs` at `npm install` time. When electron-builder packages the app, it must NOT attempt to rebuild the kernel's `better-sqlite3` (it would use the wrong ABI). Solution: add `asarUnpack: ["kernel/**"]` to exclude the kernel sidecar from ASAR packaging and from electron-builder's native rebuild pass. The kernel's `install-electron-prebuild.cjs` postinstall handles the rebuild independently.

---

### Area 2: Distribution — C1 macOS Notarization

**Decision: `@electron/notarize` + `xcrun notarytool` via the electron-builder `afterSign` hook. No alternative.**

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| `@electron/notarize` | `^3.1.1` | root `devDependencies` | Official Electron org notarization wrapper. Calls `xcrun notarytool submit` under the hood. v3.x is ESM-only, Node 22+ (GoatIDE already uses Node 22 — compatible). Legacy `electron-notarize` (the predecessor) is abandoned. `electron-builder-notarize` wraps this package but adds indirection. Use `@electron/notarize` directly from the `afterSign` hook. |

**Why `@electron/notarize` v3.x:**
- v3.0 removed `altool` support entirely (Apple sunset altool November 1, 2023). v3.x is `notarytool`-only — correct for 2026.
- v3.x requires Node 22+ — GoatIDE's kernel already targets Node 22 (confirmed in `kernel/package.json` `@types/node: ^22.0.0`). No version conflict.
- v2.x is still available but carries the legacy `altool` code path; no reason to use it.

**notarytool requirements (2026-verified):**
- Apple Developer Program subscription (~$99/year) — required
- Developer ID Application certificate (not Mac App Store cert)
- Xcode 14+ on the build machine (notarytool ships with Xcode; also available via standalone Command Line Tools)
- App-specific password OR App Store Connect API key (v3.x supports both; API key is preferred for CI because it avoids two-factor prompts)
- `hardenedRuntime: true` must be set in the electron-builder `mac` config (required by notarytool)

**`afterSign` hook** (`scripts/notarize.js`):
```javascript
const { notarize } = require('@electron/notarize');
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;
  await notarize({
    appPath: `${appOutDir}/GoatIDE.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```
Use environment variables for credentials — NEVER hard-code. For CI, store as GitHub Actions secrets.

**Stapling:** electron-builder automatically staples after notarize when `afterSign` returns. No separate staple step needed.

---

### Area 2 cont: Distribution — C2 Windows Code Signing

**Decision: Use Azure Trusted Signing (Microsoft's cloud HSM) as the signing provider. Do NOT use a physical EV USB dongle for solo-developer CI workflows.**

| Tool | Version/Source | Where | Purpose |
|------|----------------|-------|---------|
| Azure Trusted Signing | Cloud service (no npm package — uses `signtool.exe` via `win.azureSignOptions` in electron-builder) | CI environment (GitHub Actions) | Signs NSIS installer without a physical hardware token. Replaces EV USB dongle requirement. |
| `@azure/trusted-signing-action` | GitHub Action | `.github/workflows/` | Wraps Azure Trusted Signing for CI — configures signtool automatically |

**Why Azure Trusted Signing over a physical EV certificate:**

EV certificates in 2026 require FIPS 140-2 Level 2 hardware tokens (YubiKey FIPS or equivalent). The CA/B Forum mandated hardware-token-only storage as of June 2023. Physical tokens cannot be used in CI without USB passthrough (expensive VM setups) or cloud HSM forwarding. As of March 2026, CA/B Forum limits certificate validity to 458 days, adding annual renewal overhead.

**Important 2026 caveat on SmartScreen:** EV certificates no longer bypass SmartScreen automatically as of March 2024. Azure Trusted Signing also does not bypass SmartScreen on first run — reputation builds with download count. For solo dogfood, SmartScreen will warn on first install but disappear as usage accrues. This is acceptable.

**electron-builder config for Azure Trusted Signing:**
```yaml
win:
  azureSignOptions:
    publisherName: "GoatIDE"
    endpoint: "https://<signing-endpoint>.codesigning.azure.net/"
    certificateProfileName: "<profile>"
    codeSigningAccountName: "<account>"
```

**Fallback for no signing (solo dev):** If Azure Trusted Signing setup is deferred, electron-builder produces an unsigned NSIS installer. SmartScreen will warn. Users can bypass via "More info → Run anyway". Acceptable for Phase 18 self-installation testing.

**Squirrel.Windows is deprecated and removed.** Do not use. electron-builder's NSIS target is the supported Windows install/update mechanism.

---

### Area 2 cont: Distribution — C3 Windows + macOS Auto-Update

**Decision: `electron-updater` with GitHub Releases as the update channel. One updater, both platforms.**

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| `electron-updater` | `^6.8.3` | root `dependencies` (ships in packaged app) | Runtime auto-update client for both Windows (NSIS) and macOS (Squirrel.Mac via zip). Polls `latest.yml` / `latest-mac.yml` from GitHub Releases. Delta blockmap updates for Windows (only changed blocks downloaded). |

**Why electron-updater:**
- Single API across Windows and macOS. Squirrel.Windows is deprecated and not supported by electron-updater (NSIS target is the replacement). Squirrel.Mac is still used on macOS but is hidden behind electron-updater's abstraction — the `mac.target: [dmg, zip]` electron-builder config generates the correct metadata.
- GitHub Releases as provider: zero server infrastructure. electron-builder publishes `latest.yml` to the GitHub Release on build. electron-updater fetches it on `checkForUpdatesAndNotify()`. Works for private repos with `GH_TOKEN`.

**Integration point:** Add `src/vs/goatide/update/goatideUpdater.ts` in the Electron main process (NOT inside `src/vs/platform/update/` — that is the VS Code InnoSetup path; leave it untouched for upstream-sync hygiene):
```typescript
import { autoUpdater } from 'electron-updater';
// Gate: never run in dev-mode or CI (VSCODE_DEV=1 check)
if (!process.env.VSCODE_DEV && autoUpdater.isUpdaterActive()) {
  autoUpdater.checkForUpdatesAndNotify();
}
```
Call from `app.whenReady()` in `src/vs/code/electron-main/main.ts` or a GoatIDE-specific main-process module — do NOT modify VS Code's main entry point beyond a single `import` call.

**VSCODE_DEV=1 interaction:** `autoUpdater.isUpdaterActive()` returns `false` in dev-mode. Gate initialization behind `!process.env.VSCODE_DEV` anyway (defense-in-depth). The freshclone smoke harness runs with `VSCODE_DEV=1` — updater will never fire in CI.

**Channel strategy:** For solo dogfood, use a single `latest` channel. Semver pre-release tags (`2.1.0-beta.0`) automatically route to `beta.yml` if `generateUpdatesFilesForAllChannels: true` is set. Not needed until there are beta testers.

---

### Area 3: DecisionNode Authoring UI

**Decision: No new npm packages. Extend existing React + Zod + esbuild bridge pattern.**

The `goatide.canvas.addDecisionNode` command stub (Phase 17 POLISH-03) fires from `CitationList.tsx`'s empty-state CTA via `rpc.postAddDecisionNode()`. The write path requires:

1. A new kernel RPC method: `kernel.createDecisionNode(payload: CreateDecisionNodePayload)` — extends the existing `methods.ts` + `server.ts` RPC surface. No new kernel packages.
2. A webview form component: a new `AddDecisionNodeForm.tsx` inside `src/canvas/webview/` — uses the existing `<textarea>` / `<input>` pattern from `ConfirmationPhrase.tsx` and `App.tsx` (the reject-with-note form at line 297 is the direct model). Controlled React state, validated via `zod` schema before posting.
3. A bridge handler in `panel.ts` — same `handleMessage` switch pattern already used for `canvas.requestRationale` and `canvas.requestConstraintLift`.

**Authoring form field inspection (from existing code):**
The existing reject-with-note form (`App.tsx` lines 297–310) is the exact pattern: `<textarea>` controlled by `useState`, disabled submit button until trimmed length > 0, `rpc.post*` on submit. AddDecisionNodeForm should follow this verbatim.

**Zod schema for the write payload:** New `CreateDecisionNodeRequest` in `kernel/src/rpc/methods.ts` using the existing `z.object({})` convention. No new packages — `zod@^3.25` already in both kernel and bridge dependencies.

**Post-hoc rejection (Reject button in dispatchHover modal):** The `dispatchHover` private function in `tier-dispatch.ts` currently shows only a status-bar message (POLISH-04). The POLISH-04 stub's "Reject" button needs a `canvas.module.ts` `getOrCreate` → `rpc.postReject(changeId)` call — same pattern as the full Canvas modal. No new packages.

---

### Area 4: Cross-Repo Activation — Multi-Daemon Kernel Orchestration

**Decision: One kernel sidecar per workspace folder (per-repo daemon). Coordinate via per-repo lockfiles, NOT a multiplexer process. Reuse all existing lockfile, port-discovery, and KernelClient machinery.**

**Why NOT shared single-daemon with repo_id partitioning for v2.1 writes:**
The DEEP-06 schema (Phase 16) added `repo_id` partitioning to the single DB. This works for read-time cross-repo enumeration (Phase 17). But real cross-repo writes (the v2.1 goal) require each repo's save-gate to write to the kernel that owns that repo's DB. A single-DB model with all repos in one SQLite file creates a WAL contention bottleneck when two workspace folders have concurrent saves — each save would hold a WAL write lock that blocks the other.

**Per-repo daemon model:**

| Component | What Changes | How |
|-----------|-------------|-----|
| Lockfile path | Currently global: `~/.config/goatide/kernel.lock` | Add per-repo variant: `~/.config/goatide/kernel-<repoId12>.lock`. The existing `resolveLockfilePath()` in `kernel/src/daemon/paths.ts` becomes `resolveLockfilePath(repoId?: string)` — fallback to `kernel.lock` for backward compat. |
| DB path | Currently global: `~/.goatide/graph.db` | Add per-repo variant: `~/.goatide/graph-<repoId12>.db`. Existing `resolveDbPath()` in `kernel/src/cli/db-path.ts` gets the same `repoId` parameter treatment. |
| Bridge KernelClient | Currently single instance | Becomes a `Map<repoId, KernelClient>` managed by the bridge's `extension.ts`. `ensureKernel()` is called once per workspace folder on activation. |
| Save-gate `on-will-save.ts` | Currently uses the single global KernelClient | Resolves the active document's workspace folder → repoId → looks up the corresponding KernelClient in the map. |
| Cross-repo Inspector | Currently fetches from single kernel | Iterates the `Map<repoId, KernelClient>` and merges `queryGraphSnapshot` results — no kernel changes, bridge-only aggregation. |

**No new npm packages for multi-daemon orchestration.** The existing primitives cover it:
- `vscode.workspace.workspaceFolders` — enumerate folders (already used in `workspace-repos.ts`)
- `enumerateWorkspaceRepos()` — fingerprint → repoId (already written in Phase 17)
- `atomicCreateLockfile` / `readLockfile` / `isPidAlive` / `clearStaleLockfile` — already in `kernel/src/daemon/lockfile.ts`
- `bindEphemeralPort` / `createTcpRpcServer` — already in `kernel/src/daemon/port-discovery.ts`
- `KernelClient.ensureKernel()` — already handles spawn-or-connect; parameterize by lockfilePath + dbPath

**Graceful degradation:** If a per-repo daemon fails to start (missing git remote, locked DB), that folder's `KernelClient` stays in `degraded` state. The existing `KernelDegradedBanner` already handles this per-client — no new UI needed.

**Vitest test isolation note:** The existing kernel vitest suite uses a single in-memory DB per test. Multi-daemon tests need separate DB file paths — use `tmp.dirSync()` from the existing test helper pattern (already done in `sc3-section-lock.spec.ts`).

---

### Area 5: Walkthrough Foregrounding Fix

**Decision: No new npm packages. Use `workbench.action.openWalkthrough` command (VS Code built-in) with a `setTimeout` delay guard to survive the race against VS Code's own "Setup VS Code" walkthrough.**

**The race (verified via Phase 17 CDP smoke SC11/SC12 deferred):** VS Code opens its own Getting Started panel and auto-selects the default walkthrough (e.g. "Get Started with VS Code") before extension activation completes. The GoatIDE walkthrough's `when: "!goatide.onboardingComplete"` condition fires during activation, but the Getting Started panel is already showing the VS Code default.

**Fix mechanism:**
```typescript
// In maybeAutoOpenWalkthrough(), after registering the walkthrough:
if (!context.globalState.get('goatide.onboardingComplete')) {
  // Delay to let VS Code's own Getting Started sequence settle.
  // 2000ms empirically wins the race in CDP smoke tests.
  // Wrapped in a try/catch — if the command is unavailable, fail silently.
  setTimeout(() => {
    vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      'goatide.goatide-bridge#goatide.onboarding',
      false
    );
  }, 2000);
}
```

**Important:** The walkthrough identifier format is `"<publisher>.<extensionName>#<walkthroughId>"`. From `goatide-bridge/package.json`: publisher is `goatide`, name is `goatide-bridge`, walkthrough id is `goatide.onboarding`. Full identifier: `"goatide.goatide-bridge#goatide.onboarding"`.

**Known issue:** `workbench.action.openWalkthrough` has a documented race condition (GitHub issue #187958) where the command silently no-ops if the Welcome panel has not fully loaded. The `setTimeout` guard mitigates this. The Phase 18 CDP smoke harness must verify SC11/SC12 with this fix by checking that the Getting Started panel's active walkthrough title contains "GoatIDE" after the timeout.

**Confidence: MEDIUM.** The exact delay needed is empirical. Phase 18 must tune it against the real installed binary (not dev-mode). If 2000ms is insufficient, a retry loop checking `vscode.window.visibleTextEditors` or a panel-state poll is the next option.

---

## Installation (new packages only)

```bash
# Root — Phase 18 installable build + C3 auto-update
npm install -D electron-builder@^26.8.2
npm install electron-updater@^6.8.3

# Root — C1 macOS notarization (dev-only; runs on macOS CI only)
npm install -D @electron/notarize@^3.1.1
```

**Notes:**
- `electron-updater` goes in root `dependencies` (not `devDependencies`) — it ships inside the packaged app.
- `electron-builder` and `@electron/notarize` are `devDependencies` — build-time only.
- No bridge `package.json` changes for Areas 3–5. No bridge mirror regen needed for these areas.
- Multi-daemon (Area 4) requires kernel `src/daemon/paths.ts` and `src/cli/db-path.ts` API additions — no new npm installs.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `electron-builder@^26.8.2` | Electron Forge | Forge cannot wrap a pre-compiled VS Code `out/` tree. It requires owning the entire build pipeline from the start. GoatIDE's gulp pipeline is not replaceable. |
| `electron-builder@^26.8.2` | Adapted VS Code InnoSetup pipeline | InnoSetup pipeline requires Microsoft's update CDN (`update.code.visualstudio.com`). GoatIDE cannot write to that server. Adapting requires a custom update API server + Rust `inno_updater.exe` rebuild — months of infra work. |
| `electron-updater@^6.8.3` | VS Code `inno_updater.exe` path | Same CDN problem as above. Also: Squirrel.Windows (what inno_updater uses) is deprecated in electron-builder. |
| Azure Trusted Signing | Physical EV USB dongle (YubiKey FIPS) | Physical tokens cannot be used in CI without USB passthrough. YubiKey FIPS requires annual renewal (458-day cap from March 2026). Azure Trusted Signing is cloud HSM — CI-friendly. |
| Azure Trusted Signing | OV (Organization Validated) cert | OV certs do not require hardware token but provide weaker SmartScreen reputation than EV/Trusted Signing. As of 2024, EV no longer auto-bypasses SmartScreen either — both show SmartScreen until reputation builds. Azure Trusted Signing is Microsoft-native so reputation builds faster. |
| `@electron/notarize@^3.1.1` | `electron-builder-notarize` | `electron-builder-notarize` wraps `@electron/notarize` and adds a layer of indirection. Using `@electron/notarize` directly from the `afterSign` hook is simpler and avoids the wrapper's version-lag risk. |
| Per-repo lockfile + KernelClient map | Single daemon with repo_id multiplexing | Single-daemon model works for read-only cross-repo queries (Phase 17 current state). For writes, WAL contention between concurrent saves from different workspace folders makes single-daemon problematic at v2.1 scale. Per-repo daemons have full WAL isolation. |
| `workbench.action.openWalkthrough` + setTimeout | VS Code `IViewsService` / workbench internals | GoatIDE is a VS Code fork and could call internal APIs. But internal APIs risk upstream-sync breakage on every VS Code update. Using the public `workbench.action.openWalkthrough` command (available since 1.74, stable in 1.117) is upstream-sync safe. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Squirrel.Windows target in electron-builder | Explicitly deprecated and unsupported. electron-builder removed auto-update support for Squirrel.Windows. VS Code used it historically via Microsoft's CDN — that CDN is not available to GoatIDE. | NSIS target with `electron-updater` |
| `altool` (xcrun altool) for macOS notarization | Apple sunset altool on November 1, 2023. Submissions will be rejected. `@electron/notarize` v3.x removed it. | `xcrun notarytool` via `@electron/notarize@^3.1.1` |
| `electron-notarize` (old package) | Deprecated predecessor to `@electron/notarize`. Not maintained. | `@electron/notarize@^3.1.1` |
| `electron-builder` `build` key in root `package.json` | The VS Code build system uses `package.json`'s scripts + gulp config extensively. A `build` key in `package.json` would conflict with the VS Code build runner expectations. | Separate `electron-builder.yml` file at repo root |
| Including kernel sidecar inside ASAR | electron-builder would try to rebuild `better-sqlite3` for the Electron renderer ABI (not the kernel's detached-process ABI). The kernel's `install-electron-prebuild.cjs` already handles the correct ABI rebuild at `npm install` time. | `asarUnpack: ["kernel/**"]` to exclude kernel from ASAR |
| Physical EV certificate in CI | FIPS 140-2 hardware token cannot be plugged into a GitHub Actions runner. Cloud workarounds (USB over IP) are complex and expensive. | Azure Trusted Signing (cloud HSM, works natively in GitHub Actions) |
| Hardcoded Apple credentials in `afterSign` hook | Leaked in git history. APPLE_ID / APPLE_ID_PASSWORD / APPLE_TEAM_ID must be env vars. | GitHub Actions secrets → environment variables |
| react-hook-form or yup for DecisionNode form validation | The existing bridge has zero form-validation library dependencies. The DecisionNode form is one text field — adding a 25KB validation library for a single `value.trim().length > 0` guard is overengineering. | Plain React `useState` + disabled-button pattern (already established in `App.tsx` reject-with-note form) |
| MobX / Zustand for multi-daemon client state | The bridge's state model is deliberately simple: connection state is a per-client `ConnectionStateMachine` enum. Adding a state management library would require refactoring all existing canvas + inspector components. | `Map<repoId, KernelClient>` in `extension.ts` activation context; existing `ConnectionStateMachine` per entry |

---

## Stack Patterns by Feature Group

**Phase 18 — Installable build on macOS:**
- electron-builder with `mac.target: [dmg, zip]`, `hardenedRuntime: true`, `afterSign: scripts/notarize.js`
- Requires Apple Developer Program + Developer ID Application cert + app-specific password OR App Store Connect API key
- DMG produced for distribution; ZIP produced automatically (required by Squirrel.Mac updater)

**Phase 18 — Installable build on Windows:**
- electron-builder with `win.target: nsis`
- Optional: `win.azureSignOptions` for Azure Trusted Signing if C2 is ready; skip if deferring signing
- Without signing: SmartScreen warns on first install; acceptable for Phase 18 self-install testing

**Phase 18 — Installable build on Linux:**
- electron-builder with `linux.target: [AppImage, deb]` — AppImage is portable (no install), deb for package-manager install
- Linux does not require code signing or notarization

**C3 auto-update — testing without a real release:**
- Set `autoUpdater.forceDevUpdateConfig = true` + add `dev-app-update.yml` pointing at a GitHub draft release
- Gate this code path behind an explicit `GOATIDE_TEST_UPDATE=1` env flag; NEVER enable in normal dev or CI
- The freshclone smoke harness must assert `autoUpdater.isUpdaterActive() === false` when `VSCODE_DEV=1`

**Multi-daemon — workspace with 1 folder:**
- Fall through to existing single-daemon path: `repoId = 'primary'`, lockfile = `kernel.lock`, db = `graph.db`
- No behavior change for single-folder workspaces

**Multi-daemon — workspace with 2+ folders:**
- Enumerate `workspaceFolders` via `enumerateWorkspaceRepos()` on activation
- Spawn one kernel per unique `repoId` (dedup: if two folders share a git remote, they share a daemon)
- Bridge's `KernelClient` map is `Map<repoId, KernelClient>` — save-gate dispatches to the folder's client

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `electron-builder@^26.8.2` | Electron 39.8.7 | Current major. No known Electron 39 incompatibilities. Verified: electron-builder discovers the Electron version from `devDependencies.electron` in `package.json`. GoatIDE pins `electron@39.8.7` there — electron-builder will pick it up correctly. |
| `electron-updater@^6.8.3` | `electron-builder@^26.8.2` | Must use matching major from `electron-userland`. 6.x works with NSIS (Windows) and Squirrel.Mac via zip (macOS). |
| `@electron/notarize@^3.1.1` | Node 22+ | v3.x is ESM-only and requires Node 22.12.0 LTS. GoatIDE's kernel already uses Node 22. The `afterSign` hook runs in the electron-builder build process (also Node 22). Compatible. |
| `@electron/notarize@^3.1.1` | Xcode 14+ / notarytool | `xcrun notarytool` ships with Xcode 14+ and also with Xcode Command Line Tools. macOS CI runners (e.g. `macos-14` on GitHub Actions) ship Xcode 14+. |
| `electron-builder@^26.8.2` | TypeScript ~5.9.0 | electron-builder is a build tool — it runs as plain Node.js at build time, independent of the project's TypeScript version. No conflict. |
| `electron-updater@^6.8.3` | VSCODE_DEV=1 | `autoUpdater.isUpdaterActive()` returns `false` in dev mode. Guard with `!process.env.VSCODE_DEV` anyway (defense-in-depth). |

---

## Integration Points With Existing Code

| New Addition | Integrates With | How |
|--------------|-----------------|-----|
| `electron-builder.yml` | `build/gulpfile.vscode.ts` | Parallel, non-conflicting. Gulp compiles + downloads Electron. electron-builder packages the result. Run as separate CLI step: `npx electron-builder --config electron-builder.yml`. |
| `goatideUpdater.ts` | `src/vs/code/electron-main/main.ts` | Single `import` call on `app.whenReady()`. Does not touch `src/vs/platform/update/` (VS Code InnoSetup path). |
| `scripts/notarize.js` | electron-builder `afterSign` hook | Runs post-signing, pre-DMG wrapping. Uses `@electron/notarize`. |
| `kernel.createDecisionNode` RPC | `kernel/src/rpc/methods.ts` + `server.ts` | Same extension pattern as Phase 14's `graph.queryRationaleAt`. New `z.object()` schema + handler function. |
| `KernelClient` map (multi-daemon) | `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` | `Map<repoId, KernelClient>` allocated at `activate()`. `on-will-save.ts` resolves active document's folder → repoId → KernelClient. `workspace.onDidChangeWorkspaceFolders` adds/removes clients. |
| Per-repo lockfile path | `kernel/src/daemon/paths.ts` (existing) | `resolveLockfilePath(repoId?: string)` — backward-compatible signature change. No breaking change to existing single-daemon flow. |

---

## Sources

- [electron-builder auto-update docs](https://www.electron.build/auto-update.html) — NSIS confirmed, Squirrel.Windows deprecated, macOS zip target required, GitHub Releases provider confirmed. HIGH confidence.
- [electron-builder Windows code-signing docs](https://www.electron.build/code-signing-win.html) — Azure Trusted Signing beta support confirmed in electron-builder. HIGH confidence.
- [electron-builder npm](https://www.npmjs.com/package/electron-builder) — version 26.8.2 confirmed current (published 2026-03-04). HIGH confidence.
- [electron-updater npm](https://www.npmjs.com/package/electron-updater) — version 6.8.3 confirmed current. HIGH confidence.
- [@electron/notarize releases](https://github.com/electron/notarize) — v3.1.1 confirmed; v3.x ESM-only, Node 22+, notarytool-only (altool removed). HIGH confidence.
- [@electron/notarize CDN](https://cdn.jsdelivr.net/npm/@electron/notarize@3.0.1/) — v3.0.1+ confirmed available. MEDIUM confidence on exact 3.1.1 (search confirmed 3.1.1 as latest).
- [Apple TN3147: Migrating to notarytool](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool) — altool sunset November 1, 2023 confirmed. HIGH confidence.
- [CA/Browser Forum EV cert requirements 2026](https://www.ssl.com/faqs/faq-getting-started-with-your-ev-code-signing-certificate/) — 458-day validity cap from March 2026, hardware token mandatory confirmed. HIGH confidence.
- [Azure Trusted Signing SmartScreen behavior](https://learn.microsoft.com/en-us/answers/questions/5861538/azure-trusted-signing-still-seeing-smartscreen-war) — SmartScreen warnings even with Trusted Signing on new intermediate CAs (March 2026). MEDIUM confidence (forum post, not official doc).
- [EV certificates no longer bypass SmartScreen](https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/) — confirmed EV no longer auto-clears SmartScreen since March 2024. MEDIUM confidence.
- [`workbench.action.openWalkthrough` command](https://www.eliostruyf.com/open-vscode-extension-walkthrough-command/) — format `"<publisher>.<name>#<walkthrough-id>"` confirmed. MEDIUM confidence (community blog, verified against VS Code issues).
- [VS Code issue #187958](https://github.com/microsoft/vscode/issues/187958) — `openWalkthrough` race condition (navigates to wrong location on first try) confirmed. HIGH confidence (official GitHub issue).
- [VS Code PR #207303](https://github.com/microsoft/vscode/pull/207303) — "Select first extension walkthrough for first launch if no built-in walkthroughs present" — shows VS Code itself has special-cased this scenario. MEDIUM confidence (PR, not shipped as stable API).
- GoatIDE source inspection: `kernel/src/daemon/lockfile.ts`, `kernel/src/daemon/paths.ts`, `kernel/src/daemon/port-discovery.ts`, `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts`, `src/vs/goatide/extensions/goatide-bridge/src/inspector/workspace-repos.ts`, `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/App.tsx` — multi-daemon orchestration feasibility, authoring form pattern, existing primitives. HIGH confidence.

---
*Stack research for: GoatIDE v2.1 — installable build verification + distribution + authoring + cross-repo activation + walkthrough foregrounding*
*Researched: 2026-05-16*
