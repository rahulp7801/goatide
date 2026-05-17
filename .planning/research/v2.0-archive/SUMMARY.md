# Project Research Summary

**Project:** GoatIDE v2.0 — Deep Features + Polish + Windows Auto-Update
**Domain:** VS Code fork — bitemporal graph IDE (11 locked IDs: DEEP-01..06, POLISH-01..04, C3)
**Researched:** 2026-05-13
**Confidence:** HIGH (stack + architecture sourced from direct GoatIDE code inspection; pitfalls verified against commit history)

---

## ORCHESTRATOR ESCALATION — READ BEFORE PROCEEDING TO ROADMAP

**Squirrel.Windows contradiction with locked v2.0 scope.**

`project_v2_milestone_locked.md` states "C3 auto-update scoped to Squirrel.Windows only." All three research agents (STACK, FEATURES, ARCHITECTURE) independently concluded that Squirrel.Windows is deprecated and unsupported by electron-builder for auto-update, and that the inherited VS Code InnoSetup + `inno_updater.exe` pipeline requires Microsoft's private `update.code.visualstudio.com` CDN that GoatIDE cannot write to.

The correct v2.0 implementation is `electron-builder` NSIS + `electron-updater` with GitHub Releases. This contradicts the locked scope's specific technology callout.

The orchestrator must surface this to the user before proceeding to roadmap. The confirmation needed: "Replace Squirrel.Windows assumption with electron-builder NSIS + electron-updater." This is not ambiguity — it is a resolved technical finding with HIGH confidence.

---

## Executive Summary

GoatIDE v2.0 adds five graph-deep features (DEEP-01..06), four polish items (POLISH-01..04), and one infrastructure feature (C3 Windows auto-update) to an already-shipped bitemporal graph IDE. All 11 features are buildable on the existing substrate without architectural rework. No new database engines, no new communication protocols, no new process boundaries — v2.0 is an expansion of established patterns. The riskiest single feature is DEEP-02 (Graph Inspector), which introduces the only new npm dependency requiring browser-context execution (Cytoscape.js 3.33 + cytoscape-fcose 2.2.0), a new WebviewPanel with its own esbuild bundle, and a new RPC shape. Every other DEEP feature is a kernel RPC extension using existing infrastructure.

The recommended approach builds from the inside out: kernel RPC contracts first (Phase 14), new panel surface (Phase 15), schema migrations and analysis extensions (Phase 16), cross-repo UI + polish batched together (Phase 17), and the independent auto-update track last (Phase 18). This ordering derives from three constraints all researchers converged on independently: bridge callers cannot exist before kernel RPC types are declared; DEEP-06 schema migration must land before cross-repo traversal UI; and bridge `package.json` changes trigger a mandatory `scripts/prepare_goatide.sh` mirror regen that is safest isolated to exactly two phases (15 and 17 — phases 14, 16, and 18 do not touch bridge `package.json`).

The key risks are all front-loadable as Wave-0 prerequisites. The two cross-cutting Wave-0 mandates are: (a) freeze kernel `NodeRow[]` objects before passing to Cytoscape via a `kernelRowToCyElement()` projection utility — prevents silent bitemporal timestamp corruption; (b) define a `ReadonlyKernelClient` interface that read-only features like DEEP-05 receive instead of the full `KernelClient` — prevents accidental graph writes from a read-side component. Both can be written as RED tests before any feature code exists.

---

## Key Findings

### Recommended Stack

The existing stack requires only four new packages for all 11 v2.0 features:

- `cytoscape@^3.33.0` (bridge `devDependencies`) — Graph rendering for DEEP-02 time-travel inspector. Canvas-based, handles up to 5K nodes without FPS degradation, TypeScript types built-in. Goes in `devDependencies` because esbuild bundles it into the webview IIFE — putting it in `dependencies` pollutes the bridge mirror's `node_modules` and breaks `refuse-stale-bridge-mirror.sh`.
- `cytoscape-fcose@^2.2.0` (bridge `devDependencies`) — Force-directed layout plugin. Peer dep: `cytoscape >= 3.2`. Better than default COSE for dependency graphs.
- `electron-builder@^26.8.1` (root `devDependencies`) — Builds NSIS installer, generates `latest.yml`, publishes to GitHub Releases. Build-time only.
- `electron-updater@^6.8.3` (root `dependencies`) — Runtime auto-update client. Ships in the packaged app.

Technology decisions locked by research:

- Cytoscape.js over Sigma.js (GoatIDE graphs won't hit the 100K+ node scale where Sigma wins; graphology duplicates the kernel's SQLite graph model), over vis-network (physics simulation mismatched to read-only temporal inspection), over raw D3-force (3-4x implementation complexity for equivalent output).
- electron-builder NSIS over Squirrel.Windows (deprecated in electron-builder, requires Microsoft's private CDN) and over adapting InnoSetup (requires that same CDN plus Rust `inno_updater.exe` rebuild — months of infrastructure).
- `contributes.walkthroughs` over react-joyride/Shepherd.js for POLISH-01 (native VS Code Getting Started panel, zero bundle weight, platform-idiomatic).
- `WorkspaceConfiguration enum` over custom settings webview for POLISH-02 (VS Code renders `enum` + `enumDescriptions` as a native dropdown automatically).

Reference repos clarification: Graphify (safishamsi/graphify) and code-review-graph (tirth8205/code-review-graph) are Python CLI tools generating static HTML — neither repo's JavaScript dependency tree applies to GoatIDE. Graphify informs the DEEP-02 dark-first color palette and semantic node-type coloring. code-review-graph informs large-graph UX patterns (degree-scaled sizing, community toggle pills, BFS search, edge-type filter pills) when node count exceeds 500.

### Expected Features

**Must have (P1 — table stakes):**
- POLISH-01 (first-run onboarding) — novel UI must orient users before first Canvas encounter
- POLISH-02 (save-gate settings UI) — no configuration path currently; users must read source code
- POLISH-03 (empty state for 0-citation receipts) — blank panel reads as broken
- DEEP-01 (rationale chain query: "why does this code exist?") — first user-visible payoff of the graph substrate
- DEEP-04 (historical-supersession IntentDrift) — logical completion of v1.x drift badge

**Should have (P2 — ships if phases hold):**
- POLISH-04 (hover drilldown for benign saves) — friction reduction; inline hints expected by Copilot/Cursor users
- DEEP-02 (visual time-travel Graph Inspector) — demo-worthy visual differentiator impossible in git-only tools; largest scope
- DEEP-03 (constraint-lift ripple analysis) — unique capability; no competitor answers "what breaks if we remove this constraint?"
- DEEP-05 (session-priority lens) — power-user personalization without graph mutation
- C3 (Windows auto-update) — distribution trust

**Defer to v2.1 (P3):**
- DEEP-06-phase-B (cross-repo stitching UI) — LARGE complexity; the schema migration (phase-A) ships in Phase 16 regardless; the cross-repo UI command can slip

**Anti-features explicitly excluded (all Mandate violations):**
- Graph-state mutation via the time-travel slider (Mandate B)
- LLM-generated rationale for empty states (Mandates A + C)
- DEEP-03 auto-lift action (Mandate D)
- DEEP-04 auto-blocking saves on historical conflict (Mandate D)
- DEEP-05 persisting re-ranked order to the database (Mandate B)
- Cross-repo data from cloud graph services (local-first architecture constraint)

### Architecture Approach

All v2.0 features integrate into the existing three-layer architecture (VS Code workbench → goatide-bridge extension host CJS → kernel sidecar ESM, over vscode-jsonrpc TCP) without adding new process boundaries. New kernel work follows the established pattern: `RequestType` in `methods.ts`, handler in `bindHandlers()`, typed method on `KernelClient`. The Graph Inspector is a separate `GraphInspectorPanel` class — not a subclass or reuse of `CanvasPanel` — with `VIEW_TYPE = 'goatide.graphInspector'` and its own `dist/inspector/index.js` esbuild bundle. All new kernel operations are read-only except the DEEP-06 schema migration (backward-compatible nullable ALTER TABLE).

**Major new components:**
1. `kernel/src/graph/rationale.ts` — `queryRationaleChain()` recursive CTE over ConstraintNode + DecisionNode kinds (DEEP-01)
2. `kernel/src/graph/dao.ts` additions — `queryTimelineSnapshot()`, `queryAllTimepoints()`, `queryByRepo()` (DEEP-02, DEEP-06)
3. `kernel/src/drift/constraint-lift.ts` — `runConstraintLiftAnalysis()` inbound-edge walk from ConstraintNode (DEEP-03; this is an inbound `WHERE e.dst_id = ?` walk, distinct from the existing outbound `walkRippleEdges` which uses `WHERE e.src_id = ?`)
4. `GraphInspectorPanel` + `GraphView.tsx` — separate WebviewPanel with Cytoscape.js, time-slider, fcose layout, own esbuild entry point (DEEP-02)
5. `src/vs/goatide/update/goatideUpdater.ts` — electron-updater initializer in Electron main process, gated on both `!process.env.VSCODE_DEV` AND `autoUpdater.isUpdaterActive()` (C3)
6. `electron-builder.yml` at repo root — NOT in `package.json`'s `build` key, which conflicts with VS Code's gulp system (C3)

**Bridge mirror regen required in exactly two phases:** Phase 15 (adding `cytoscape` + `cytoscape-fcose` to bridge `package.json`) and Phase 17 (adding `contributes.walkthroughs` + `contributes.configuration`). Phases 14, 16, 18 do not touch bridge `package.json`.

### Critical Pitfalls

1. **Cytoscape mutates `NodeRow[]` in-place — corrupts bitemporal timestamps silently.** Cytoscape's `cy.add()` attaches `_private` bookkeeping to the `data` field. Raw `NodeRow[]` from kernel RPC responses passed directly to `cy.add()` get their `valid_from` and node IDs overwritten. Downstream DEEP-03 ripple and DEEP-01 rationale chain calls silently operate on corrupted data. Prevention: `kernelRowToCyElement()` projection utility as DEEP-02 Wave-0 step 1; keep raw `NodeRow[]` frozen separately. Wave-0 test: input `NodeRow` is unchanged after projection.

2. **`GraphInspectorPanel` must not share `VIEW_TYPE` with `CanvasPanel`.** Reusing `CanvasPanel.getOrCreate()` or `viewType = 'goatide.canvas'` causes VS Code panel restoration to match the inspector to the save-gate's pending `Promise<CanvasDecision>`, producing spurious `accept` resolutions. Prevention: `VIEW_TYPE = 'goatide.graphInspector'`; RED test asserting both strings are different.

3. **`cytoscape` and `cytoscape-fcose` in `dependencies` breaks `refuse-stale-bridge-mirror.sh`.** These are webview-only. In `dependencies`, `npm ci --omit=dev` populates them into the mirror's `node_modules`, causing the CI byte-compare gate to fail. Prevention: both in `devDependencies`; verify `ls extensions/goatide-bridge/node_modules | grep cytoscape` is empty after regen.

4. **`ReadonlyKernelClient` interface required before any DEEP-05 code.** `KernelClient` exposes write methods (`atomicAccept`, `proposeEdit`, `recordRejection`, `recordContractOverride`) on the same object used for read-side queries. DEEP-05's priority-lens component accidentally calling `atomicAccept()` creates ghost `Attempt` nodes that corrupt DEEP-01 rationale chains. Prevention: `ReadonlyKernelClient` interface; DEEP-05 receives only restricted interface; CI gate `refuse-deep05-write.sh` greps write-method imports in inspector source path.

5. **`electron-updater` must be gated on BOTH `!process.env.VSCODE_DEV` AND `autoUpdater.isUpdaterActive()`.** Missing either causes GitHub Releases polling in CI (unhandled rejection exits main process) or NSIS silent-install into the developer's running source checkout. `isUpdaterActive()` alone is insufficient — it returns `true` on a fully packaged build. Prevention: both guards in `goatideUpdater.ts`; CDPharness asserts `isUpdaterActive() === false` in dev mode.

**Two additional pitfalls for DEEP-06 and C3:**

6. **DEEP-06 cross-repo node ID collision.** The `repo_id` migration must use `NOT NULL DEFAULT 'primary'` with backfill (not `NULL` default), and `queryByAnchor` must implicitly filter to `WHERE repo_id = 'primary'` unless `repoId: '*'` is explicit. The `repoId` value must be a SHA-256 fingerprint of the git remote URL — not the raw URL (SQL injection risk if injected directly into queries).

7. **NSIS App ID drift vs. `prepare_goatide.sh` GUID.** `product.json`'s `win32x64AppId` GUID and `electron-builder.yml`'s `appId` are two separate identity systems. If `prepare_goatide.sh` changes the GUID without updating `electron-builder.yml`, NSIS upgrades install alongside the existing install rather than replacing it. Prevention: cross-reference comment in `electron-builder.yml`; `assert-installer-appid-stable.sh` CI gate.

---

## Implications for Roadmap

### Phase 14: Foundation RPCs (DEEP-01 + DEEP-04 + DEEP-05)

**Rationale:** These three features extend existing Canvas UI without a new panel or `package.json` change. No new npm installs, no mirror regen, no new esbuild entry points. Lowest blast radius first establishes the RPC contract pattern for all subsequent phases. DEEP-01 and DEEP-05 are read-side — ideal for introducing `ReadonlyKernelClient` before any write-capable feature adds complexity.

**Delivers:** `queryRationaleChain` RPC + `RationaleChain.tsx` inline Canvas component (DEEP-01); historical-supersession `IntentDriftBadge` variant via `dao.findSuccessor()` join (DEEP-04); `sessionPriorityLens()` in-memory citation re-rank in `receipt/render.ts` (DEEP-05); `ReadonlyKernelClient` interface + CI gate.

**Features addressed:** DEEP-01 (P1), DEEP-04 (P1), DEEP-05 (P2)

**Avoids:** Pitfall 4 (`ReadonlyKernelClient` Wave-0 before any DEEP-05 code); CLOSE-03 `asOf` timing for DEEP-04 tests.

**Research flag:** Standard patterns — no phase research needed.

---

### Phase 15: Graph Inspector Panel (DEEP-02)

**Rationale:** Largest single feature. New WebviewPanel, new esbuild entry point, new npm deps, mandatory mirror regen. Isolated to its own phase to keep the blast radius of `package.json` changes contained. Phase 14 must be complete to establish `KernelClient` extension pattern.

**Delivers:** `GraphInspectorPanel` with `VIEW_TYPE = 'goatide.graphInspector'`; `GraphView.tsx` with Cytoscape.js canvas renderer + fcose layout + time-travel slider; `QueryTimelineRequest` RPC + `queryTimelineSnapshot()` + `queryAllTimepoints()` in kernel DAO; second esbuild entry point `dist/inspector/index.js`; bridge mirror regen; Graphify dark-theme color palette for node types.

**New packages:** `cytoscape@^3.33.0` + `cytoscape-fcose@^2.2.0` in bridge `devDependencies`.

**Avoids:** Pitfall 1 (`kernelRowToCyElement()` Wave-0); Pitfall 2 (separate class + different `VIEW_TYPE` + RED test); Pitfall 3 (devDependencies placement, mirror clean verification); explicit `webgl: false` in `cytoscape()` init.

**Performance guards:** Debounce slider 150ms; `cy.elements().hide()`/`show()` instead of remove+add on slider ticks; `hideEdgesOnViewport: true`; fcose layout run once, positions persisted to React state.

**Research flag:** Needs phase research — Cytoscape + React + VS Code WebviewPanel in this specific esbuild CJS-to-IIFE pipeline is novel. Confirm `cytoscape` does not appear in `dist/extension.js` (extension host bundle).

---

### Phase 16: Ripple Analysis + Cross-Repo Schema Migration (DEEP-03 + DEEP-06-phase-A)

**Rationale:** DEEP-03 surfaces in existing `DriftFindings.tsx` — no new panel. DEEP-06 schema migration is a backward-compatible `ALTER TABLE ADD COLUMN` with `NULL` default, safe to ship without UI. Shipping both here keeps Phase 17 cross-repo UI unblocked without Phase 17 carrying schema migration risk.

**Delivers:** `kernel/src/drift/constraint-lift.ts` with `runConstraintLiftAnalysis()` inbound-edge walk; `ConstraintLiftRequest` RPC; "What would break?" button in `DriftFindings.tsx` with results labelled "Hypothetical Impact"; `kernel/drizzle/migrations/0007_cross_repo_identity.sql` adding `repo_id TEXT NOT NULL DEFAULT 'primary'` to `nodes` + `edges` with backfill; `queryByRepo()` DAO method; `INDEX nodes_repo_id`.

**Avoids:** Pitfall 4 (DEEP-03 scorer `structuredClone`s base `ComplianceReport`, never mutates in-place; Wave-0 kernel unit test); Pitfall 6 (migration uses `NOT NULL DEFAULT 'primary'` with backfill; `repoId` values are SHA-256 fingerprints of git remote URL).

**Research flag:** Standard patterns — inbound-edge SQL inversion of existing outbound walk + textbook nullable ALTER TABLE. No phase research needed.

---

### Phase 17: Cross-Repo UI + Full Polish Cluster (DEEP-06-phase-B + POLISH-01/02/03/04)

**Rationale:** POLISH-01 walkthrough step 5 references the Graph Inspector command (Phase 15 must exist first). POLISH-04 depends on POLISH-02. All four POLISH items modify bridge `package.json` (`contributes.walkthroughs` + `contributes.configuration`), making one mandatory mirror regen serve all four. DEEP-06 cross-repo UI depends on Phase 16 schema migration. Batching all `package.json`-touching changes into one phase = one regen event = lower total risk surface.

**Delivers:** `goatide.graph.openCrossRepo` command; workspace folder enumeration via `simpleGit.remote()` SHA-256 fingerprinting; `GOATIDE_REPO_ID` env var in kernel daemon; `contributes.walkthroughs` 4-5 step onboarding with `context.globalState` completion (not `WorkspaceConfiguration`); `contributes.configuration` for `goatide.saveGate.*` (3 enum dropdowns, `scope: "resource"`); `CitationList.tsx` empty-state with CTA; `HoverReceipt.tsx` compact Markdown hover for benign-tier saves; bridge mirror regen.

**Avoids:** Completion writes to `context.globalState` not `WorkspaceConfiguration` (Wave-0 unit test); POLISH-02 `getConfiguration` uses resource-scoped overload with `doc.uri`; POLISH-04 hover does NOT appear for destructive-tier (Mandate D); POLISH-03 empty state does NOT offer LLM-generated rationale (Mandate A).

**Research flag:** Standard patterns for all POLISH items. DEEP-06 cross-repo workspace enumeration may need brief research — verify `vscode.workspace.workspaceFolders` behavior when `undefined` (no folder open) or length === 1 (single repo, no stitching).

---

### Phase 18: Windows Auto-Update (C3)

**Rationale:** Fully independent of all graph features — no DEEP/POLISH feature depends on it. Touches `src/vs/code/electron-main/main.ts` — widest blast radius of any v2.0 change. Isolating it last means a C3 bug does not block DEEP/POLISH verification. Freshclone-smoke CDPharness must be passing before C3 ships.

**Delivers:** `electron-builder.yml` at repo root (NSIS, `appId: ai.goatide.GoatIDE`, `oneClick: false`, `perMachine: false`, `generateUpdatesFilesForAllChannels: true`); `src/vs/goatide/update/goatideUpdater.ts` with both VSCODE_DEV + `isUpdaterActive()` guards; conditional call from `src/vs/code/electron-main/main.ts` after `app.whenReady()`; CDPharness assertion; `dev-app-update.yml` in `.gitignore`; `assert-installer-appid-stable.sh` CI gate.

**Avoids:** Pitfall 5 (both guards in `goatideUpdater.ts`; Wave-0 unit test); Pitfall 7 (cross-reference comment + CI gate); no `signtoolOptions` until C2 cert arrives in v2.1.

**Research flag:** Standard patterns — official docs verified, Electron 39.8.7 compatibility confirmed, HIGH confidence throughout.

---

### Phase Ordering Rationale

- Phase 14 before Phase 15: bridge callers cannot compile without `RequestType` declarations; `ReadonlyKernelClient` must exist before any Cytoscape-adjacent read-side code.
- Phase 15 before Phase 16: `GraphInspectorPanel` is a soft dependency for DEEP-06-phase-B's cross-repo stitched view in Phase 17.
- Phase 16 ships schema migration without UI: the `ALTER TABLE ADD COLUMN` is backward-compatible; decoupling it from the UI means if Phase 17 runs over schedule, DEEP-06 UI slips to v2.1 without taking the migration with it.
- Phase 17 batches POLISH with DEEP-06-phase-B: both trigger `package.json` changes → one mirror regen event → lowest total risk surface.
- Phase 18 is last: Electron main-process bugs can prevent GoatIDE from launching entirely, blocking all other feature verification.

### Research Flags

**Needs phase research:**
- **Phase 15 (DEEP-02):** Confirm `cytoscape` does not appear in `dist/extension.js` (extension host bundle) when placed in bridge `devDependencies`. Confirm `cytoscape-fcose` peer dependency resolves correctly in the CJS → IIFE esbuild transform.
- **Phase 17 (DEEP-06-phase-B):** Verify `vscode.workspace.workspaceFolders` behavior when `undefined` or length === 1; confirm cross-repo command degrades gracefully.

**Standard patterns (skip research-phase):**
- Phase 14: all patterns established in v1.x phases, verified by direct source inspection. HIGH confidence.
- Phase 16: inbound-edge SQL inversion + textbook nullable ALTER TABLE. No ambiguity.
- Phase 18: electron-builder NSIS + electron-updater GitHub Releases. Official docs verified, Electron 39.8.7 compatibility confirmed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new packages verified via official npm registry, electron-builder official docs, Cytoscape.js release notes, VS Code official API docs. Squirrel.Windows deprecation verified in electron-builder 26.x docs directly. |
| Features | HIGH (POLISH + C3); MEDIUM (DEEP-01/03/04/05/06) | POLISH items and C3 confirmed against official VS Code API and electron-builder docs. DEEP features are GoatIDE-novel with no external ecosystem comparator — behavioral spec is sound but has no prior art to validate against. |
| Architecture | HIGH | Based on direct GoatIDE source inspection of all relevant files. Patterns are fully characterized. |
| Pitfalls | HIGH | Verified against source code + commit history (CLOSE-01..03, HARDEN-01, HARDEN-06, HARDEN-07). Cytoscape mutation pitfall verified against Cytoscape.js internal API docs. |

**Overall confidence:** HIGH for architectural approach and phase structure. Residual uncertainty limited to GoatIDE-novel DEEP feature behaviors (no external comparator) and the specific esbuild + Cytoscape integration detail flagged for Phase 15 research.

### Gaps to Address

- **Squirrel.Windows contradiction (ESCALATION ABOVE):** Must be resolved by user before roadmap is finalized. All other gaps are resolvable during implementation.
- **DEEP-06-phase-B deferral decision:** Confirm whether cross-repo UI is in-scope for v2.0 or explicitly deferred to v2.1. Schema migration ships regardless.
- **POLISH-01 step 5 release granularity:** If partial v2.0 releases are possible (e.g. Phases 14-16 before Phases 17-18), walkthrough step 5 must be gated behind `when: "goatide.graphInspectorAvailable"` context key.
- **C3 GitHub Release infrastructure prerequisite:** `publish.provider: github` in `electron-builder.yml` requires the `goatide` GitHub repo to have Releases enabled and a `GH_TOKEN` secret. This is a pre-Phase-18 infrastructure gate, not a code gap.

---

## Sources

**Primary (HIGH confidence):**
- GoatIDE source inspection: `kernel/src/rpc/server.ts`, `kernel/src/rpc/methods.ts`, `kernel/src/drift/ripple.ts`, `kernel/src/drift/intent.ts`, `kernel/src/graph/dao.ts`, `canvas/panel.ts`, `save-gate/canvas-module.ts`, `kernel/client.ts`, `extension.ts`, `build/gulpfile.vscode.win32.ts`
- electron-builder auto-update docs — Squirrel.Windows deprecation, NSIS support, `forceDevUpdateConfig`
- VS Code contributes.walkthroughs, contribution points reference, settings UX guidelines — official API confirmed
- Cytoscape.js 3.33.0 release notes + WebGL Renderer Preview — version + WebGL provisional status confirmed
- electron-updater 6.8.3 + electron-builder 26.8.1 npm — current versions confirmed

**Secondary (MEDIUM confidence):**
- pkgpulse: Cytoscape.js vs vis-network vs Sigma.js 2026 — download counts (third-party)
- Graphify source (safishamsi/graphify) — dark theme color palette, node-type coloring (visual reference only; Python CLI)
- code-review-graph source (tirth8205/code-review-graph) — large-graph UX patterns (visual reference only; D3.js)
- GoatIDE commit history: CLOSE-01..03, HARDEN-01, HARDEN-06, HARDEN-07

---

### Roadmap Implications Summary

Suggested phases: **5**

1. **Phase 14 — Foundation RPCs** — establish RPC contract pattern + `ReadonlyKernelClient` with lowest blast radius (DEEP-01, DEEP-04, DEEP-05)
2. **Phase 15 — Graph Inspector Panel** — largest single feature isolated to contain `package.json` + npm risk (DEEP-02)
3. **Phase 16 — Ripple Analysis + Cross-Repo Schema** — extend analysis surface + lay schema foundation for cross-repo without UI risk (DEEP-03, DEEP-06-phase-A)
4. **Phase 17 — Cross-Repo UI + Full Polish** — batch all remaining `package.json` changes into one mirror-regen event (DEEP-06-phase-B, POLISH-01..04)
5. **Phase 18 — Windows Auto-Update** — isolated last to protect Electron main-process stability (C3)

**Research flags:** Phase 15 and Phase 17 (DEEP-06-phase-B) need phase research. Phases 14, 16, 18 use standard patterns.

**Overall confidence:** HIGH

**Ready for roadmap:** PENDING — requires user confirmation on Squirrel.Windows vs. NSIS contradiction before proceeding.
