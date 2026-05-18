---
phase: 22-distribution
plan: 05
subsystem: infra
tags: [electron-builder, codesign, notarize, electron-updater, mandate-d, azure-trusted-signing, github-releases, wave-close]

# Dependency graph
requires:
  - phase: 21-cross-repo-activation
    provides: Phase 21 closed; XREPO-01..03 GREEN; v2.1 4/5 phases complete
provides:
  - C3 GREEN (electron-updater wiring + Mandate D dialog + IUpdateService no-op stub)
  - C1 infrastructure landed cert-gated (macOS signing hooks + entitlements + @electron/notarize)
  - C2 infrastructure landed cert-gated (azureSignOptions block + operator runbook + sentinel-detector)
  - Phase 22 closure: 22-VERIFICATION.md + 22-SUMMARY.md authored; REQUIREMENTS/ROADMAP/STATE updated
affects:
  - v2.1 milestone (4.5/5 phases: C3 GREEN; C1/C2 cert-gated)
  - v2.2 backlog (kernel shutdown RPC; CI workflow YAML; SmartScreen reputation)

# Tech tracking
tech-stack:
  added:
    - "@electron/notarize@^3.1.1 (macOS notarytool-based notarization)"
    - "electron-updater@^6.8.3 (moved to dependencies for runtime + import-map)"
  patterns:
    - "GoatIdeNoOpUpdateService: permanent no-op IUpdateService fence, State.Disabled(DisabledByEnvironment)"
    - "HARDEN-06 VSCODE_DEV early-return guard as first line of initGoatIdeUpdater()"
    - "Lazy provider pattern: _autoUpdaterProvider.get() + _dialogApi.showMessageBox() for testable main-process-only APIs"
    - "Mandate D: autoInstallOnAppQuit=false + Restart Now/Later dialog; quitAndInstall only on response===0"
    - "CJS electron-builder hooks (.cjs) short-circuit on non-darwin or missing secrets"
    - "azureSignOptions <TBD-...> sentinel placeholders + env-var-gated detector in package-goatide.sh"

key-files:
  created:
    - src/vs/goatide/update/noOpUpdateService.ts
    - src/vs/goatide/update/goatideUpdater.ts
    - src/vs/goatide/update/test/noOpUpdateService.test.ts
    - src/vs/goatide/update/test/goatideUpdater.test.ts
    - build/signing/entitlements.mac.plist
    - build/signing/entitlements.mac.inherit.plist
    - build/signing/beforeSign.cjs
    - build/signing/afterSign.cjs
    - build/signing/afterAllArtifactBuild.cjs
    - .planning/phases/22-distribution/22-03-AZURE-SETUP.md
    - .planning/phases/22-distribution/22-VERIFICATION.md
    - .planning/phases/22-distribution/22-SUMMARY.md
  modified:
    - .gitignore
    - src/vs/code/electron-main/app.ts
    - eslint.config.js
    - electron-builder.yml
    - package.json
    - package-lock.json
    - scripts/package-goatide.sh

key-decisions:
  - "C3 GREEN regardless of cert status: electron-updater talks to GitHub Releases (not code.visualstudio.com); 5 unit tests prove all branches; no cert dependency"
  - "IUpdateService no-op stub replaces all 4 platform-specific bindings at app.ts:1073-1089 (Pitfall H mitigation)"
  - "Lazy provider pattern for electron-updater: _autoUpdaterProvider.get() / _dialogApi.showMessageBox() to avoid TypeError from electron.app.getVersion() at module load in renderer test context"
  - "autoInstallOnAppQuit=false: stricter than electron-updater Pattern 4 default; deliberate Mandate D enforcement -- user MUST click Restart Now"
  - "C1 infrastructure cert-absent: Windows host cannot run macOS dry-run; deferred to CI when Apple Developer ID secrets land"
  - "C2 infrastructure cert-absent: Azure Trusted Signing account not yet provisioned; <TBD-...> placeholders in electron-builder.yml"
  - "5-plan wave partition: Wave 0 fences before any feature code; Wave 1 C1+C2 in parallel (cert-gated); Wave 2 C3; Wave 3 closure"

# Metrics
duration: Phase 22 total ~170min across 5 plans
completed: 2026-05-18
---

# Phase 22: Distribution (C1/C2/C3) Summary

**C3 (electron-updater wiring + Mandate D dialog) GREEN; C1 (macOS notarization) + C2 (Windows Azure Trusted Signing) infrastructure landed cert-gated -- 5 plans, 4 waves; Phase 18 SC13 regression gate held; v2.1 milestone 4.5/5 phases**

## Performance

- **Duration:** ~170 min total (Plans 22-01 through 22-05)
- **Closed:** 2026-05-18
- **Plans:** 5/5
- **Files created:** 12 (7 src/ + 5 planning artifacts)
- **Files modified:** 7
- **Unit tests added:** 5 (3 Wave-0 + 2 Wave-2)

---

## Goal

Users can download a signed, notarized GoatIDE installer from GitHub Releases, install it without
security warnings, and receive in-app notifications when a newer release is available.

---

## Requirements Status

| Requirement | Status | Closure Commits | Notes |
|-------------|--------|-----------------|-------|
| C1 -- macOS notarization | CERT-GATED | `3cf21910b6c`, `1cf17c5b258`, `3600527e95e`, `6bd6b7d0e98`, `0763ed9fe6c` | Infrastructure complete; Apple Developer ID secrets not yet in CI; live signed-build UAT deferred |
| C2 -- Windows Azure Trusted Signing | CERT-GATED | `8f095bd2991`, `67d9ef7ffc2`, `f915f395c69` | Infrastructure complete; Azure account not yet provisioned; `<TBD-...>` placeholders pending |
| C3 -- electron-updater + Mandate D | GREEN (2026-05-18) | `b2437d3`, `89aa451`, `8d89b46`, `74ab538` | 5/5 unit tests PASS; 0 code.visualstudio.com requests; IUpdateService stubbed |

---

## Wave Structure

| Wave | Plan | Contents | Status |
|------|------|----------|--------|
| Wave 0 | 22-01 | IUpdateService no-op stub; VSCODE_DEV guard stub; dev-app-update.yml gitignore; eslint rules for goatide/** | CLOSED `b2437d3` |
| Wave 1 | 22-02 | C1 macOS: electron-builder.yml mac: block + beforeSign/afterSign/afterAllArtifactBuild hooks + entitlements plists + @electron/notarize | CERT-GATED (5 commits) |
| Wave 1 | 22-03 | C2 Windows: electron-builder.yml win: azureSignOptions block + 22-03-AZURE-SETUP.md runbook + sentinel-detector in package-goatide.sh | CERT-GATED (3 commits) |
| Wave 2 | 22-04 | C3: electron-updater wiring + Mandate D Restart Now/Later dialog + autoInstallOnAppQuit=false + 2 new unit tests + app.ts call site + publish config | CLOSED (4 commits) |
| Wave 3 | 22-05 | Phase verify battery + 22-VERIFICATION.md + 22-SUMMARY.md + REQUIREMENTS/ROADMAP/STATE closure flips | CLOSED (this plan) |

---

## What Shipped (C1 -- macOS Signing Infrastructure)

- `electron-builder.yml` `mac:` block extended: `entitlements`, `entitlementsInherit`, `notarize: false`,
  `gatekeeperAssess: false` (preserving Phase 18 `hardenedRuntime: true` + `target: [dmg, zip]`)
- `build/signing/entitlements.mac.plist` -- 4 hardened-runtime entitlements:
  - `com.apple.security.cs.allow-jit`
  - `com.apple.security.cs.allow-unsigned-executable-memory`
  - `com.apple.security.cs.allow-dyld-environment-variables`
  - `com.apple.security.cs.disable-library-validation` (MANDATORY -- without it macOS rejects
    `better_sqlite3.node` signed by Phase 13 postinstall identity; Pitfall 3 mitigation)
- `build/signing/entitlements.mac.inherit.plist` -- identical; child process / kernel daemon inheritance
- `build/signing/beforeSign.cjs` -- re-signs all `.node` files with `--options runtime` + inherit entitlements
  before main `.app` codesign (Pitfall 2: avoid Phase 13 postinstall identity mismatch)
- `build/signing/afterSign.cjs` -- calls `@electron/notarize notarize()` (notarytool; altool removed by Apple
  Nov 2023; versions <3.0 broken) with APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
- `build/signing/afterAllArtifactBuild.cjs` -- runs `xcrun stapler staple` on every `.dmg` artifact
  (Pitfall 1: offline Gatekeeper needs ticket embedded in DMG, not just .app)
- `@electron/notarize@^3.1.1` in `package.json` devDependencies
- All hooks short-circuit cleanly on non-darwin or missing Apple secrets (cert-absent builds produce
  unsigned `.app` without crashing)
- `notarize: false` in electron-builder.yml prevents the built-in notarizer from running in parallel
  with our afterSign.cjs hook (prevents double-notarize Pitfall H sibling)

**Required CI env vars (Apple Developer account):**
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD`

---

## What Shipped (C2 -- Windows Azure Trusted Signing Infrastructure)

- `electron-builder.yml` `win:` block extended with `azureSignOptions:` (7 fields: 4 `<TBD-...>` sentinel
  placeholders + 3 defaulted: `fileDigest: sha256`, `timestampDigest: sha256`,
  `timestampRfc3161: http://timestamp.acs.microsoft.com`)
- `.planning/phases/22-distribution/22-03-AZURE-SETUP.md` -- 138-line operator runbook: 8 steps
  (Trusted Signing Account provisioning, Certificate Profile creation + identity validation, Service
  Principal, IAM role, YAML placeholder replacement, CI secret configuration, NuGet pre-step, first
  signed build verification), SmartScreen reputation caveat, troubleshooting table, status checklist
- `scripts/package-goatide.sh` -- sentinel-detector pre-build assertion: exits 1 with clear error if
  AZURE_* env vars are set AND `<TBD-AZURE-...>` placeholders remain (prevents accidental unsigned
  CI artifacts); cert-absent dogfood builds unaffected
- No `.github/workflows/*.yml` modifications (dogfood-via-local-build; NuGet pre-step captured in
  runbook for future Windows-runner workflow authoring)

**Required CI env vars (Azure Trusted Signing account):**
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`

**Required YAML placeholder replacements (per 22-03-AZURE-SETUP.md Steps 5-8):**
`<TBD-AZURE-CN>`, `<TBD-AZURE-REGION-ENDPOINT>`, `<TBD-PROFILE-NAME>`, `<TBD-ACCOUNT-NAME>`

---

## What Shipped (C3 -- electron-updater Wiring + Mandate D Dialog)

**Wave 0 (Plan 22-01):**
- `src/vs/goatide/update/noOpUpdateService.ts` -- GoatIdeNoOpUpdateService implements full IUpdateService
  (7 async no-op methods + `State.Disabled(DisabledByEnvironment)`; prevents dual-updater crashes)
- `src/vs/code/electron-main/app.ts` -- switch(process.platform) block (4 platform update services)
  replaced with single `services.set(IUpdateService, new SyncDescriptor(GoatIdeNoOpUpdateService))`
  (Win32UpdateService, LinuxUpdateService, SnapUpdateService, DarwinUpdateService imports removed)
- `src/vs/goatide/update/goatideUpdater.ts` -- Wave-0 stub with VSCODE_DEV guard as first statement
- `.gitignore` -- `dev-app-update.yml` line added (Pitfall 5: electron-updater generates this locally)
- 3/3 Wave-0 unit tests GREEN

**Wave 2 (Plan 22-04):**
- `goatideUpdater.ts` fleshed out with full electron-updater wiring:
  - Lazy `_autoUpdaterProvider.get()` and `_dialogApi.showMessageBox()` (testable seams; avoids
    `TypeError: Cannot read properties of undefined` from `electron.app.getVersion()` at module load)
  - `autoUpdater.autoInstallOnAppQuit = false` (Mandate D: NEVER auto-restart on next quit)
  - `update-downloaded` event handler: `dialog.showMessageBox` with Restart Now / Later buttons
  - Response 0 ("Restart Now"): `autoUpdater.quitAndInstall(false, true)`
  - Response 1+ ("Later"): returns without action (update NOT applied silently)
- `app.ts` -- `initGoatIdeUpdater()` call at end of `CodeApplication.startup()` (final statement
  after eventuallyPhaseScheduler)
- `electron-builder.yml` `publish:` section: `provider: github`, `owner: rahulp7801`,
  `repo: goatide`, `releaseType: draft`
- `electron-updater@^6.8.3` in `package.json` dependencies (moved from devDependencies; runtime
  requirement; import-map in renderer.html reads from dependencies only)
- 2 new Wave-2 unit tests GREEN: restart and later branches
- 5/5 total GoatIde unit tests GREEN

---

## Pitfalls Mitigated

| Pitfall | Description | Mitigation |
|---------|-------------|-----------|
| 1 -- Offline Gatekeeper | DMG Gatekeeper check fails without notarization ticket in DMG (ticket only in .app by default) | `afterAllArtifactBuild.cjs` runs `xcrun stapler staple` on every .dmg artifact |
| 2 -- .node Identity Mismatch | `.node` files signed by Phase 13 postinstall identity cause macOS to reject .app signing | `beforeSign.cjs` re-signs all `.node` files with `--options runtime` + inherit entitlements BEFORE main .app codesign |
| 3 -- Library Validation | macOS refuses to load `better_sqlite3.node` if `disable-library-validation` entitlement absent | `com.apple.security.cs.disable-library-validation` in both entitlements plists (mandatory) |
| 4 -- NuGet Provider | `Invoke-TrustedSigning` PowerShell module requires NuGet package provider pre-step on CI Windows runners | Captured in 22-03-AZURE-SETUP.md Step 6 for future CI workflow YAML authoring |
| 5 -- dev-app-update.yml Leak | electron-updater generates `dev-app-update.yml` locally with update URL configuration | Added to `.gitignore` in Wave-0 before any electron-updater code was written |
| 6 -- VSCODE_DEV Guard | electron-updater must never fire in VS Code dev-mode (VSCODE_DEV set) | `if (process.env.VSCODE_DEV) return;` is the FIRST statement of `initGoatIdeUpdater()` |
| 7 -- mac zip Target | Phase 18 zip target in electron-builder.yml must be preserved for `latest-mac.yml` update metadata | Phase 22 mac: block modifications preserved `target: [dmg, zip]` from Phase 18 baseline |
| H -- Dual-Updater Crash | VS Code's IUpdateService polls code.visualstudio.com; electron-updater polls GitHub Releases; both running simultaneously causes race + crash | GoatIdeNoOpUpdateService replaces the entire switch(process.platform) block; SC13 confirms 0 code.visualstudio.com requests; electron-updater is the ONLY active updater |

---

## Mandates Preserved

| Mandate | Status | Evidence |
|---------|--------|---------|
| Mandate A (no LLM-generated text) | GREEN | Restart Now/Later dialog uses static string literals in `goatideUpdater.ts`; no AI-generated text in update notification path; `refuse-llm-in-canvas.meta.sh` META PASS |
| Mandate B (no write-RPC in inspector) | GREEN | Phase 22 update/ subtree has zero write-RPC surface; `refuse-deep05-write.sh` EXIT 0; BANNED array at 5 entries (createDecisionNode added in Phase 20; unchanged in Phase 22) |
| Mandate D (no auto-restart without user click) | ACTIVELY ENFORCED | `autoInstallOnAppQuit: false` prevents silent restart on next quit; `Later` branch returns without `quitAndInstall`; update ONLY applies on explicit "Restart Now" (response===0); unit test `update-downloaded later does NOT trigger quitAndInstall` locks this |

**Mandate D note:** This is STRICTER than the electron-updater Pattern 4 default (which silently
installs on next quit). The deliberate choice ensures the user is always in control of when GoatIDE
restarts. Revisit in v2.2 if user feedback indicates looser semantics are preferred.

---

## Cert-Availability Status

- **C1 (macOS):** cert-absent at closure time (2026-05-18). Windows host; cannot run macOS dry-run
  in-session. Apple Developer ID secrets (5 env vars) not yet available on CI macOS runner.
  Infrastructure is complete and repo-absorbed. Resume: Plan 22-02 Task 6 instructions apply.
- **C2 (Windows):** cert-absent at closure time (2026-05-18). Azure Trusted Signing account not yet
  provisioned. 4 YAML placeholders remain. Infrastructure is complete and repo-absorbed.
  Resume: follow 22-03-AZURE-SETUP.md Steps 1-8.
- **C3:** cert-independent -- electron-updater uses GitHub Releases. GREEN.

---

## Known Limitations

1. **Kernel daemon shutdown coordination:** On Windows, the kernel sidecar daemon holds an open file
   handle to `kernel/dist/main.js`. If NSIS attempts to overwrite files during `quitAndInstall`
   while the daemon is still running, the install may fail and require a retry. Electron's `will-quit`
   event reaps spawned child processes in most cases. An explicit kernel-shutdown RPC (electron-main
   signals the extension host which signals the kernel sidecar to flush + exit) is deferred to v2.2.

2. **Inner-exe Windows signing scope (MEDIUM confidence):** 22-RESEARCH.md Open Question #1 notes
   uncertainty about whether `azureSignOptions` signs only the outer NSIS installer or also the inner
   Electron `GoatIDE.exe`. Operator's first signed build will verify -- if inner exe is unsigned,
   the operator must add an explicit `signingHashAlgorithms` or `extraFiles` step to force signing
   of the inner executable.

3. **SmartScreen reputation:** No instant bypass post-March 2024. SmartScreen reputation accumulates
   over time as more users download and run the signed binary without incident. Early distributes
   may still see the "Unknown app" warning even after Azure Trusted Signing is in place. This is
   expected and resolves organically.

4. **Later button semantics:** `autoInstallOnAppQuit: false` means the `Later` button does NOT
   silently apply the update on the next quit (stricter than electron-updater's default Pattern 4
   behavior). Users who click Later must wait for the next `update-downloaded` event (next launch
   after a new release is published). This is deliberate -- revisit in v2.2 if user feedback
   indicates the looser semantics are preferred.

---

## Deferred to v2.2

- **Kernel shutdown RPC:** Explicit RPC for clean kernel-daemon flush + exit before update install
  (`quitAndInstall` triggers `will-quit` which reaps child processes, but a graceful shutdown
  sequence is safer on Windows with open file handles)
- **CI workflow YAML authoring:** `.github/workflows/*.yml` for automated build + publish pipeline
  (macOS runner + Windows runner + NSIS + DMG + draft release upload). No workflow file exists in
  the repo yet; dogfood-via-local-build for now.
- **SmartScreen reputation timeline:** No explicit mitigation beyond time + installs. Monitor after
  first signed build ships.
- **Restart-Later next-quit-applies semantics:** If user feedback indicates the current strict
  behavior (Later = do nothing until next update-downloaded) is surprising, add a `will-quit` handler
  that calls `quitAndInstall` if an update is pending AND the user previously clicked Later.
- **UAT automation for auto-update flow:** Currently manual (old version -> publish release -> observe
  dialog -> click Restart Now -> verify upgraded). Automatable with Playwright-Electron + a local
  `--update-url` fixture server pointing at a fake release feed.
- **Inner-exe signing verification:** Confirm `azureSignOptions` signs inner `GoatIDE.exe` on first
  signed Windows build.

---

## Manual Verifications Outstanding

| Verification | Status | Instructions |
|-------------|--------|-------------|
| C1 macOS signed build UAT | AUTO-DOCUMENTED-PENDING | Procure Apple Developer account; configure 5 CI env vars; run macOS build; verify `xcrun stapler validate` + `codesign --verify --deep --strict` + Gatekeeper PASS |
| C2 Windows signed build UAT | AUTO-DOCUMENTED-PENDING | Follow 22-03-AZURE-SETUP.md Steps 1-8; replace `<TBD-...>` placeholders; configure 3 CI env vars; run Windows build; verify `signtool verify /pa` PASS |
| C3 live end-user update UAT | DEFERRED | Install old GoatIDE; publish new GitHub Release (electron-builder draft promotion); launch old version; observe Restart Now/Later dialog; click Restart Now; verify upgraded to new version |

---

## Next Phase / Next Milestone

**v2.1 milestone status:** Partially closed (4.5/5 phases). C3 GREEN; C1+C2 cert-gated.

- C1/C2 cert-procurement remains -- revisit when Apple Developer + Azure Trusted Signing accounts
  are provisioned. Follow the resume instructions in 22-VERIFICATION.md Cert-Availability Status
  table. When both certs land: flip C1/C2 in REQUIREMENTS.md from `[ ]` to `[x]`, update ROADMAP.md
  Phase 22 entry from `[~]` to `[x]`, update STATE.md decisions ledger, close v2.1 as 5/5.
- **v2.2 backlog** (see ROADMAP): kernel shutdown RPC; CI workflow YAML; SmartScreen timeline;
  Restart-Later semantics; inner-exe signing verification; UAT automation.

---

## Commit Trail

| Plan | Commit | Message |
|------|--------|---------|
| 22-01 | `b2437d3` | test(22-01): C3 wave-0 IUpdateService stub + VSCODE_DEV guard + dev-app-update.yml gitignore |
| 22-02 | `3cf21910b6c` | feat(22-02): extend electron-builder.yml mac: signing config |
| 22-02 | `1cf17c5b258` | feat(22-02): add hardened-runtime entitlements plists |
| 22-02 | `3600527e95e` | feat(22-02): add beforeSign.cjs hook for .node re-sign |
| 22-02 | `6bd6b7d0e98` | feat(22-02): add afterSign.cjs hook + @electron/notarize |
| 22-02 | `0763ed9fe6c` | feat(22-02): add afterAllArtifactBuild.cjs hook for DMG stapling |
| 22-02 | `b23e707380e` | docs(22-02): finalize plan 22-02 -- C1 cert-gated closure |
| 22-03 | `8f095bd2991` | feat(22-03): extend electron-builder.yml win: with azureSignOptions |
| 22-03 | `67d9ef7ffc2` | feat(22-03): author 22-03-AZURE-SETUP.md Azure Trusted Signing runbook |
| 22-03 | `f915f395c69` | feat(22-03): add Azure sentinel-detector in package-goatide.sh |
| 22-03 | `f6e5c5d1f51` | docs(22-03): complete Windows Azure Trusted Signing plan -- 22-03-SUMMARY.md + STATE.md |
| 22-04 | `476a9b4` | chore(22-04): install electron-updater@^6.8.3 |
| 22-04 | `89aa451` | feat(22-04): goatideUpdater.ts wiring + Mandate D dialog + 2 unit tests |
| 22-04 | `8d89b46` | feat(22-04): add initGoatIdeUpdater() call site in CodeApplication.startup() |
| 22-04 | `74ab538` | chore(22-04): add GitHub Releases publish config to electron-builder.yml |
| 22-04 | `6ad9afc9cae` | docs(22-04): complete electron-updater wiring plan -- 22-04-SUMMARY.md + STATE.md |
| 22-05 | (this closure) | chore(22-05): close Phase 22 -- C3 GREEN; C1/C2 cert-gated; v2.1 4.5/5 phases |

---

*Phase: 22-distribution*
*Closed: 2026-05-18*
