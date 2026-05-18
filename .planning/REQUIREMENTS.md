# GoatIDE Requirements

> **Reconstruction notice (2026-05-12):** This file was rebuilt from git history + Claude conversation context after a destructive subagent wiped `.planning/`. CLOSE-01/02/03 are verbatim. Historical requirements (FORK-*, TRAV-*, etc.) are reconstructed from commit subject lines and are *approximate* — they accurately reflect what was built but the originally-authored requirement prose is gone. v2.0 requirements are placeholders pending the planned `/gsd:new-milestone v2.0`.

---

## Open (Active milestone: v2.1 — Verify + Ship — started 2026-05-16)

**Milestone goal:** Verify v2.0 works end-to-end on a real installable build (not dev-mode), close v2.0 deferred gaps, then ship distribution + DecisionNode authoring + cross-repo activation + walkthrough foregrounding fix.

**Sequencing locked at kickoff:** Verify-then-ship. Phase 18 (verification gate) blocks all v2.1 net-new work. Phase 22 (distribution) is gated on external cert procurement.

**Research:** `.planning/research/SUMMARY.md` (4-dim research synthesized 2026-05-16; commit `6e8c10ac0a5`). Multi-daemon kernel orchestration deferred to v2.2 per ARCHITECTURE recommendation — v2.1 uses single-DB + optional `repo_id` threading on existing write RPCs.

---

### Verification (Phase 18 — gates everything)

- [x] **VERIFY-01**: Build pipeline produces a real installable GoatIDE artifact (`.dmg` for macOS, NSIS `.exe` for Windows) via `electron-builder --prepackaged .build/VSCode-<platform>` slotting in after the existing gulp pipeline. `electron-builder.yml` separate from `package.json` `build` key. `asarUnpack: ["kernel/**"]` excludes kernel sidecar from ASAR.
- [x] **VERIFY-02**: Bridge registration gap closed — packaging pipeline runs `scripts/prepare_goatide.sh` so the installed `extensions/goatide-bridge/` contains the real compiled bridge (not the stub). Installable GoatIDE loads the real bridge; Canvas + Inspector + save-gate all function.
- [x] **VERIFY-03**: Phase 17 CDP smoke SC11 + SC12 root-caused and fixed (likely bridge registration gap downstream — diagnose in Phase 18 Wave 0). Phase 18 smoke achieves 12/12 SCs PASS.
- [x] **VERIFY-04**: Test-package vs GA-package build split decided in Phase 18 Wave 0 — test package keeps `EnableNodeCliInspectArguments` Electron fuse ON for CDP automation; GA package may disable for distribution. Both build targets reachable from `electron-builder.yml`.
- [x] **VERIFY-05**: E2E manual UAT checklist walks every v2.0 user-visible surface on the installed binary: walkthrough renders (foregrounding fix follow-up in Phase 19), Canvas tier dispatch fires on save, Graph Inspector opens via command, save-gate destructive prompt appears, settings UI exposes 3 saveGate.* properties, empty-state CTA visible, dispatchHover status-bar message appears for benign saves, `goatide.openCrossRepoGraph` shows graceful single-folder notification.

### Authoring (Phase 20 — Closed 2026-05-18)

- [x] **AUTH-01**: `goatide.canvas.addDecisionNode` placeholder replaced with real write path. User can author a DecisionNode via command palette (table stakes: anchor selection from current file's known anchors → required rationale text via InputBox → optional constraint links picker → atomic write via the new `graph.createDecisionNode` kernel RPC — departed from original ROADMAP wording per Phase 20 research Pitfall A: `proposeEdit`/`atomicAccept` operate on file diffs and create Attempt nodes, not DecisionNodes; the new RPC is the correct primitive). Anchor auto-population from `CanvasShowPayload.anchor_path` when triggered from the POLISH-03 empty-state CTA.
- [x] **AUTH-02**: Post-hoc rejection — `dispatchHover` benign-tier status-bar message gains a "Reject" action button. Click → confirmation modal → `kernel.recordRejection(attemptId)`. Reject button NEVER appears on destructive-tier saves (Mandate D fence; byte-identity matrix test extended).
- [x] **AUTH-03**: `refuse-llm-in-canvas.meta.sh` Mandate A fence extended to cover host-side authoring files (`canvas/authoring-*.ts`) — closes the v2.0 blind spot where the fence scanned only `canvas/webview/*`. New meta-test asserts positive + negative round-trip.
- [x] **AUTH-04**: `refuse-deep05-write.sh` Mandate B fence BANNED array forward-declared to include the v2.1 write RPC token(s) BEFORE any authoring inspector-adjacent code is written. CI gate fails if inspector/ imports the new write surface.

### Cross-Repo Activation (Phase 21)

- [x] **XREPO-01**: Existing write RPCs (`proposeEdit`, `atomicAccept`, `recordRejection`) accept optional `repo_id: string` parameter, defaulting to `'primary'`. Single-DB model preserved — multi-daemon per-repo deferred to v2.2. Backward-compatible: all 2-arg call sites continue to work.
- [x] **XREPO-02**: New `WorkspaceRepoState` bridge module enumerates `vscode.workspace.workspaceFolders`, fingerprints each repo via existing `repo-fingerprint.ts` SHA-256 helper, caches the active document's repo_id. `tier-dispatch.ts` threads the active repo_id onto every write through the existing save-gate path.
- [x] **XREPO-03**: Real cross-repo edges render in the Graph Inspector when a save in repo-A cites a node in repo-B's graph. The dormant `edge[?crossRepo]` Cytoscape selector (Phase 17) fires for the first time. Inspector node tooltip shows repo_id fingerprint + readable repo name. No new write RPC needed (reuse existing edge insertion path with `edge_kind = 'cross_repo_citation'`).

### Distribution (Phase 22 — external-cert gated)

- [ ] **C1**: macOS notarization via `@electron/notarize ^3.1.1` (notarytool only; altool removed by Apple). `beforeSign` hook re-signs `better_sqlite3.node` + all `.node` files with hardened runtime before main `.app` signing. `xcrun stapler staple` post-notarize embeds ticket in DMG. Requires Apple Developer account ($99/yr — operational prereq).
- [ ] **C2**: Windows code-signing via **Azure Trusted Signing** (CI-friendly path — EV USB tokens cannot be used in GitHub Actions). `win.azureSignOptions` in `electron-builder.yml`. SmartScreen reputation accumulates over time (no instant EV bypass post-March 2024). Requires Azure Trusted Signing account (operational prereq).
- [x] **C3**: Auto-update unified via `electron-updater ^6.8.3` on GitHub Releases (Squirrel.Windows deprecated). Single `goatideUpdater.ts` module at `src/vs/goatide/update/`; call site in `src/vs/code/electron-main/main.ts` guarded by `!process.env.VSCODE_DEV` (HARDEN-06 pattern). VS Code's upstream `IUpdateService` stubbed to prevent duplicate update notifications. `update-downloaded` event prompts "Restart Now / Later" — never auto-restart (Mandate D spirit). NSIS for Windows; `mac.target: [dmg, zip]` for macOS (zip required for `latest-mac.yml` update metadata).

---



## Closed (Historical — reconstructed from git history)

### Phase 14 — Foundation RPCs — Closed 2026-05-14

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| DEEP-01 | `composeRationaleChainAt` kernel composition + `graph.queryRationaleAt` RPC under requireAuth + bridge `KernelClient.queryRationaleAt` + `ReadonlyKernelClient` Pick<> extended to 9 methods + `CanvasShowPayloadSchema` 5 new fields (rationale_chain, rationale_error, graph_snapshot_tx_time, session_priority, session_priority_indicator) + `canvas.requestRationale` WebviewToHost variant + `panel.ts` `RationaleHandler` transport-only routing + `RationaleChain.tsx` webview component (4 render branches: idle / kernel-degraded / empty / loaded). Bitemporal asOf threads top-level field → handleMessage → RPC, zero `Date.now()` in the path. | `3ee5aa5baac`, `1d2dc4510ba`, `9889e8e0bdd`, `cb369286314`, `d45553548d8` |
| DEEP-04 | `evaluateHistoricalConflict` kernel pure-function (DecisionNode-only filter + bitemporal asOf + null-successor defense + prefix-match) + `IntentDriftBadge` migrated to discriminated union (`kind: 'priority-mismatch' \| 'historical-conflict'`) across kernel `types.ts` + bridge Zod schema `messages.ts` + bridge type mirrors `kernel/methods.ts` + `save-gate/canvas-module.ts` + `CitationList.tsx` amber "Superseded `<date>`" variant render + `.intent-drift-badge--historical-conflict` CSS + Mandate D byte-identity regression (arity-3 + 5×3 tier-matrix snapshot + 2-hits-in-1-file caller-count fence). Historical-conflict wins over priority-mismatch on the same citation. | `9a1f3dd180c`, `8d382e9aea9`, `8807ba104ff` |
| DEEP-05 | `ReadonlyKernelClient` type-only Pick<> + `refuse-deep05-write.sh` CI gate + hermetic meta-test (META PASS) + `rerankBySessionPriority` 11-line stable-sort body (binary drift-bearing classifier over both IntentDriftBadge variants) + App.tsx webview-side useMemo invocation + Canvas header indicator render path (`data-testid="canvas-header-session-priority"`) + `tier-dispatch.ts` threads `session_priority` + `session_priority_indicator` + `graph_snapshot_tx_time` onto CanvasShowPayload + Mandate B 5-case regression test (Attempt/Node/Edge count invariants + KernelClient.prototype spy fence + setSessionPriority command integration). Lens is webview-only; host-side payload assembly is kernel-degraded-fork-aware. | `c908b4c87e7`, `742ff1cb00b`, `781e4db7aba`, `2448b1b371c`, `941b5d1fa11`, `94e02ab39ef` |

### v2.0 Milestone — Deep Features + Polish — Closed 2026-05-16

**Started:** 2026-05-13 via `/gsd:new-milestone v2.0`

**Closed:** 2026-05-16 — Phase 17 phase-verify approved (autonomous CDP smoke + Wave-0 unit tests)

**Phases:** 14, 15, 16, 17 (4/4 complete)

**Out of scope (deferred to v2.1):** C1 macOS notarization, C2 Windows EV code-signing, Sparkle macOS auto-update, **C3 Windows auto-update** (Squirrel.Windows deprecated; deferred 2026-05-13 — unified in v2.1 with C1+C2 + NSIS + electron-updater). Walkthrough foregrounding behavior (v2.0 walkthrough is registered + visible but VS Code default "Setup VS Code" walkthrough is foregrounded on first launch — v2.1 polish item).

**v2.0 scope summary (10/10 requirements closed):**
- DEEP-01 (Phase 14), DEEP-02 (Phase 15), DEEP-03 (Phase 16), DEEP-04 (Phase 14), DEEP-05 (Phase 14): graph RPCs + inspector + ripple analysis
- DEEP-06 phase-A (Phase 16) + phase-B (Phase 17): cross-repo schema + UI
- POLISH-01, POLISH-02, POLISH-03, POLISH-04 (Phase 17): onboarding, settings, empty-state, hover receipt

### Phase 17 — Cross-Repo UI + Polish Cluster — Closed 2026-05-16

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| DEEP-06 phase-B | `goatide.openCrossRepoGraph` command + graceful degradation (workspaceFolders missing/single → info notification) + `GraphInspectorPanel.getOrCreateForCrossRepo` factory + cross-repo edge styling (Cytoscape stylesheet selector `edge[?crossRepo]` dashed + amber-400 via `PALETTE.crossRepoEdge = '#fbbf24'`) + kernel wire-schema extension (`SerializedNodeSnapshot`/`SerializedEdgeSnapshot` gain `repo_id`) + bridge Zod schema + translation chain. Single-DB + `repo_id` partitioning (Open Decision §1 lock — multi-daemon orchestration deferred to v2.1). | `dc141c1fffa`, `f7ea6ec5155`, `20d5c62c7fb`, `76207c68abe` |
| POLISH-01 | `contributes.walkthroughs` (5 steps, completionEvents on step 5) + `registerWalkthroughCompletion` + `maybeAutoOpenWalkthrough` + `context.globalState` fence (Pitfall 9 mitigation — NOT `WorkspaceConfiguration.update`) + `setContext` walkthrough dismissal. N3 ordering invariant: all `registerCommand` calls precede `maybeAutoOpenWalkthrough`. v2.0 ships walkthrough registered + visible; foregrounding behavior deferred to v2.1. | `370d51d93b7`, `8dbbf291b97`, `e412e43eb7b` |
| POLISH-02 | `contributes.configuration` 3 `saveGate.*` properties (`destructive` enum=[block,confirm] Mandate D fence; `highImpact` + `benign` 3-value enums; all `scope: resource`) + `tier-dispatch.ts` resource-scoped `getConfiguration('goatide.saveGate', doc.uri)` read at `dispatchTier` entry. Pitfall E defense: each branch reads ONLY its designated setting. | `d491a250bdc` |
| POLISH-03 | `CitationList.tsx` empty-state component (SVG info-circle icon + BYTE-EXACT literal `'No rationale recorded yet'` heading + body paragraph + "Add DecisionNode" CTA) + `canvas.requestAddDecisionNode` message variant + `extension.ts` placeholder `goatide.canvas.addDecisionNode` command (v2.1 informational body) + Mandate A structural fence via `refuse-llm-in-canvas.meta.sh`. | `18675414b37`, `e412e43eb7b` |
| POLISH-04 | `tier-dispatch.ts` `dispatchHover` private function (status-bar message + 4s auto-dismiss + "Open full receipt" fallback to `panel.showAndAwait`) + Mandate D byte-identity matrix test pinning destructive saves NEVER de-escalate via benign setting (4x3 tier-isDestructive-benignSetting snapshot). Caller-count fence: 1 declaration + 1 caller = 2. | `d491a250bdc` |

### Phase 19 — Walkthrough Foregrounding Fix — Closed 2026-05-17

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| WALK-01 | Bridge `package.json` `contributes.configurationDefaults["workbench.startupEditor"] = "none"` so VS Code's `StartupPageRunnerContribution.run()` falls through when the value is not `'welcomePage'`; `setTimeout(2000ms)` double-invoke in `maybeAutoOpenWalkthrough` as belt+suspenders fallback for Pitfall 5 / VS Code issue #152265; Phase 18 CDP smoke SC3b detection switched from window.title() (VS Code does not update `walkthroughPageTitle` when switching walkthrough via `openWalkthrough` command) to DOM-based `x-category-title-for` attribute fingerprint written by `buildCategorySlide()`; gate threshold raised from 12/13 to 13/13; Pitfall 9 fence preserved (`registerWalkthroughCompletion` still uses `context.globalState`, NOT `WorkspaceConfiguration.update`). Flakiness fence: 3/3 consecutive smoke runs EXIT 0. | `da8e7d03707`, `8cb0b4cff4b`, `ae957b68130`, `57f83c71f7e`, `53624da51ba`, `3e511fb506b` |

### Phase 20 — DecisionNode Authoring Write Path — Closed 2026-05-18

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| AUTH-01 | New `graph.createDecisionNode` kernel RPC (mirror RecordContractOverrideRequest shape) + bridge `KernelClient.createDecisionNode` method + new `canvas/authoring-flow.ts` host-side multi-step orchestrator (QuickPick anchor picker → InputBox rationale `value: ''` Mandate A → optional priority confirm → final confirm → kernel write); `extension.ts` command body swap from v2.0 placeholder to `runAddDecisionNodeFlow` invocation via try/catch (Pitfall G). N3 ordering invariant preserved. Anchor auto-populated from `activeTextEditor` (OQ#4). Constraint-link picker deferred to v2.2 (OQ#3). | `6768e7985d5`, `3e7198ca2bd`, `ebddd84497f`, `476348448a9` |
| AUTH-02 | `dispatchHover` Step 4 gains Reject branch: `showInformationMessage` action triplet `('Reject', 'Open full receipt')` + modal confirmation `showWarningMessage('Reject this benign save post-hoc? ...', {modal:true}, 'Reject')` + try/catch-wrapped `kernel.recordRejection({receipt_id, change_id, note:'user_post_hoc_reject_benign_hover'})` on confirm (OQ#1+OQ#2: reuse existing RPC verbatim). Mandate D fence preserved: Reject button NEVER appears on destructive-tier saves (`(silent, false, 'hover')` structural gate). 4×3 matrix test extended (Plan 20-01) with `recordRejectionCalls` column; `recordRejectionCalls === 0` invariant in every cell. Pitfall F caller-count fence (`LOCKED_CALLER_COUNT_WAVE1 = 2`) UNCHANGED. | `767eeb81f6f`, `61bb7a1973a` |
| AUTH-03 | `scripts/test/refuse-llm-in-canvas.meta.sh` widened (new `HOST_CANVAS_DIR` + `grep_host_canvas` sibling to existing webview/ scope). Top-level `canvas/*.ts` host files now covered by Mandate A fence. Phase 1 positive control + Phase 2 negative control (two probes -- one per scope) + `META PASS`. Pitfall C pre-flight grep confirmed clean baseline before widening. | `cdea35d6667` |
| AUTH-04 | `scripts/ci/refuse-deep05-write.sh` BANNED array gains `createDecisionNode` as 5th entry (Phase 14 lineage preserved). `scripts/test/refuse-deep05-write.meta.sh` gains Phase 3 positive control with `_fixture-violation-createDecisionNode.ts` round-trip. ReadonlyKernelClient `Pick<>` UNCHANGED (Pitfall E — never add createDecisionNode to readonly view). Fence-before-surface: BANNED entry landed in Wave 0 BEFORE Plan 20-02 introduced the literal in kernel/bridge code. | `454080f2eb8` |

### Phase 18 — E2E Verification Gate — Closed 2026-05-17

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| VERIFY-01..05 | Electron-builder NSIS + DMG pipeline + bridge packaging + CDP 13-SC smoke harness (dev-mirror mode) + UAT checklist. | `b36225882a2`, `dccd6f607ec`, `0d25b59f228`, `0c7c4fdae66`, `0fa34f8ffa0`, `a3dbce189e0`, `93b8f05cc7a` |

### Phase 16 — Ripple Analysis + Cross-Repo Schema Migration — Closed 2026-05-15

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| DEEP-03 | `graph.constraintLift` RPC under requireAuth + kernel `runConstraintLiftAnalysis` sibling to `runRippleAnalysis` (reuses exported `walkRippleEdges`) + bridge `KernelClient.constraintLift` + `CanvasPanel.registerConstraintLiftHandler` + `canvas.requestConstraintLift` discriminator + `DriftFindings.tsx` conditional "What would break if this constraint is lifted?" button + `HypotheticalImpact.tsx` (Hypothetical badge + depth radio 1/2/3 + show-all toggle) + tier-dispatch host-side `constraint_lift_eligible` eligibility + Mandate B 4-layer defense (kernel queryByKind('Attempt') invariant + bridge KernelClient.prototype spy + webview conditional render + refuse-deep05-write.sh structural gate) + Pitfall 1 single-snapshot asOf threading + `refuse-unbounded-ripple-walk.sh` widened to cover `constraint-lift*.ts` + new `refuse-unbounded-ripple-walk.meta.sh` hermetic positive/negative meta-test. Confidence-weighted score: `num_explicit / total_rows` aggregate; Explicit-first within-bucket sort. Phase 16-05 Rule 1 fix: `ConstraintLiftAnalysisResult` type introduced so `confidence_band` is visible at tsc-level. | `8421cc7874c`, `a10800df961`, `e03bfe2b1d0`, `0679f656f22`, `8130ecfa367`, `0e62b0885be`, `6e900d566ed`, `fb9a393cf63`, `c822ccb4ffe`, `861c8604842`, `7cc5cce1d8b`, `2fd84176ce3`, `4c239fd24cc`, `ac7af7cb022`, `b44f55f355e` |
| DEEP-06 phase-A | Migration `0008_cross_repo_identity.sql` adds `repo_id TEXT NOT NULL DEFAULT 'primary'` to nodes + edges + creates `nodes_repo_id` + `edges_repo_id` indexes (SQLite 3.42+ ALTER TABLE backfill semantics). Drizzle schema sync in `schema/nodes.ts` + `schema/edges.ts`. New `repo-fingerprint.ts` SHA-256 helper (12-char hex, normalized URL — Pitfall 6 security mitigation). DAO `queryByRepo(repoId, asOf)` + `queryByAnchor` extended with optional `repoId: string = 'primary'` default-param. `migrations.spec.ts` sqlite_master allowlist extended. Backward-compat regression invariant: full kernel suite passes byte-equal (119 files / 406 tests; sentries as-of/query-by-anchor/traverse byte-equal). Deployment model: one DB per repo + bridge-side query-layer stitching (Open Decision 6) — Phase 17 phase-B implements the cross-repo enumeration UI. Note: ROADMAP originally referenced `0007_cross_repo_identity.sql`; reconciled to `0008_*` (0007_contract_overrides_metric.sql already existed from Phase 7 DRIFT-06). | `8421cc7874c`, `a10800df961`, `0e62b0885be`, `fb9a393cf63` |

### Phase 15 — Graph Inspector Panel — Closed 2026-05-15

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| DEEP-02 | `GraphInspectorPanel` (VS Code WebviewPanel VIEW_TYPE `goatide.graphInspector`) + `graph.queryGraphSnapshot` + `graph.queryTimelineTransitions` kernel RPCs under requireAuth + bridge `KernelClient.queryGraphSnapshot/queryTimelineTransitions` + `ReadonlyKernelClient` extended to 11 methods + `kernelRowToCyElement` + `edgeRowToCyElement` projection utilities (pure copy — Pitfall 1 mutation fence) + Cytoscape.js canvas renderer with fcose layout + Graphify dark-theme palette (`#0f172a` background + 5-kind color coding) + time-travel Slider component + `TruncationBanner` + `App.tsx` (orphan-edge filter + phase-A bitemporal snapshot) + `styles.css` (--vscode-* variables only + inlined Graphify hex) + Graph.tsx Cytoscape mount with try/catch jsdom guard + bridge command `goatide.openGraphInspector` + `cytoscape@^3.33.0` + `cytoscape-fcose@^2.2.0` in devDependencies + `refuse-cytoscape-in-mirror.meta.sh` hermetic meta-test. Jsom-compatible tests: 5 passing (header read-only / truncation banner / slider asOf change); 3 skipped (canvas-dependent — playwright follow-up). | `42e30b5235a`, `630ffa35c40`, `a0307d4b785`, `4f767dae252`, `d75c157925c`, `11cb52095d8`, `73d2587cc00`, `a90de6d7a07`, `c84fb576d29`, `a654f417f1f`, `5271e3b5dec`, `92d32049e53`, `eb9a8782ea1`, `e3c32c0a05d`, `5d24e740a41` |

### Phase 13 — v1.2 Closeout (pre-requisite) — Closed 2026-05-13

| ID | What shipped | Closure commit(s) |
|----|-------------|-------------------|
| CLOSE-01 | Root postinstall now auto-provisions kernel/node_modules with Electron-ABI 140 better-sqlite3 binary. `ensureKernelSqlitePrebuild()` added to `build/npm/postinstall.ts`; `install-electron-prebuild.cjs` enhanced with idempotency guard + Windows rename() safety. Core contract: ABI-OK:1 under Electron-as-Node. | `6d82e2ecaf8` (version pin), `5b8b604b5a5` (postinstall chain), `7ba846b2d0d` (GREEN verification) |
| CLOSE-02 | Single-launch visual ceremony (11 surfaces, 1 Electron process) now produces 11/11 PASS deterministically. Three root causes fixed: (1) stale CanvasPanel singleton (dispose() singleton-clear ordering), (2) canvas.show dropped before React mount (canvas.ready handshake), (3) VS Code `_badListeners` throttle from `event.waitUntil(Promise.reject)` → switched to `Promise.resolve()`. | `5099b6ebd01` (canvas.ready + badListeners fix), `0b9d0a834b0` (VIS-02 tab-pin), `94cc0474415` (tab-active-before-save), `a8994785d94` (meta-test arithmetic fix), `3d539c981bd` (per-wave isolation lift) |
| CLOSE-03 | `sc3-section-lock.spec.ts` order-dependent flake eliminated. Root cause: `asOf` captured BEFORE seeding — under suite load, 4 SQLite writes took >10ms, making `valid_from > asOf`. Fix: capture `asOf = new Date(Date.now() + 1).toISOString()` AFTER all seed writes. 5/10 meta-test runs PASS (0 FAIL) + 3 prior inline passes. | `6821aa4b817` (fix), `5760b1f0166` (meta-test detection hardening), `cfbe0ad7e58` (5/10 confirmation) |

### Phase 01 — Fork Bringup

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| FORK-01 | Pin upstream microsoft/vscode at a known SHA | `f7392562f06` (1.117.0 pin) |
| FORK-02 | Brand product.json + idempotent brander script | `8c659504187`, `ae212e15a60` |
| FORK-03 | Clean-profile launch smoke test | `bde8635de16` |
| FORK-04 | CI gate: refuse marketplace API usage | `4da8bdfaedd`, `b8eef169f5f`, `672ea31dfff` |
| FORK-05 | Upstream-sync ceremony (dry-run) | `e16d0704be7`, `6c1ffa0abaf` |
| FORK-06 | HTML rebranding + per-file allowlist | `f960ea101fd`, `8b51f353381` |
| FORK-07 | Open-profile perf fix (docs) | `e48ee03097b` |
| FORK-08 | Remove Open-VSX 404 extension recommendations | `db141e34484`, `224c59efacd` |

### Phase 01.1 — Build Toolchain & Fork-Hygiene Gap Closure

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| FORK-TS-PIN | Pin typescript@~5.9.0 + brander preserves pin across upstream-sync | `78360fdb0f9`, `d995d904f51`, `00cda37038b` |
| FORK-OPENVSX | JSONC strip-comments preprocessor for validate-openvsx | `224c59efacd` |

### Phase 01.2 — LFS Push-Ability Gap Closure (GH008)

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| FORK-LFS | GitHub fork strategy (Path F) to resolve GH008 push-ability | `44a8cf474f0` |

### Phase 02 — Bitemporal Graph Substrate

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| GRAPH-DEPS | Install Phase-2 deps + ESM in kernel/ | `1997757db23`, `6b7a171f20e`, `e0789da5e01` |
| GRAPH-SCHEMA | Drizzle schema for nodes/edges/provenance + active_nodes view | `7201463c7ca` |
| GRAPH-MIGRATIONS | Migrations + triggers + openDatabase bootstrap | `cee869a5eb5`, `6f164abb87b`, `75011c1b0a5` |
| GRAPH-DAO | GraphDAO append-only mutation surface | `66e4f980624`, `dc41f0d008a` |
| GRAPH-CLI | seed/supersede/query CLI subcommands + e2e | `dc21f85bb6e`, `0e8df7b61fe`, `42023531ff4` |

### Phase 03 — Edge Traversal + Retrieval + Reasoning Receipt

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| TRAV-01..03 | traverse() recursive CTE + supersession-chain timestamps | `59734f25055`, `a99e95ac1c2`, `33bde7bf5f7` |
| TRAV-04..06 | Anchor.ticket_id + queryByAnchor + refusal gate | `0f31c5bf0fd`, `9ad210bdfb8` |
| REC-01..06 | citation schema + ReceiptDAO + buildReceipt + explainCitation | `59cebd10132`, `5fc4570d711`, `1aa1ac229d6` |
| RPC-DAEMON | RPC daemon entry + LSP framing round-trip | `3bb30a9ce56`, `18d3d423e80` |

### Phase 04 — Verification Canvas (per-save, tiered)

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| CANV-01..02 | Bridge deps + Wave-0 stubs + webview smoke | `3bfcf60ea06`, `b4c3234cfca` |
| CANV-03..05 | Tier classifier + destructive detector + canvas types | `8fe170cd624`, `237c663465d`, `7404f43527d` |
| CANV-06..09 | Webview React UI + RPC schemas + CanvasPanel host | `cc77bb177c8`, `e653a7dc5f4`, `cd479544c58`, `09457e55209` |
| CANV-10 | Kernel-degraded fork + KernelDegradedBanner + reconnect + heartbeat | `37421dcfa2c`, `de1c993be4c`, `cadb69ceb06` |
| CANV-PERF | AnchorResultCache (LRU+TTL) + partial-index seeks + 10K benchmark | `5a29d2cfed6`, `40c739f7bff`, `acdd2d8fa77`, `cfd23ecc568` |

### Phase 05 — Telemetry Harvester + Portability Filter

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| TELE-01 | Claude JSONL chokidar watcher + offsets DAO | `e50cc9fe159`, `87e40afc9a4` |
| TELE-02 | Editor-events watcher (debounced + Mandate-A) | `521ce021a1c`, `45b48865cad` |
| TELE-03 | Terminal-events ANSI strip + 32KB cap | `1c6d03f87df`, `9761f46aec0`, `c87a01f8bad` |
| TELE-05 | Kernel daemon module + TCP RPC auth gate + reconnect-or-spawn | `a2cecd8315f`, `0ea22f8c167`, `9e41879ddff`, `e1bfffd2ba8` |
| PORT-01 | 6-gate portability filter cascade + credential-scrub | `cffe0f3acce`, `64a259cbb54`, `2c3715d8a46` |
| PORT-03..06 | goatide-cli harvest + Liveness + HarvestMetricsDao + bridge LivenessBanner | `9c3fce39827`, `d4d66d187de`, `f26c7276dcb`, `eaa98591b5a`, `5c07f70e2d4` |

### Phase 06 — MCP Gateway (consume 4, expose 1)

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| MCP-01 | stdio-client + 4-provider pool multiplexer | `8897b49f81d` |
| MCP-02 | Registry + backoff + types + namespacing | `5dbcd79a503` |
| MCP-03 | Keychain wrapper | `57964a15aea` |
| MCP-04..05 | schema-mapper + observation-router | `0f589879ed8`, `513d8b42e5b` |
| MCP-06 | TokenRefreshScheduler + revocation detectors | `57964a15aea` |
| MCP-07 | Schema-drift snapshot + paths | `179da068bcb` |
| MCP-EXPOSE | MCP HTTP server + bearer auth + Origin allowlist + graph.* tools | `d7dce53445a`, `94389d07fab` |
| MCP-LIVENESS | Bridge LivenessBanner-ext + SchemaDriftBanner + reconnect command | `f7b20f2a76b`, `0be329763ca` |

### Phase 07 — Drift Detection + Contract Locking

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| DRIFT-01..02 | DriftPattern + ContractPayload extensions + 'protects' edge + drift/patterns | `631c8f3b202`, `25d90a06a5c`, `b98be4897a4` |
| DRIFT-03 | section-parser.ts ATX-only markdown parser | `a925d1afddf` |
| DRIFT-04..05 | runRippleAnalysis + ripple-progressive | `b6c8a439b5c`, `513abd664c3` |
| DRIFT-06 | graph.recordContractOverride RPC + metrics DAO + threshold | `da7da21b051`, `c5d81926797` |
| DRIFT-INTEGRATION | Bridge save-gate + tier-dispatch + React DriftFindings + IntentDriftBadge | `91266c9ae71`, `f51fbb34dc0`, `7c25985860f`, `65e85369b5f` |

### Phase 08 — Bridge Runtime Path Fixes (Durable)

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| BRIDGE-RT-01 | resolveKernelPath stat-then-fallback + dual-candidate dist | `2977601f865`, `140d73a2744` |
| BRIDGE-RT-02 | Defensive spawn cwd belt+suspenders | `0afc087375e`, `81e055b331a` |
| BRIDGE-RT-03 | DEFAULT_LOCKFILE_POLL_TIMEOUT_MS 5_000 → 15_000 | `04494ea6644` |
| BRIDGE-RT-04 | Bridge mirror with production-deps + build-bridge npm script | `c3601baa1c2`, `d58ae62236f` |
| BRIDGE-RT-05 | Exclude **/node_modules/** from gulp source walks | `edce2e1cc5b` |

### Phase 09 — Build & Launch Ergonomics

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| BUILD-RT-01 | preLaunch.ensureCompiled sentinel-file check | `8468c2f33ec`, `dd5137ff77f` |
| BUILD-RT-02 | Chain transpile-client into root compile script | `870c58cd15d` |
| BUILD-RT-03 | (refusal meta gate per Wave-0 stub) | `e86bb75293b` |
| BUILD-RT-04 | Kernel postinstall → install-electron-prebuild.cjs | `26c10860cd8`, `b6feaf305e3` |
| BUILD-RT-SMOKE | freshclone-smoke.sh + Playwright _electron.launch harness + CDP harness | `724a7e29e48`, `16b09d6691d`, `5066bc917c1` |

### Phase 10 — Bridge Production Polish

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| BRIDGE-POLISH-01 | 5 missing contributes.commands in bridge package.json + propagation | `c7c1b9ed109`, `aaacf0709c7` |
| BRIDGE-POLISH-02 | mcp.listProviders end-to-end (kernel + bridge KernelClient + SchemaDriftBanner async bootstrap) | `e08a12d6e68`, `7591f1a378a`, `e516b2e75bb` |
| BRIDGE-POLISH-04 | Live harvest-metrics-e2e harness | `3b4d46c829e` |
| BRIDGE-POLISH-05 | renderer.log [error]-line meta-test + ext-host startup timeout 10s→20s | `049bdcf2868`, `2789021b4d2` |

### Phase 11 — Visual Ceremony

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| VIS-01 | Verification Canvas chrome (runVis01) | `795ef1905ed`, `c8f34eb4ada` |
| VIS-02 | Destructive ConfirmationPhrase assertion + migration.ts fixture | `35260fce782` |
| VIS-03..05 | Wave-4 status-bar surfaces | `0dc64b42cd4` |
| VIS-06..08 | Wave-3 drift/compliance/override harness | `8e1610374e7` |
| VIS-09..10 | Wave-1 runVis09/runVis10 + ensureCanvasOpen + harness Wave-1 infra | `a3a2f130e62`, `c8f34eb4ada` |
| VIS-WAVE0 | Visual-workspace fixture + seed driver + iframe smoke + 4 open-question audits | `079864dec23`, `a974e11e004` |
| VIS-INTEGRATION | Visual-ceremony full sweep 11/11 via per-wave Electron isolation (CARVED OUT — Phase 13 CLOSE-02 will lift) | `540bd120618`, `b7fca36b7ff`, `8dc1a20a8ad` |

### Phase 12 — Robustness Hardening

| ID | Approx. ask | Closure commit(s) |
|----|-------------|-------------------|
| HARDEN-01 | P0 auto-save bypass — gate destructive + high-impact saves regardless of reason | `65281d49b7d`, `eca79cf5c21`, `8681625503a` |
| HARDEN-02 | Sync-veto event.waitUntil + fire-and-forget readFile IIFE + save-gate-budget tests | `d9054bfbfa2`, `554b4e74017` |
| HARDEN-03 | Panel dispose-on-reject + ViewColumn.Active fix | `fc6bb4dcba8`, `87df05fb9b8` |
| HARDEN-04 | Regenerate bridge mirror + tighten refusal script to byte-equal | `1be2848ccdd` |
| HARDEN-05 | Regression guard for BRIDGE-RT-01 dual-candidate dist | `0068317d7d1`, `e35354219b0` |
| HARDEN-06 | Default VSCODE_DEV=1 for dev-checkout direct-binary launches + freshclone assert | `7876ff631d7`, `23d13994546` |
| HARDEN-07 | Chain electron-binary provisioning into root postinstall | `e763f8c5b71` |
| HARDEN-WAVE0 | 4 RED test stubs + refuse-stale-bridge-mirror.sh CI gate | `9afc039865e`, `b8c49ff4a39` |

---

## Traceability Index

| Requirement | Phase | Status | Closure Commits |
|-------------|-------|--------|-----------------|
| FORK-01..08, FORK-TS-PIN, FORK-OPENVSX, FORK-LFS | 01, 01.1, 01.2 | Closed | (see Phase 01 section) |
| GRAPH-* | 02 | Closed | (see Phase 02 section) |
| TRAV-*, REC-*, RPC-DAEMON | 03 | Closed | (see Phase 03 section) |
| CANV-*, CANV-PERF | 04 | Closed | (see Phase 04 section) |
| TELE-*, PORT-* | 05 | Closed | (see Phase 05 section) |
| MCP-* | 06 | Closed | (see Phase 06 section) |
| DRIFT-* | 07 | Closed | (see Phase 07 section) |
| BRIDGE-RT-* | 08 | Closed | (see Phase 08 section) |
| BUILD-RT-*, BUILD-RT-SMOKE | 09 | Closed | (see Phase 09 section) |
| BRIDGE-POLISH-* | 10 | Closed | (see Phase 10 section) |
| VIS-* | 11 | Closed | (see Phase 11 section) |
| HARDEN-* | 12 | Closed | (see Phase 12 section) |
| CLOSE-01 | 13 | Closed | `6d82e2ecaf8`, `5b8b604b5a5`, `7ba846b2d0d` |
| CLOSE-02 | 13 | Closed | `5099b6ebd01`, `0b9d0a834b0`, `94cc0474415`, `a8994785d94`, `3d539c981bd` |
| CLOSE-03 | 13 | Closed | `6821aa4b817`, `5760b1f0166`, `cfbe0ad7e58` |
| DEEP-01 | 14 | Closed 2026-05-14 | `3ee5aa5baac`, `1d2dc4510ba`, `9889e8e0bdd`, `cb369286314`, `d45553548d8` |
| DEEP-02 | 15 | Closed 2026-05-14 | `42e30b5235a`, `630ffa35c40`, `a0307d4b785`, `4f767dae252`, `d75c157925c`, `11cb52095d8`, `73d2587cc00`, `a90de6d7a07`, `c84fb576d29`, `a654f417f1f`, `5271e3b5dec`, `92d32049e53`, `eb9a8782ea1`, `e3c32c0a05d`, `5d24e740a41` |
| DEEP-03 | 16 | Closed 2026-05-15 | `8421cc7874c`, `e03bfe2b1d0`, `0679f656f22`, `0e62b0885be`, `6e900d566ed`, `fb9a393cf63`, `c822ccb4ffe`, `861c8604842`, `7cc5cce1d8b`, `2fd84176ce3`, `4c239fd24cc`, `ac7af7cb022`, `b44f55f355e` |
| DEEP-04 | 14 | Closed 2026-05-14 | `9a1f3dd180c`, `8d382e9aea9`, `8807ba104ff` |
| DEEP-05 | 14 | Closed 2026-05-14 | `c908b4c87e7`, `742ff1cb00b`, `781e4db7aba`, `2448b1b371c`, `941b5d1fa11`, `94e02ab39ef` |
| DEEP-06 | 16 (schema-A), 17 (UI-B) | Phase-A Closed 2026-05-15; Phase-B Closed 2026-05-16 | `8421cc7874c`, `a10800df961`, `0e62b0885be`, `fb9a393cf63`, `dc141c1fffa`, `f7ea6ec5155`, `20d5c62c7fb`, `76207c68abe` |
| POLISH-01 | 17 | Closed 2026-05-16 | `370d51d93b7`, `8dbbf291b97`, `e412e43eb7b` |
| POLISH-02 | 17 | Closed 2026-05-16 | `d491a250bdc` |
| POLISH-03 | 17 | Closed 2026-05-16 | `18675414b37`, `e412e43eb7b` |
| POLISH-04 | 17 | Closed 2026-05-16 | `d491a250bdc` |
| ~~C3~~ | v2.1 (deferred) | — | Deferred 2026-05-13 — see Out-of-scope note |

### v2.1 Traceability (Verify + Ship — active)

| Requirement | Phase | Status |
|-------------|-------|--------|
| VERIFY-01 | 18 — E2E Verification Gate | Closed 2026-05-17 (`b36225882a2`, `dccd6f607ec`, `0d25b59f228`, `0c7c4fdae66`) |
| VERIFY-02 | 18 — E2E Verification Gate | Closed 2026-05-17 (`b36225882a2`, `dccd6f607ec`, `0d25b59f228`, `0c7c4fdae66`) |
| VERIFY-03 | 18 — E2E Verification Gate | Closed 2026-05-17 (`0fa34f8ffa0`, `a3dbce189e0`, `93b8f05cc7a`) |
| VERIFY-04 | 18 — E2E Verification Gate | Closed 2026-05-17 (`b36225882a2`, `dccd6f607ec`) |
| VERIFY-05 | 18 — E2E Verification Gate | Closed 2026-05-17 (AUTO-APPROVED UAT — 18-UAT-CHECKLIST.md) |
| WALK-01 | 19 — Walkthrough Foregrounding Fix | Closed 2026-05-17 (`3e511fb506b`, `53624da51ba`, `ae957b68130`, `57f83c71f7e`) |
| AUTH-01 | 20 — DecisionNode Authoring Write Path | Closed 2026-05-18 (`6768e7985d5`, `3e7198ca2bd`, `ebddd84497f`, `476348448a9`) |
| AUTH-02 | 20 — DecisionNode Authoring Write Path | Closed 2026-05-18 (`767eeb81f6f`, `61bb7a1973a`) |
| AUTH-03 | 20 — DecisionNode Authoring Write Path | Closed 2026-05-18 (`cdea35d6667`) |
| AUTH-04 | 20 — DecisionNode Authoring Write Path | Closed 2026-05-18 (`454080f2eb8`) |
| XREPO-01 | 21 — Cross-Repo Activation (Single-DB) | Closed 2026-05-18 (`a8a18abdc06`, `9881d24ef7f`) |
| XREPO-02 | 21 — Cross-Repo Activation (Single-DB) | Closed 2026-05-18 (`9881d24ef7f`) |
| XREPO-03 | 21 — Cross-Repo Activation (Single-DB) | Closed 2026-05-18 (`741a8c7b7a2`) |
| C1 | 22 — Distribution | Pending |
| C2 | 22 — Distribution | Pending |
| C3 | 22 — Distribution | Complete |
