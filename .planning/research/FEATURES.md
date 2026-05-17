# Feature Research

**Domain:** VS Code fork — bitemporal graph IDE (v2.1: distribution, authoring, walkthrough, cross-repo activation, E2E verification)
**Researched:** 2026-05-16
**Confidence:** HIGH for Distribution/SmartScreen/Notarization (official Microsoft + Apple docs verified); HIGH for electron-updater UX (official electron-builder docs verified); MEDIUM for DecisionNode authoring UX (no ecosystem comparator; derived from VS Code API + modal UX patterns); MEDIUM for walkthrough foregrounding (GitHub issue confirmed race, workaround documented); HIGH for cross-repo activation (VS Code multi-root API well-understood; multi-daemon orchestration is GoatIDE-novel); HIGH for E2E verification on installable (Playwright/Electron CDP well-documented)

## Scope Notice

This document covers ONLY the five new v2.1 capability areas. All v2.0 features (Verification Canvas, Graph Inspector, save-gate, Drift Detection, Session-priority lens, POLISH-01..04, DEEP-01..06) are already shipped and validated. They appear below only when a v2.1 feature depends on them.

---

## Feature Categories

Five distinct feature areas, each with its own table stakes / differentiators / anti-features / complexity rating.

---

## Category A: Distribution — Installable Build (C1 macOS Notarization, C2 Windows EV Code-Signing, C3 Auto-Update)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| macOS notarization (C1) | On macOS Sequoia+, un-notarized apps quarantined from the internet are completely unlaunchable — Gatekeeper blocks with "damaged app" error and only Privacy & Security exemption bypasses it. Notarization is not optional for real distribution. | MEDIUM | Requires: Apple Developer account ($99/yr), Hardened Runtime enabled, `@electron/notarize` npm package, `xcrun stapler staple` post-notarize. DMG must be notarized as the container (not just the .app inside). |
| Ticket stapling to DMG | Without stapling, Gatekeeper queries Apple's CDN to validate the notarization ticket at first launch. Stapling embeds the ticket in the DMG so offline installs and corporate networks with CDN restrictions still validate. | LOW | Run after `xcrun notarytool submit` completes. Staple the .dmg, not the .app directly. |
| First-open "from internet" dialog (notarized) | Even notarized apps get a single "Are you sure you want to open this app?" dialog on first launch (Gatekeeper quarantine flag). This is expected and unavoidable. User clicks Open once; never shown again for that install. | NONE (platform behavior) | This is distinct from the "damaged" error. Notarization makes this dialog informational rather than blocking. |
| Windows code signing (C2) | Unsigned Windows installers show "Windows protected your PC" SmartScreen full-block with no visible publisher name. Even with signing, SmartScreen warns until reputation accumulates. Signing is table stakes for credibility even if reputation is not immediate. | MEDIUM | Use OV or EV certificate. As of 2024, EV certs no longer give immediate SmartScreen reputation — both OV and EV require accumulated downloads. Budget several weeks and hundreds of clean installs before warnings disappear for most users. |
| SmartScreen-aware user communication | Users WILL see SmartScreen warning on first download of a newly signed GoatIDE installer, regardless of cert type. The extension's first-launch flow should not panic users about this. | LOW | Walkthrough or release notes should pre-warn: "Windows may show a SmartScreen warning on first install — click 'More info' then 'Run anyway'. This is expected for new releases." |
| In-app update notification (C3) | Any distributable Electron app is expected to tell users when a new version is available. No notification = users stay on their install version forever. | MEDIUM | `electron-updater` via `autoUpdater.checkForUpdatesAndNotify()`. Fires on app start. Uses GitHub Releases as the update channel via `publish.provider = "github"` in `electron-builder.yml`. |
| Background download with restart-to-apply prompt (C3) | Users expect updates to download silently in background, then prompt "Restart to update" — not require them to re-download manually. | MEDIUM | `autoDownload: true` (default). On `update-downloaded` event: `dialog.showMessageBox({ buttons: ['Restart Now', 'Later'] })`, call `autoUpdater.quitAndInstall()` on Restart. |
| Release notes in update notification (C3) | Users want to know what changed before restarting. Release notes in the notification are expected by Electron app users (Cursor, Zed, VSCodium all do this). | LOW | `update-downloaded` event provides `info.releaseNotes` as plain text string (not Markdown/HTML in default notification). Source: GitHub Release body. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Channel switching stable/beta (C3) | Power users (dogfood-first developer) can opt into beta channel before stable. No other solo-developer Electron fork exposes this — it's a Cursor/VS Code pattern at a micro scale. | LOW | Two `electron-builder.yml` configs, two `latest.yml` artifacts per GitHub Release (latest.yml for stable, latest-beta.yml for beta). Channel set in app config, checked against matching `latest.yml`. |
| Auto-update guard in dev mode | `VSCODE_DEV=1` or dev-mode launch must never trigger update polling. GoatIDE's dev launch recipe uses `VSCODE_DEV=1`; if updater polls in dev mode it will attempt to replace the dev build. | LOW | Gate all updater init behind `!process.env.VSCODE_DEV && !isDev`. Already planned in the v2.0 FEATURES.md C3 entry; verify in Phase 18 smoke. |
| Opt-out of auto-download | Some users on metered connections or corporate networks need to control when update download happens. `autoDownload: false` with explicit "Download update" button in notification covers this. | LOW | `autoInstallOnAppQuit: false` + manual `autoUpdater.downloadUpdate()` on user action. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-apply update without user confirmation | Zero-friction updates are appealing | Violates Mandate D spirit (user controls timing). Silent restart in middle of a save-gate flow could corrupt staging files. | Show restart prompt. `autoInstallOnAppQuit` applies the update gracefully on next natural exit. |
| EV cert purchase solely for instant SmartScreen clearance | Legacy advice says EV cert = no SmartScreen | EV certs no longer bypass SmartScreen as of 2024 (confirmed via official Microsoft docs). Budget $200-600/yr for no SmartScreen benefit. Certificate reputation still accumulates over weeks with OV. | Use OV cert (or Microsoft's Artifact Signing at ~$10/month). Communicate with early users to expect and accept the warning. |
| macOS App Store distribution | Avoids notarization complexity | GoatIDE is a VS Code fork; App Store sandboxing restrictions prohibit spawning a Node sidecar process (kernel) or accessing arbitrary file paths without entitlements. Would require fundamental architecture changes. | Notarize + distribute via GitHub Releases DMG. Gatekeeper prompt is acceptable for developer tools. |
| Signing without cert in CI | "Just try it" | If `signtoolOptions` references a cert that doesn't exist, Windows CI build fails. `electron-builder` will error immediately. | Gate signing behind `WINDOWS_CERT_AVAILABLE=true` env var in CI; unsigned builds for local dev, signed builds only on release tags. |

---

## Category B: DecisionNode Authoring UI

### Context

The v2.0 `goatide.canvas.addDecisionNode` command is a placeholder that fires an informational toast ("coming in v2.1"). The POLISH-03 empty-state CTA and the "Add DecisionNode" button in `CitationList.tsx` already exist and route to this stub. v2.1 must light up the real write path.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Command-palette-driven node creation flow | VS Code users expect authoring actions via command palette. An "Add DecisionNode" command that walks the user through required fields is the platform-native pattern. InputBox multi-step is the table-stakes approach. | MEDIUM | Use `vscode.window.createQuickPick` + `vscode.window.showInputBox` in sequence: (1) anchor selection from currently-open file anchors, (2) rationale text (multi-line via InputBox), (3) optional constraint link picker. |
| Required field: rationale text | Every DecisionNode must have a human-written rationale string. This is the product's core value proposition — Mandate A requires it be human-authored, never LLM-generated. | LOW | `showInputBox({ prompt: 'Why does this decision exist? (required)', validateInput: v => v.length < 10 ? 'Too short' : null })` |
| Required field: anchor selection | A DecisionNode with no file anchor is invisible in the save-gate flow — it cannot surface as a citation. Anchor linking is not optional. | MEDIUM | Populate from the currently-open file's known anchors (from `kernel.queryByAnchor(currentFile)`). If no anchors exist, offer to create a FileAnchorNode first. |
| Immediate write to graph on confirmation | User should not be confused about whether the node is "staged" or "live". Write atomically on final confirmation step (not staged). GoatIDE's append-only model means there is no undo after write — communicate this clearly. | MEDIUM | `kernel.proposeEdit` + `kernel.atomicAccept` RPC pair, same as existing save-gate write path. No new RPC needed — reuse existing write path. |
| Success feedback | After write succeeds, surface: node ID + "DecisionNode created. It will appear as a citation on your next save." in a notification. Open the Verification Canvas if it's not visible so the user sees the effect immediately. | LOW | `vscode.window.showInformationMessage(...)`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Canvas-embedded inline form | Instead of command-palette multi-step, an inline form in the Verification Canvas webview lets users author a node without leaving the receipt context. Particularly valuable when the empty-state CTA is the trigger — the user is already looking at the canvas. | MEDIUM | Canvas webview sends `canvas.requestAddDecisionNode` message (already wired); CanvasPanel routes to a new `showAuthorForm()` handler that injects a form into the webview via `postMessage`. Avoids spinning up a second panel. |
| Anchor auto-population from last save | When the user triggers authoring from the empty-state CTA (meaning they just saved a file), pre-populate the anchor field with the file path of the just-saved document. Reduces friction for the most common authoring trigger. | LOW | `CanvasPanel.lastPayload.anchor_path` is already threaded on every `CanvasShowPayload`. Pass it to the form as a default. |
| Optional constraint links picker | Link the new DecisionNode to existing ConstraintNodes (the existing ones in the graph). This makes the new node immediately traversable in the rationale chain and surfaces in ripple analysis (DEEP-03). | MEDIUM | Multi-select QuickPick from `kernel.queryByKind('ConstraintNode')`. Store as `rationale_for` edges. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Mandate | Alternative |
|---------|---------------|-----------------|---------|-------------|
| LLM-suggested rationale text | Users want AI to fill in "why" | Violates Mandate A. LLM-generated rationale in the receipt path is structurally fenced by `refuse-llm-in-canvas.meta.sh`. A node with an LLM-written rationale is indistinguishable from a human-written one, destroying provenance guarantees. | Mandate A | Provide a rationale template ("This decision exists because...") as placeholder text in InputBox, NOT an AI-generated suggestion. |
| Auto-creating nodes from git commit messages | Seems like a shortcut to populate the graph | Violates Mandate A (if LLM is involved in parsing) and Mandate D (auto-creation bypasses the user verification loop). | Mandate A + D | The telemetry harvester + promoter flow (PORT-04/05) already handles structured observation promotion. Users use that path for batch population, not ad-hoc authoring. |
| Undo / delete DecisionNode after creation | Append-only model users will expect undo | Violates Mandate B (append-only bitemporal). Deleting a node destroys the audit trail that is the product's core value. The bitemporal model supports "supersession" not deletion. | Mandate B | Offer "supersede this node" as the corrective action — which creates a new node marked as replacing the erroneous one, preserving history. |
| Free-form node type selection at authoring time | Users might want to create ConstraintNode or ObservationNode too | Scope creep. ObservationNode creation is the telemetry harvester's domain (not manual authoring). ConstraintNode authoring is a separate capability (contracts file editing is the current path). | N/A (scope) | v2.1 authoring UI is DecisionNode only. ConstraintNode + ObservationNode authoring is a future milestone item. |

### Post-Hoc Rejection (Reject Button from POLISH-04 dispatchHover)

The `dispatchHover` from POLISH-04 shows benign-tier receipts as status-bar messages with "Open full receipt" fallback. v2.1 adds a "Reject / I didn't mean this save" action on the hover receipt, which triggers a post-hoc `recordRejection` RPC.

**Table stakes behavior:**
- User sees the benign-tier status-bar receipt: `[Benign] NodeLabel, NodeLabel2 — Open full receipt | Reject`
- User clicks Reject: a confirmation `vscode.window.showWarningMessage('Retract this receipt?', { modal: true }, 'Yes, retract')` appears to prevent mis-clicks
- On confirm: `kernel.recordRejection(attemptId)` marks the receipt as rejected in the `attempts` table
- Rejection does NOT revert the file change (file is already saved — the kernel tracks the rejection for provenance, not to restore the editor buffer)
- Success feedback: "Receipt retracted. The file change stands; the rationale receipt is marked as rejected."

**Complexity:** SMALL. `kernel.recordRejection` RPC already exists (Phase 4 CANV-10). The hover status-bar message (`dispatchHover`) needs a new action button added to its `vscode.window.showInformationMessage` call. No new webview changes.

**Anti-feature:** Reject button must NOT appear on destructive-tier receipts. Destructive saves require confirmation before they happen (Mandate D); a "retract" action after a destructive save creates a confusing double-negative. Mandate D saves are irrevocable by design.

---

## Category C: Walkthrough Foregrounding Fix

### Context

POLISH-01 shipped the `contributes.walkthroughs` registration and `maybeAutoOpenWalkthrough` fires at activation. The problem: `workbench.action.openWalkthrough` races against VS Code's default "Setup VS Code" walkthrough. On a fresh GoatIDE install, VS Code's built-in welcome page wins the foreground because it initializes before `onStartupFinished` extension activations complete. GoatIDE's walkthrough opens but is hidden behind the default tab.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| GoatIDE walkthrough appears in foreground on first install | The walkthrough was explicitly built to orient users before their first save-gate encounter. If it loses the foreground race, users hit the save-gate cold with no context — the entire POLISH-01 investment is wasted. | SMALL | Root cause: `maybeAutoOpenWalkthrough` fires `executeCommand('workbench.action.openWalkthrough', ...)` at extension activation time, which races VS Code's welcome page initialization. Fix: add a `setTimeout` delay (200–500ms) to let the welcome page render first, then bring GoatIDE walkthrough to front. Evidence: GitHub issue #187958 documents this exact race — "executing the command twice in succession" or a timing delay resolves it. |
| Executing openWalkthrough twice if needed | The VS Code bug (#187958) causes "could not restore to category" errors if the walkthrough command fires before the Getting Started panel initializes. Double-invocation is the documented community workaround. | LOW | Fire `workbench.action.openWalkthrough` once immediately, then again after 300ms. Both invocations are idempotent for the user (they just see the correct panel). |
| First-install vs re-open detection | `maybeAutoOpenWalkthrough` must not re-open the walkthrough on every launch — only when `context.globalState.get('goatide.onboardingComplete') !== true`. This check already exists in POLISH-01; the fix is only to the timing of the `executeCommand`, not the condition. | NONE | Condition already correct in Phase 17 implementation. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `onView:walkthrough` activation event (future) | Using `onView:walkthrough` as an additional activation event (alongside `onStartupFinished`) means the extension can activate sooner when the getting started panel is focused, potentially winning the race more reliably. | LOW | Add `"onView:welcome"` to `activationEvents` in `package.json`. Soft benefit — doesn't guarantee ordering but narrows the timing window. |
| Graceful degradation if foreground still lost | Even if the walkthrough doesn't win the foreground on some VS Code versions, a persistent status-bar notification "GoatIDE tour available — click to start" covers the gap without requiring a perfect foreground win. | LOW | `vscode.window.setStatusBarMessage('$(question) GoatIDE walkthrough available', 10000)` as fallback when `maybeAutoOpenWalkthrough` fires but can't confirm the panel is foregrounded. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Third-party tour library (Shepherd.js, react-joyride) | Richer in-editor overlay tours | Cannot integrate with VS Code's Getting Started panel. Add bundle weight. Produce UX foreign to VS Code users (overlay pointers over editor panes are jarring). | VS Code native `contributes.walkthroughs`. The race fix is simpler than a library integration. |
| Force-closing VS Code's default "Setup VS Code" walkthrough | Seems like the clean solution to the race | VS Code's extension API does not expose a way to close or suppress the built-in Setup walkthrough. Attempting to close another tab programmatically is not supported. | Win the race via timing + double-invocation, not by suppressing the competitor tab. |
| Storing `onboardingComplete` in workspace config | Seems natural (like the session.priority setting) | Causes the walkthrough to re-appear every time the user opens a new workspace, because workspace config is per-workspace. Pitfall 9 (already documented in Phase 17 PITFALLS). | `context.globalState` (already correct in Phase 17 implementation). |

---

## Category D: Cross-Repo Activation — Multi-Daemon Kernel Orchestration

### Context

v2.0 shipped `goatide.openCrossRepoGraph` with graceful degradation and the `edge[?crossRepo]` Cytoscape selector. All v2.0 nodes carry `repo_id='primary'`. The dormant state: no actual cross-repo writes happen because the kernel is a single daemon with a single DB. v2.1 activates the path: spawn one kernel daemon per workspace repo, stitch their outputs at query time.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-repo kernel daemon spawning | For cross-repo edges to be real (not synthetic), each repo's kernel must write to its own DB partition. Single daemon = single DB = only one repo's writes are captured. | LARGE | Bridge must enumerate `vscode.workspace.workspaceFolders` on activation, fingerprint each repo (SHA-256 of `git remote get-url origin`, first 12 hex chars), spawn one kernel sidecar per repo folder. Each sidecar gets its own port, own lockfile, own SQLite db path (e.g. `~/.goatide/<repoId>/graph.db`). |
| Workspace-to-repo binding visible to user | Users need to understand which repo owns which nodes. Without disclosure, cross-repo edges are magical and untrustworthy. | MEDIUM | Inspector node tooltip shows `repo_id` fingerprint (already in `SerializedNodeSnapshot` as of Phase 17). Full remote URL should be shown in a "Repo: github.com/org/repo" label alongside the fingerprint. |
| Cross-repo edges as live (write-triggered), not snapshot-only | In v2.0, cross-repo edges in the inspector are static because no writes happen cross-repo. In v2.1, saving a file in repo-A that cites a ConstraintNode in repo-B should create an actual cross-repo edge in the stitched view. | LARGE | At save-gate time: if `citedNode.repo_id !== currentRepo.repo_id`, write a `cross_repo` edge type connecting `(currentRepo, nodeId)` to `(citedRepo, nodeId)`. Requires kernel RPC for edge insertion with `edge_kind = 'cross_repo_citation'`. |
| Single-folder graceful degradation | Already implemented in Phase 17. Must remain stable after multi-daemon changes. | NONE | `goatide.openCrossRepoGraph` already shows info notification for single-folder workspaces. Multi-daemon spawning should be gated on `workspaceFolders.length >= 2`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Live cross-repo inspector updates | The inspector panel updates in real-time as cross-repo edges are written (subscription or polling to kernel). Not snapshot-on-command but a living view. | MEDIUM | On `update-downloaded` or after each save that produces a cross-repo edge, `graphInspectorPanel.refresh()` can be called to repoll `queryGraphSnapshot`. Cytoscape's `eles.add()` API supports incremental node/edge addition without full re-layout. |
| Repo fingerprint visibility in status bar | When GoatIDE detects a multi-root workspace, a status-bar item shows "GoatIDE: 2 repos connected" with clickable action that opens the cross-repo inspector. | LOW | New `vscode.StatusBarItem` with priority 95 (below existing kernel-liveness items). Shows count of detected repos and their connection status. |
| Repo-binding command for manual override | Users with non-standard git setups (no remote, local remotes, SSH remotes) may not have a resolvable `git remote get-url origin`. Offer `goatide.setRepoBinding` command to manually assign a `repoId` string. | MEDIUM | `showInputBox` accepting a free-form identifier, stored in workspace config as `goatide.repoBinding`. Kernel fingerprint logic checks this override before falling back to git remote. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Composite `(id, repo_id)` primary key on nodes/edges | Seems cleaner than query-layer partitioning | Already rejected (Phase 16 decision ledger): requires DROP+RECREATE on canonical tables, violating Mandate B. | `repo_id` column with query-layer filtering (already shipped in Phase 16 migration `0008_cross_repo_identity.sql`). |
| Network-fetched cross-repo data from external service | Users with distributed teams want centralized graph | Violates local-first architecture constraint. Introduces privacy risk with telemetry portability filter. Requires auth infrastructure GoatIDE doesn't have. | Local-only multi-daemon stitching — all repos in the same VS Code multi-root workspace on the local machine. |
| Auto-inferring cross-repo edges from import statements | Static analysis of `import` paths could guess cross-repo relationships | Violates Mandate D (auto-creation without user verification). Also violates Mandate A (if LLM is used to resolve ambiguous imports). | User-triggered: cross-repo edges are created only when a save in repo-A explicitly cites a node in repo-B's graph. No auto-inference. |
| One shared SQLite DB for all repos | Simpler architecture for v2.1 | Breaks the bitemporal isolation property — `repo_id` partitioning works only if each repo's timeline is independent. A shared DB with concurrent writers (multiple kernel daemons) requires WAL + serialized write access coordination that adds complexity without benefit over per-repo DBs. | Per-repo DB at `~/.goatide/<repoId>/graph.db`. Query-time stitching at the bridge layer (already designed for DEEP-06). |

---

## Category E: E2E Verification (Phase 18)

### Context

v2.0 was verified under dev-mode via CDP smoke (`phase17-smoke-cdp.cjs`, 10/12 SCs PASS). GoatIDE has never been walked on a real built+installed binary. Phase 18 is a verification phase: build GoatIDE as an installable, install it, walk every v2.0 user-visible feature E2E, fix anything broken.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Playwright/CDP smoke on installable binary | The existing Phase 17 CDP smoke (`phase17-smoke-cdp.cjs`) launches via `_electron.launch({ executablePath })`. Pointing it at the installed binary instead of the dev-mode executable is the minimal change. | SMALL | Build the NSIS/DMG installer, install it, get the installed `.exe`/`.app` path, pass as `executablePath` to the existing smoke harness. SCs 1-10 should transfer directly. SC11/SC12 (the two failures) need investigation. |
| Manual UAT checklist for install-specific behavior | Automated CDP smoke cannot verify: Gatekeeper dialog (macOS), SmartScreen dialog (Windows), NSIS installer wizard pages, per-machine vs per-user install, auto-update notification (requires a real second release to trigger). These require human eyes. | SMALL | A structured checklist (not automated) covering: installer launches without OS block, all extensions load, kernel sidecar spawns, save-gate fires on first save, walkthrough appears. |
| SC11/SC12 investigation and fix | Phase 17 CDP smoke left two SCs failing (documented in `17-VERIFICATION.md`). These must be diagnosed and fixed before v2.1 ships — they represent v2.0 feature gaps carried into v2.1. | MEDIUM | Root cause unknown — needs Phase 18 investigation. Likely involves bridge loading from installable path (the registration gap: VS Code loads `extensions/goatide-bridge/` stub, not `src/vs/goatide/extensions/goatide-bridge/`). Fix: resolve bridge registration gap from `PROJECT.md` ("targeted v2.1 fix"). |
| Bridge registration gap fix | `MEMORY.md` "Bridge extension registration gap": VS Code loads empty `extensions/goatide-bridge/` stub directly. Real bridge at `src/vs/goatide/extensions/goatide-bridge/` is reachable only through mirror (`prepare_goatide.sh`). On installable builds, the dev-mode mirror path no longer applies — the packaged extension must be the real bridge. | MEDIUM | Fix: packaging pipeline must build the bridge and copy the compiled output into `extensions/goatide-bridge/` before Electron packaging. The `prepare_goatide.sh` mirror script needs to run as part of the build pipeline, not just manually. |
| Freshclone-smoke (`SC#5`) still passing post-install changes | The `scripts/test/freshclone-smoke-cdp.cjs` smoke is the regression gate for dev-mode launch. Any changes to extension loading or kernel spawn path for installable builds must not break the dev-mode path. | LOW | Run SC#5 on every candidate fix during Phase 18. It is the invariant floor. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Platform-matrix smoke (macOS + Windows) | GoatIDE targets both platforms. A smoke that only passes on the developer's primary OS (macOS) may fail on Windows due to path separator issues, kernel spawn differences, or NSIS install location variations. | MEDIUM | Extend GitHub Actions CI to run the smoke on both macOS and Windows runners using the installed binaries. This is the first cross-platform verification of GoatIDE as an installable. |
| Kernel sidecar path validation on installable | In dev mode, `resolveKernelPath` uses the stat-then-fallback with 5 or 2 `..` parent traversals. In a packaged app, `extensionUri` is inside the Electron `app.asar` or resources directory — the `..` traversal logic may resolve to wrong paths. | MEDIUM | Add a Phase 18 smoke SC asserting `kernel.isConnected()` within 10s of install-mode launch. If this fails, the `resolveKernelPath` fallback logic needs an installable-mode candidate path added. |
| Verify `VSCODE_DEV=1` guard is absent in production build | In dev mode, `VSCODE_DEV=1` is set explicitly. Installable builds must NOT have this env var. If it leaks, dev-mode paths activate (e.g., `workbench-dev.html` instead of `workbench.html`, updater guard bypassed). | LOW | SC: assert `process.env.VSCODE_DEV` is falsy in the extension host of an installable build. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full automated test suite on installable (no manual component) | Automation is good | Installer wizard (NSIS/DMG), Gatekeeper dialog, SmartScreen dialog, and first-launch OOBE cannot be driven via CDP. Attempting to automate these creates fragile platform-specific UI automation that is harder to maintain than a well-structured manual checklist. | Hybrid: automated CDP smoke for feature correctness; structured manual UAT checklist for install-specific and OS-security behaviors. |
| Waiting for full reputation before Phase 18 sign-off | Reputation takes weeks to accumulate | Would block all v2.1 work behind a weeks-long wait. SmartScreen/Gatekeeper behavior at zero-reputation is known and documented — users can proceed past the warning. The warning itself is acceptable for solo dogfood. | Document expected first-download warnings in release notes. Phase 18 verifies the app runs correctly, not that reputation is established. |
| Testing auto-update in Phase 18 smoke | Auto-update is a C3 feature | Auto-update requires publishing two real releases (one to update FROM, one to update TO) and waiting for the update check interval. This cannot be faked in a smoke harness without mocking the update server. | Verify auto-update wiring (updater initialized, `!VSCODE_DEV` guard present, GitHub Releases config correct) via code inspection + unit test. Manual verification of the actual update flow in a separate dogfood session after C3 ships. |

---

## Feature Dependencies

```
Phase 18 (E2E verification on installable)
    └──blocks──> C1 macOS notarization (can't notarize before a real build exists)
    └──blocks──> C2 Windows signing (can't sign before a real installer exists)
    └──blocks──> C3 auto-update (can't test update channel before signed installer exists)
    └──blocks──> bridge registration gap fix (must fix before all other installable features work)

DecisionNode authoring UI (write path)
    └──requires──> Phase 04 (proposeEdit + atomicAccept RPCs — already shipped)
    └──requires──> Phase 17 POLISH-03 (empty-state CTA stub already wired to goatide.canvas.addDecisionNode)
    └──requires──> Phase 14 DEEP-01 (queryRationaleAt — needed to show "linked constraints" picker from live graph)
    └──soft-dependency──> Phase 18 (verify authoring works on installable, not just dev-mode)

Post-hoc Rejection (Reject button in dispatchHover)
    └──requires──> Phase 17 POLISH-04 (dispatchHover already emits status-bar message — add Reject action)
    └──requires──> Phase 04 CANV-10 (recordRejection RPC already exists)
    └──mandated NOT on──> destructive-tier saves (Mandate D fence)

Walkthrough foregrounding fix
    └──requires──> Phase 17 POLISH-01 (walkthroughs registration already shipped — this is a timing fix only)
    └──fixed by──> setTimeout delay + double-invocation in maybeAutoOpenWalkthrough

Cross-repo activation (multi-daemon)
    └──requires──> Phase 16 DEEP-06-A (repo_id schema migration — already shipped)
    └──requires──> Phase 17 DEEP-06-B (cross-repo inspector UI + goatide.openCrossRepoGraph — already shipped)
    └──requires──> Phase 18 (installable build needed before multi-daemon spawning in production)
    └──blocks──> cross-repo live edges (cannot write real cross-repo edges without per-repo daemons)

C3 auto-update
    └──requires──> electron-builder.yml + electron-updater wiring (new in v2.1)
    └──requires──> Phase 18 (signed installable build must exist before update channel is live)
    └──requires──> C1 (macOS auto-update requires notarization — unsigned macOS app cannot be updated via electron-updater)
    └──requires──> C2 (Windows auto-update from a signed source accumulates SmartScreen reputation per signed cert)
```

### Dependency Notes

- **Phase 18 gates everything else:** Phase 18 is not a feature in isolation — it is the prerequisite that produces the signed installable build that C1/C2/C3 sign, notarize, and distribute. No distribution feature can ship without Phase 18's output artifact.
- **Bridge registration gap fix is Phase 18's critical path:** If the installable build still loads the stub `extensions/goatide-bridge/`, all bridge-dependent features (Canvas, Inspector, save-gate) will silently not work on the installable. This is the highest-risk item in Phase 18.
- **DecisionNode authoring requires no new kernel RPCs:** `proposeEdit` + `atomicAccept` already exist from Phase 4. The write path is graph-append only. The authoring UI is the new work, not the kernel surface.
- **Post-hoc rejection does not require a new RPC:** `recordRejection` already exists (Phase 4 CANV-10). Only the `dispatchHover` status-bar message needs a new action button wired.
- **Walkthrough fix is timing-only:** No structural changes to POLISH-01 registration, `registerWalkthroughCompletion`, or `globalState` key. The bug is purely in `maybeAutoOpenWalkthrough` timing.
- **Cross-repo multi-daemon is GoatIDE-novel:** No existing Electron app pattern addresses "spawn multiple sidecars, one per workspace folder, each with its own SQLite DB, stitch at query time." This is the highest architectural complexity item in v2.1 after Phase 18.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Phase 18: E2E verification on installable | HIGH — gates distribution | MEDIUM (smoke + manual UAT + bridge reg gap fix) | P1 | 18 |
| Bridge registration gap fix | HIGH — silent failure without it | MEDIUM | P1 | 18 |
| SC11/SC12 investigation + fix | HIGH — closes v2.0 deferred gaps | MEDIUM | P1 | 18 |
| Walkthrough foregrounding fix | MEDIUM — POLISH-01 investment wasted without it | LOW (timing fix) | P1 | 18 or 19 |
| DecisionNode authoring UI (command palette flow) | HIGH — lights up the POLISH-03 empty-state CTA | MEDIUM | P1 | 19 |
| Post-hoc rejection (Reject button) | MEDIUM — POLISH-04 completion | LOW (reuses recordRejection RPC) | P2 | 19 |
| C1: macOS notarization | HIGH — required for macOS distribution | MEDIUM | P1 | 20 |
| C2: Windows code signing | HIGH — required for credible Windows distribution | MEDIUM | P1 | 20 |
| C3: auto-update via electron-updater | HIGH — users stay current | MEDIUM | P1 | 20 |
| Cross-repo multi-daemon activation | MEDIUM — microservice users; GoatIDE is solo-dogfood | LARGE | P2 | 21 |
| Auto-update channel switching (stable/beta) | LOW for solo dogfood | LOW | P3 | 20+ |
| Platform-matrix smoke (macOS + Windows CI) | HIGH for distribution trust | MEDIUM | P2 | 18 |

**Priority key:**
- P1: Must have — v2.1 is incomplete without it
- P2: Should have — ships if phase estimates hold
- P3: Nice to have — defer if phases run long

---

## Mandate Compliance Summary

| Feature | Mandate A (no-prompt) | Mandate B (append-only) | Mandate D (verification-first) |
|---------|----------------------|------------------------|-------------------------------|
| DecisionNode authoring | AT RISK — rationale text InputBox must never suggest LLM text | SAFE — append-only write via proposeEdit + atomicAccept | SAFE — user-initiated, multi-step confirmation |
| Post-hoc rejection | SAFE | SAFE — recordRejection marks the attempt, does not delete rows | AT RISK — must NOT appear on destructive-tier receipts |
| Cross-repo multi-daemon writes | SAFE | AT RISK — cross-repo edges must go through save-gate write path, not inserted directly | AT RISK — cross-repo edge creation must be user-triggered (no auto-inference) |
| Distribution (C1/C2/C3) | SAFE | SAFE | SAFE — auto-update restart is user-initiated |
| E2E verification | SAFE | SAFE | SAFE |

---

## Sources

- GoatIDE PROJECT.md (v2.1 scope, mandates, architecture constraints — read 2026-05-16)
- GoatIDE ROADMAP.md Phase 17 section (POLISH-01/03/04, DEEP-06-B, what shipped — read 2026-05-16)
- GoatIDE v2.0-archive/FEATURES.md (v2.0 baseline feature research — not repeated here)
- GoatIDE `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` (current wiring, stub commands — read 2026-05-16)
- GoatIDE `src/vs/goatide/extensions/goatide-bridge/package.json` (contributes.commands, walkthroughs, configuration — read 2026-05-16)
- [Apple Gatekeeper and Runtime Protection](https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web) — confirmed: notarized apps get single first-open approval dialog; un-notarized quarantined apps blocked entirely in Sequoia
- [macOS Gatekeeper and Notarization in Sequoia — Eclectic Light Company, 2024](https://eclecticlight.co/2024/08/10/gatekeeper-and-notarization-in-sequoia/) — confirmed: Sequoia refuses launch of un-notarized quarantined apps entirely (no bypass path other than Privacy & Security exemption)
- [How to Publish a Mac Desktop App Outside the App Store — DoltHub Blog, 2024](https://www.dolthub.com/blog/2024-10-22-how-to-publish-a-mac-desktop-app-outside-the-app-store/) — notarization walkthrough + stapling requirement confirmed
- [SmartScreen Reputation for Windows App Developers — Microsoft Learn, updated 2026-05-04](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation) — HIGH confidence source: EV cert no longer bypasses SmartScreen (confirmed March 2024 change); OV and EV both require accumulated downloads; Microsoft Artifact Signing (~$10/month) recommended alternative
- [electron-builder Auto Update](https://www.electron.build/auto-update.html) — confirmed: Squirrel.Windows unsupported; GitHub Releases provider; `update-downloaded` + `quitAndInstall()` UX flow; `releaseNotes` field available
- [VS Code Extension Walkthrough Race — GitHub Issue #187958](https://github.com/microsoft/vscode/issues/187958) — confirmed: `openWalkthrough` before Welcome page initialization fails with "could not restore to category"; double-invocation workaround documented; VS Code team assigned October 2023
- [Open VS Code Extension Walkthrough from Command — Elio Struyf](https://www.eliostruyf.com/open-vscode-extension-walkthrough-command/) — `workbench.action.openWalkthrough` format confirmed; timing issue acknowledged
- [Automated Testing Electron — Electron Official](https://www.electronjs.org/docs/latest/tutorial/automated-testing) — Playwright CDP pattern for installable builds confirmed
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron) — `_electron.launch({ executablePath })` for pointing smoke at installed binary confirmed

---
*Feature research for: GoatIDE v2.1 — distribution + authoring + walkthrough + cross-repo + E2E verification*
*Researched: 2026-05-16*
