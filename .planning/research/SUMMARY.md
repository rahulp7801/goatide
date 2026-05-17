# Project Research Summary

**Project:** GoatIDE v2.1 — Verify + Ship
**Domain:** VS Code fork, bitemporal graph IDE — installable distribution, DecisionNode authoring, cross-repo activation, walkthrough foregrounding
**Researched:** 2026-05-16
**Confidence:** HIGH (stack + pitfalls verified against source code + official docs); MEDIUM (walkthrough exact timing, Windows SmartScreen behaviour)

---

## Executive Summary

GoatIDE v2.1 layers five distinct capabilities onto a fully-shipped v2.0 substrate: (1) E2E verification of v2.0 features on a real installed binary (Phase 18 — gates everything else), (2) macOS notarization + Windows code-signing + cross-platform auto-update via `electron-updater` (C1/C2/C3), (3) lighting up the `goatide.canvas.addDecisionNode` write path that Phase 17 stubbed, (4) activating real cross-repo writes via multi-daemon kernel orchestration, and (5) fixing the walkthrough foregrounding race so the GoatIDE onboarding tour actually wins first-launch. The user explicitly chose verify-then-ship sequencing: Phase 18 gates all subsequent net-new work, because v2.0 has only ever been validated under dev-mode CDP smoke — never on a real installable build.

The recommended technical approach uses `electron-builder@^26.8.2` as a post-gulp step (never conflicting with the existing gulp pipeline), `electron-updater@^6.8.3` in Electron main-process only, `@electron/notarize@^3.1.1` for macOS, and Azure Trusted Signing for Windows CI (physical EV USB tokens are incompatible with GitHub Actions since June 2023). No new npm packages are needed for authoring, cross-repo activation, or walkthrough fix — all extend existing primitives. The single-DB multi-repo model (one kernel sidecar, `repo_id` passed on every write RPC) is chosen over per-repo multi-daemon for v2.1 scope; per-repo daemons are explicitly deferred to v2.2 to avoid WAL collision complexity at this milestone.

The dominant risks are: (a) the CDP smoke harness may be unable to attach to a signed installable binary if Electron fuses block `--remote-debugging-port` — requiring a test-flavoured build with the fuse enabled for CI; (b) the bridge registration gap (VS Code loads the empty stub `extensions/goatide-bridge/`, not the real mirror) will silently kill all bridge-dependent features on the installed build until `prepare_goatide.sh` is made a mandatory pre-packaging step; (c) VS Code's built-in `IUpdateService` must be stubbed out before `electron-updater` is wired or duplicate update notifications and version-mismatch crashes will occur; and (d) every new authoring write RPC name must be added to `refuse-deep05-write.sh`'s BANNED array before any inspector code is written, or Mandate B is silently violated.

---

## Key Findings

### Recommended Stack

No new packages are needed for authoring, walkthrough fix, or cross-repo activation — all extend existing bridge + kernel primitives. Three new root packages cover distribution: `electron-builder@^26.8.2` (dev dep, post-gulp packager with `--prepackaged` mode that avoids the gulp conflict), `electron-updater@^6.8.3` (runtime dep, main-process only, gated behind `!VSCODE_DEV`), and `@electron/notarize@^3.1.1` (dev dep, macOS only, v3.x is notarytool-only — altool was sunset November 2023). The `electron-builder.yml` file must live at repo root — never a `build` key in `package.json` (the VS Code build system reads that key and it conflicts). The kernel sidecar must be excluded from ASAR via `asarUnpack: ["kernel/**"]` so electron-builder does not attempt to re-rebuild `better-sqlite3` for the wrong ABI.

**Core new technologies:**
- `electron-builder@^26.8.2` — NSIS (Windows) + DMG+ZIP (macOS) packaging — operates on pre-compiled `out/` tree via `--prepackaged`, zero conflict with gulp
- `electron-updater@^6.8.3` — GitHub Releases as update channel; VSCODE_DEV guard mandatory; lives in `src/vs/goatide/update/goatideUpdater.ts` only
- `@electron/notarize@^3.1.1` — `afterSign` hook; notarytool-only; requires Node 22 (already satisfied by kernel)
- Azure Trusted Signing (no npm package) — CI-compatible HSM signing for Windows; physical EV token impossible on GitHub Actions runners since June 2023

### Expected Features

**Must have (table stakes):**
- Phase 18: All 12 Phase 17 CDP smoke SCs passing (SC11/SC12 currently SOFT-FAIL; SC3b walkthrough currently SOFT-FAIL)
- Phase 18: Bridge registration gap fixed so installed build loads real bridge not stub
- DecisionNode authoring: canvas-embedded form with empty `defaultValue` textarea, submit to kernel `graph.createDecisionNode` RPC
- Post-hoc rejection: Reject button in canvas (not in transient status-bar message) wired to existing `recordRejection` RPC with double-rejection guard
- Walkthrough foregrounding: GoatIDE walkthrough wins first-launch race via `workbench.startupEditor: none` in `product.json configurationDefaults`
- C1: macOS notarization including re-signing `better_sqlite3.node` with hardened runtime (`beforeSign` hook)
- C2: Windows code-signing via Azure Trusted Signing (plan for 2–4 week SmartScreen reputation window)
- C3: `electron-updater` on GitHub Releases; VS Code `IUpdateService` stubbed to prevent duplicate update logic

**Should have (competitive):**
- `package-goatide.sh` script enforcing `prepare_goatide.sh` then gulp compile then `electron-builder` order
- Per-launch update check throttled to once/24h via `context.globalState` timestamp cache
- `GOATIDE-FORK` comment convention on all modifications to `src/vs/code/` files (upstream-sync hygiene)
- `WorkspaceRepoState` module caching `repo_id` at activate time, updated on `onDidChangeWorkspaceFolders`
- `disposedChangeIds: Set<string>` guard preventing double `recordRejection` call per `change_id`

**Defer (v2.2+):**
- Per-repo daemon model (multi-daemon with separate SQLite DBs) — WAL isolation is right long-term but adds orchestration complexity beyond v2.1 scope
- Auto-update channel switching (stable/beta `latest-beta.yml`) — not needed for solo dogfood
- Platform-matrix CI smoke (macOS + Windows runners in same pipeline) — valuable but not blocking v2.1 ship
- ConstraintNode / ObservationNode manual authoring — v2.1 authoring is DecisionNode-only

### Architecture Approach

v2.1 integrates into three existing runtime tiers without restructuring them. The electron-builder packaging step slots after the gulp compile as a distinct CLI invocation (`npx electron-builder --prepackaged .build/VSCode-<platform>/`). The `electron-updater` initialization lives exclusively in a new `src/vs/goatide/update/goatideUpdater.ts` called from `main.ts` `app.whenReady()`. The DecisionNode authoring write path flows webview to `panel.ts` to `KernelClient.createDecisionNode()` — the webview never calls the kernel directly. Cross-repo writes extend `ProposeEditParams` with an optional `repo_id` field; `WorkspaceRepoState` caches the active folder's fingerprint at activate time. The walkthrough fix targets `product.json configurationDefaults` to neutralize `StartupPageRunnerContribution` competition without touching `src/vs/workbench/`.

**Major new/modified components:**
1. `electron-builder.yml` + `scripts/package-goatide.sh` — distribution packaging layer (repo root)
2. `src/vs/goatide/update/goatideUpdater.ts` — auto-update, main-process only, VSCODE_DEV-gated
3. `kernel/src/rpc/methods.ts` + handler in `server.ts` — `graph.createDecisionNode` RPC + optional `repo_id` on existing write RPCs
4. `goatide-bridge/src/canvas/webview/DecisionNodeForm.tsx` + `AttemptActions.tsx` — authoring form + reject button
5. `goatide-bridge/src/kernel/workspace-repo-state.ts` — `repo_id` caching for save-gate write path
6. `scripts/test/phase18-smoke-cdp.cjs` — extended CDP harness closing SC11/SC12/SC3b

### Critical Pitfalls

1. **CDP harness silent failure on signed installable (Pitfall A)** — Electron fuses on a packaged binary may block `--remote-debugging-port`; `playwright._electron.launch()` times out with no useful error. Avoid: build a test-flavoured package with `EnableNodeCliInspectArguments` fuse ON for CI smoke; keep the GA artifact fuse OFF for security.
2. **Bridge registration gap kills all bridge features on installed build** — `extensions/goatide-bridge/` is the stub VS Code loads; real bridge only reaches it via `prepare_goatide.sh` mirror. If the mirror is stale at packaging time, the installed GoatIDE has no working Canvas, Inspector, or save-gate. Avoid: make `prepare_goatide.sh` a mandatory first step in `package-goatide.sh`; run `refuse-stale-bridge-mirror.sh` as a pre-package gate.
3. **VS Code `IUpdateService` + `electron-updater` dual-updater crash (Pitfall H)** — VS Code's built-in updater polls `code.visualstudio.com` on every launch; if not stubbed, it races `electron-updater` and causes version-mismatch crashes after NSIS installs. Avoid: stub `IUpdateService` with a no-op BEFORE wiring `electron-updater`; add a network-intercept assertion in Phase 18 smoke verifying zero requests to `code.visualstudio.com`.
4. **Mandate B regression: new write RPC not added to `refuse-deep05-write.sh` BANNED array (Pitfall C)** — `createDecisionNode` is a write RPC; if the CI gate's BANNED list is not updated before any inspector code lands, an "edit node" button in the inspector could silently write back through `ReadonlyKernelClient`. Avoid: extend `refuse-deep05-write.sh` BANNED array in Authoring UI Wave 0, before any JSX is written.
5. **macOS `better_sqlite3.node` notarization rejection (Pitfall F)** — Apple notarization rejects if any embedded binary lacks the hardened runtime flag. `electron-builder`'s default signing pass does not recursively re-sign `.node` files. Avoid: add a `beforeSign` hook that runs `codesign -o runtime` on all `.node` files before the app bundle is signed; test with `spctl --assess` locally before any CI submission.

---

## Conflict Resolutions

The four research agents disagreed on three significant questions. This section documents what was chosen and why.

### 1. Multi-Daemon Strategy

ARCHITECTURE recommends single-DB multi-repo (extend write RPCs with optional `repo_id`, one kernel daemon), deferring per-repo daemons to v2.2. STACK recommends per-repo lockfiles + `KernelClient` map (one daemon per workspace folder), justified by WAL contention under concurrent saves. PITFALLS acknowledges both approaches as valid, with DB-per-repo as the safer long-term answer.

**Chosen: ARCHITECTURE's single-DB multi-repo model for v2.1.** The WAL contention risk STACK flags is real but only materialises under simultaneous writes from two folders — a rare case for solo dogfood. Adding per-repo daemon orchestration (`Map<repoId, KernelClient>`, per-repo lockfiles, per-repo DB paths, per-daemon `PendingAttemptsQueue`, per-daemon `KernelDegradedBanner`) before validating the simpler model on a real install is premature complexity. The single-DB model ships concrete cross-repo writes; per-repo daemons are slated for v2.2 if WAL contention is observed in practice.

**Guard added:** Kernel startup assertion that fails fast with a clear error if a second daemon attempts to open the same `graph.db` in readwrite mode — preventing the WAL corruption scenario even in the single-DB model.

### 2. Phase Ordering After Phase 18

ARCHITECTURE recommends 18 to 19 (walkthrough) to 20 (authoring) to 21 (cross-repo) to 22 (distribution). FEATURES recommends 18 to 19 (authoring + walkthrough combined) to 20 (distribution) to 21 (cross-repo). STACK recommends 18 to C3 (auto-update) to authoring (parallel) to cross-repo to C1+C2 (parallel) to walkthrough last.

**Chosen: ARCHITECTURE's ordering (18 to 19 to 20 to 21 to 22).** The STACK ordering puts distribution infra (C3) early before certs are procured, blocking progress on a cert-gated step. FEATURES combines walkthrough + authoring in Phase 19, but both touch `extension.ts` and `tier-dispatch.ts` simultaneously — sequential landing avoids merge conflicts in high-traffic files. ARCHITECTURE's separation is conservative and justified by the shared-file conflict risk. See Recommended Phase Ordering section for per-phase rationale.

### 3. Phase 18 CDP Harness Viability on Signed Binary

FEATURES and ARCHITECTURE both assume the Phase 18 harness extends `phase17-smoke-cdp.cjs` against the real installed binary via `playwright._electron.launch({ executablePath: installedBinaryPath })`. PITFALLS explicitly flags that this will fail silently if the Electron `EnableNodeCliInspectArguments` fuse is disabled in the packaged binary. The failure mode is a timeout — not a fuse-related error message — making it extremely hard to diagnose.

**Chosen: Split harness strategy (PITFALLS recommendation).** Phase 18 uses two distinct build targets: (a) a test package produced by `electron-builder.test.yml` with the `EnableNodeCliInspectArguments` fuse ON, used for automated CDP smoke SCs; (b) the GA package produced by the standard `electron-builder.yml` with the fuse OFF, used for manual UAT (Gatekeeper dialog, SmartScreen dialog, NSIS wizard). Phase 18 planners must document this split in Wave 0 before writing a single test.

---

## Recommended Phase Ordering

### Phase 18: E2E Verification Gate

**Rationale:** v2.0 has only ever been validated via dev-mode CDP smoke (10/12 SCs passing; SC11/SC12 SOFT-FAIL; SC3b SOFT-FAIL). GoatIDE has never been walked on a real installed binary. Phase 18 closes this gap before any net-new code lands. Also resolves the bridge registration gap (the single highest-risk item for all subsequent installable-mode work) and closes SC11/SC12 (v2.0 feature gaps carried forward).

**Delivers:** `phase18-smoke-cdp.cjs` with all 12 SCs passing; bridge registration gap closed; `package-goatide.sh` orchestration script; test-package vs. GA-package build split documented.

**Addresses:** FEATURES Category E (E2E verification); bridge registration gap from PROJECT.md; SC11/SC12 investigation.

**Critical pitfalls to avoid:** Pitfall A (CDP fuse — split into test-package build); bridge registration gap (stale mirror in packaged installer); Pitfall K (receipt assertions must use seeded node IDs, not LLM-predicted strings).

**Research flag:** NEEDS deeper research on fuse configuration in `electron-builder.yml` for test vs. GA packages. Standard pattern otherwise.

---

### Phase 19: Walkthrough Foregrounding Fix

**Rationale:** Low blast radius (touches `product.json` and one function in `walkthrough-completion.ts`), high UX value (POLISH-01 investment is wasted if the walkthrough never wins first-launch). SC3b is the regression gate for this work. Fixing it before Phases 20/21 land changes to `extension.ts` means SC3b is green before those phases create additional complexity in shared files.

**Delivers:** SC3b flips from SOFT-FAIL to PASS; `product.json configurationDefaults` override for `workbench.startupEditor: none`; updated `prepare_goatide.sh` jq pipeline; walkthrough `order` value verified against VS Code's default walkthrough order.

**Addresses:** FEATURES Category C (walkthrough foregrounding); STACK Area 5.

**Critical pitfalls to avoid:** Pitfall I (do not reset `onboardingComplete` via `WorkspaceConfiguration.update`); `product.json` changes must be preserved by brander via idempotent jq patch; walkthrough identifier must be `"goatide.goatide-bridge#goatide.onboarding"`.

**Research flag:** MEDIUM confidence on `configurationDefaults` key support in VS Code 1.117.0. Wave 0 must inspect `product.json` schema; if key is not honoured, fall back to `setTimeout` + double-invocation approach from STACK.md.

---

### Phase 20: DecisionNode Authoring Write Path

**Rationale:** Lights up the POLISH-03 empty-state CTA and completes the POLISH-04 Reject button stub. Both touch `extension.ts`, `tier-dispatch.ts`, and canvas messages — landing them in one phase avoids returning to the same files in Phase 21. Mandate A/B CI gate extensions must happen in Wave 0 before any UI code is written.

**Delivers:** `DecisionNodeForm.tsx` React component; `AttemptActions.tsx` Reject button; `graph.createDecisionNode` kernel RPC; canvas message types (`canvas.showDecisionNodeForm`, `canvas.submitDecisionNode`, `canvas.decisionNodeCreated`); `refuse-deep05-write.sh` BANNED array updated; `refuse-llm-in-canvas.meta.sh` extended to cover `canvas/panel.ts`; double-rejection guard; unit tests.

**Addresses:** FEATURES Category B (DecisionNode authoring); STACK Area 3; ARCHITECTURE Capability Area 2.

**Critical pitfalls to avoid:** Pitfall B (extend Mandate A fence to host-side files in Wave 0; empty `defaultValue` unit test); Pitfall C (add `createDecisionNode` to BANNED array before any inspector code); Pitfall D (authoring write path must not trigger save-gate reentrancy — use direct kernel RPC, no file write); Pitfall M (double-rejection guard via `disposedChangeIds: Set<string>`).

**Research flag:** Standard pattern — extends existing canvas message + kernel RPC patterns from Phases 4 and 14. No per-phase research needed.

---

### Phase 21: Cross-Repo Activation — Single-DB Multi-Repo

**Rationale:** Activates the dormant `edge[?crossRepo]` Cytoscape styling that has existed since Phase 17 but never fired. The single-DB model extends existing `ProposeEditParams` with an optional `repo_id` field — minimal kernel surface change. Must be sequential after Phase 20 because both phases modify `tier-dispatch.ts` and kernel write RPC signatures.

**Delivers:** `workspace-repo-state.ts` module; optional `repo_id` on `proposeEdit` / `atomicAccept` / `recordRejection` RPCs; `tier-dispatch.ts` reads `WorkspaceRepoState.getActiveRepoId()`; Graph Inspector cross-repo edges fire in a 2-folder multi-root workspace on save; kernel startup guard rejects second readwrite opener on same DB.

**Addresses:** FEATURES Category D (cross-repo activation); STACK Area 4; ARCHITECTURE Capability Area 3.

**Critical pitfalls to avoid:** Pitfall E (DB WAL collision — add kernel startup guard; enforce single-writer); `repo_id` must come from `fingerprint()` SHA-256(12), never raw URL; graceful fallback to `'primary'` when workspace folder has no git remote; `enumerateWorkspaceRepos()` must be called once at activate, not on every save.

**Research flag:** Standard pattern for single-DB extension. Per-repo daemon model explicitly deferred to v2.2.

---

### Phase 22: Distribution — C1/C2/C3

**Rationale:** Cert procurement gates C1 (Apple Developer ID) and C2 (Azure Trusted Signing account). All graph features should be verified on the installable before adding updater complexity to the Electron main process. `main.ts` has the widest blast radius of any file in the codebase; landing it after all graph work is verified reduces regression risk.

**Delivers:** `electron-builder.yml` (repo root); `goatideUpdater.ts` with VSCODE_DEV guard; `IUpdateService` no-op stub in VS Code DI; `scripts/notarize.js` afterSign hook; `build/sign-node-addons.js` beforeSign hook for `better_sqlite3.node`; Azure Trusted Signing CI integration; `latest.yml` + `latest-mac.yml` on GitHub Releases; Phase 18 install-smoke run against the signed installable.

**Addresses:** FEATURES Category A (distribution); STACK Areas 1 + 2 + 3 (distribution sub-areas).

**Critical pitfalls to avoid:** Pitfall F (re-sign `better_sqlite3.node` with hardened runtime in `beforeSign` hook); Pitfall G (use Azure Trusted Signing, not physical EV token; plan for 2–4 week SmartScreen reputation window); Pitfall H (stub `IUpdateService` BEFORE wiring `electron-updater`; assert no `code.visualstudio.com` requests); Pitfall O (`dev-app-update.yml` must be in `.gitignore` before the file is created).

**Research flag:** C1/C2 well-documented for `electron-builder`. BLOCKING precondition: cert procurement must happen outside the code before Phase 22 begins. If certs are not available, ship unsigned installable for self-testing and defer signing to v2.2.

---

## Watch Out For — Top Pitfalls Ranked by v2.1 Severity

| Rank | Pitfall | Phase | One-Line Prevention |
|------|---------|-------|---------------------|
| 1 | CDP harness silent timeout on signed binary (Pitfall A) | 18 Wave 0 | Build a test-package with `EnableNodeCliInspectArguments` fuse ON; document split strategy before writing any SC. |
| 2 | Bridge registration gap kills all bridge features on installed build | 18 | `package-goatide.sh` must run `prepare_goatide.sh` first; `refuse-stale-bridge-mirror.sh` as pre-package gate. |
| 3 | VS Code `IUpdateService` + `electron-updater` dual-updater crash (Pitfall H) | 22 Wave 0 | Stub `IUpdateService` before any `electron-updater` code; assert zero `code.visualstudio.com` requests in Phase 18 smoke. |
| 4 | Mandate B: new write RPC missing from `refuse-deep05-write.sh` BANNED array (Pitfall C) | 20 Wave 0 | Add `createDecisionNode` to BANNED array in Wave 0, before any inspector or UI code. |
| 5 | macOS `better_sqlite3.node` notarization rejection (Pitfall F) | 22 Wave 0 | `beforeSign` hook re-signs all `.node` files with `-o runtime`; test locally before Apple submission. |
| 6 | Authoring form body pre-populated from kernel or LLM (Pitfall B) | 20 Wave 0 | Extend Mandate A fence to `canvas/panel.ts`; unit test asserts `textarea.value === ''` on form open. |
| 7 | Save-gate reentrancy if authoring write touches watched file (Pitfall D) | 20 Wave 0 | Authoring write path uses direct kernel RPC only — no file write that triggers `onWillSaveTextDocument`. |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `electron-builder`, `electron-updater`, `@electron/notarize` versions verified against npm + official docs. No new packages for authoring/walkthrough/cross-repo — all reuse existing primitives confirmed by source inspection. |
| Features | HIGH | Distribution and E2E verification features sourced from official Apple/Microsoft/Electron docs. Authoring and walkthrough features derived from source inspection of existing bridge code + VS Code GitHub issues. |
| Architecture | HIGH | All architecture claims sourced from direct source inspection of kernel/, bridge/, build/, and VS Code workbench internals. electron-builder/electron-updater integration patterns web-verified. |
| Pitfalls | HIGH | Critical pitfalls verified against source code + official documentation. Electron fuse behaviour confirmed from official Electron docs. CA/B Forum EV hardware token mandate confirmed from multiple vendor sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **Walkthrough `configurationDefaults` key support (Phase 19 Wave 0):** The recommendation to use `product.json configurationDefaults` for `workbench.startupEditor: none` needs Wave-0 validation against the actual VS Code 1.117.0 `product.json` schema. If the key is not supported, fall back to the `setTimeout` + double-invocation approach (MEDIUM confidence).
- **Exact CDP smoke SC11/SC12 root cause (Phase 18 Wave 0):** Root cause is suspected to be the bridge registration gap + settings UI render issue but has not been confirmed by source inspection. Phase 18 Wave 0 must reproduce and diagnose before fixing.
- **Azure Trusted Signing provisioning timeline (Phase 22 precondition):** Must be provisioned before Phase 22 begins. This is an operational step outside the code.
- **SmartScreen reputation timeline (Phase 22 post-ship):** Even with Azure Trusted Signing, SmartScreen will warn for the first 2–4 weeks. Release notes must pre-warn users.

---

## Sources

### Primary (HIGH confidence)
- GoatIDE source code (kernel/, bridge/, build/, scripts/) — all architecture claims verified by direct file inspection
- `.planning/PROJECT.md` — v2.1 scope, mandates, bridge registration gap, key decisions
- electron-builder official docs (electron.build) — NSIS target, GitHub Releases provider, `--prepackaged` flag, Squirrel.Windows deprecated
- electron-updater npm (npmjs.com/package/electron-updater) — v6.8.3 current; NSIS + Squirrel.Mac via ZIP
- @electron/notarize GitHub (github.com/electron/notarize) — v3.1.1 current; v3.x notarytool-only; Node 22+
- Apple TN3147 (developer.apple.com) — altool sunset November 1, 2023 confirmed
- CA/B Forum EV cert requirements — 458-day validity cap from March 2026; FIPS 140 hardware mandatory
- VS Code GitHub issue #187958 — `openWalkthrough` race condition + double-invocation workaround confirmed

### Secondary (MEDIUM confidence)
- Azure Trusted Signing SmartScreen behaviour (Microsoft Learn answers) — SmartScreen warns even with Trusted Signing on new intermediate CAs (March 2026)
- EV certificates no longer bypass SmartScreen (melatonin.dev/blog, March 2024)
- `workbench.action.openWalkthrough` format (eliostruyf.com) — `"<publisher>.<name>#<walkthrough-id>"` format confirmed; timing issue acknowledged
- Electron fuses documentation (electronjs.org) — `EnableNodeCliInspectArguments` fuse gates `--inspect` on packaged builds
- Microsoft Trusted Signing service (Microsoft Learn docs, multiple blog posts) — CI-compatible HSM signing API

### Tertiary (LOW confidence)
- v2.0-archive/ research files — baseline for what NOT to re-research (confirmed shipped)

---
*Research completed: 2026-05-16*
*Ready for roadmap: yes*
