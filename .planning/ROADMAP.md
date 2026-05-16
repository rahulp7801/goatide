# GoatIDE Roadmap

> **Reconstruction notice (2026-05-12):** Rebuilt after destructive subagent wiped `.planning/`. Phase 13 section is verbatim from this session's `roadmap get-phase 13` output (preserved in conversation context). Phases 01-12 are reconstructed one-line summaries derived from commit subjects — they accurately describe *what shipped* but the originally-authored Goal/Success-Criteria/Wave-Structure prose is gone. v2.0 milestone scope is locked per `project_v2_milestone_locked.md` but not yet broken into phases.

---

## Milestones

| Milestone | Status | Phases | Notes |
|-----------|--------|--------|-------|
| v1.0      | Closed | 01, 02 | Fork bringup + graph substrate |
| v1.1      | Closed | 03, 04, 05, 06, 07 | Traversal, Canvas, Telemetry, MCP, Drift |
| v1.2      | Closed (2026-05-13) | 08, 09, 10, 11, 12, 13 | Runtime fixes, ergonomics, polish, ceremony, hardening, closeout |
| v2.0      | In progress \| 14, 15, 16, 17 \| Deep Features + Polish (C3 deferred to v2.1) | 14, 15, 16, 17 | 10 requirements: DEEP-01..06, POLISH-01..04; C3 auto-update → v2.1 |

> Milestone boundaries above are *best-guess* from commit dates + your `project_v2_milestone_locked.md` memory entry. If wrong, edit this table — the v1.x phases are closed work and the boundary doesn't affect ongoing decisions.

---

## Phases

- [x] **Phase 01: Fork Bringup** - Upstream pin, branding, CI refusal gates, smoke test
- [x] **Phase 01.1: Build Toolchain & Fork-Hygiene** - TS pin, JSONC preprocessor, OpenVSX cleanup
- [x] **Phase 01.2: LFS Push-Ability** - GH008 push-ability via Path F fork strategy
- [x] **Phase 02: Bitemporal Graph Substrate** - Drizzle schema, migrations, GraphDAO, CLI
- [x] **Phase 03: Edge Traversal + Reasoning Receipt** - traverse(), receipt, RPC daemon
- [x] **Phase 04: Verification Canvas** - Per-save tiered webview, save-gate, AnchorResultCache
- [x] **Phase 05: Telemetry Harvester + Portability Filter** - JSONL watcher, 6-gate filter, CLI
- [x] **Phase 06: MCP Gateway** - 4-provider pool, MCP HTTP server, schema-drift detection
- [x] **Phase 07: Drift Detection + Contract Locking** - DriftPattern, ripple, IntentDrift, override
- [x] **Phase 08: Bridge Runtime Path Fixes** - stat-then-fallback, bridge mirror, dual-candidate dist
- [x] **Phase 09: Build & Launch Ergonomics** - sentinel check, prebuild chain, freshclone smoke
- [x] **Phase 10: Bridge Production Polish** - missing commands, mcp.listProviders, harvest-metrics
- [x] **Phase 11: Visual Ceremony** - 11/11 PASS single-launch, status-bar surfaces
- [x] **Phase 12: Robustness Hardening** - auto-save bypass, sync-veto, panel dispose, CI gates
- [x] **Phase 13: v1.2 Closeout** - CLOSE-01 ABI rebuild, CLOSE-02 single-launch, CLOSE-03 sc3 flake
- [x] **Phase 14: Foundation RPCs** - Rationale chain query, historical IntentDrift, session-priority lens
- [x] **Phase 15: Graph Inspector Panel** - Time-travel Cytoscape.js inspector, new WebviewPanel (completed 2026-05-15)
- [x] **Phase 16: Ripple Analysis + Cross-Repo Schema** - Constraint-lift analysis, repo_id migration (closed 2026-05-15)
- [ ] **Phase 17: Cross-Repo UI + Polish Cluster** - Cross-repo stitching UI, onboarding, settings UI, empty-state, hover receipt

---

## Phase Details

### Phase 01: Fork Bringup ✓ Closed

**What shipped:** Pinned upstream microsoft/vscode at 1.117.0, branded product.json + HTMLs, clean-profile launch smoke, CI refusal-meta gates (FORK-04/06/07), upstream-sync ceremony dry-run, cross-platform LF/CRLF policy, build matrix to CI workflow.

**Requirements closed:** FORK-01 through FORK-08.

---

### Phase 01.1: Build Toolchain & Fork-Hygiene Gap Closure ✓ Closed

**What shipped:** Pinned typescript@~5.9.0 via overrides, extended brander to preserve TS pin across upstream-sync, JSONC strip-comments for validate-openvsx, removed Open-VSX-404 extension recommendations, FORK-06 HTML branding.

**Requirements closed:** FORK-TS-PIN, FORK-OPENVSX (FORK-06 closure).

---

### Phase 01.2: LFS Push-Ability Gap Closure ✓ Closed

**What shipped:** Resolved GH008 push-ability via GitHub fork strategy (Path F). Docs-only closure.

**Requirements closed:** FORK-LFS.

---

### Phase 02: Bitemporal Graph Substrate ✓ Closed

**What shipped:** Kernel sidecar foundation — Drizzle ORM schema (nodes/edges/provenance/active_nodes view), migrations + triggers, openDatabase bootstrap with pragmas, GraphDAO append-only mutation surface, Ghosting predicate + Zod NodePayloadSchema, CLI subcommands (seed/supersede/query), kernel/ vitest step in CI matrix on all 3 OSes.

**Requirements closed:** GRAPH-DEPS, GRAPH-SCHEMA, GRAPH-MIGRATIONS, GRAPH-DAO, GRAPH-CLI.

---

### Phase 03: Edge Traversal + Retrieval + Reasoning Receipt ✓ Closed

**What shipped:** Anchor.ticket_id + queryByAnchor exact-equality lookup, traverse() recursive CTE + resolveAnchor() exact-equality dispatcher, citation schema + ReceiptDAO + GraphDAO findSuccessor/queryProvenance, buildReceipt with single-snapshot asOf, renderReceipt + explainCitation snapshot-stable augmentation, RPC daemon entry + LSP framing round-trip.

**Requirements closed:** TRAV-01..06, REC-01..06, RPC-DAEMON.

---

### Phase 04: Verification Canvas (per-save, tiered) ✓ Closed

**What shipped:** Bridge extension deps + esbuild + mocharc, Wave-0 stubs (CANV-01..10), tier classifier + destructive detector + canvas types, webview React UI (App, DiffPane, CitationList, ConfirmationPhrase), host↔webview Zod RPC schemas + CanvasPanel host class + jsdom setup, kernel RPC methods (recordRejection/atomicAccept/queryAttemptByStagingPath/queryNodes), bridge KernelClient + connection-state machine, bridge save-gate (cancel-then-redo + DB-first atomic-rename + recovery scan), CANV-10 kernel-degraded fork + KernelDegradedBanner + PendingAttemptsQueue + heartbeat + reconnect. Perf wave: AnchorResultCache (LRU+TTL+invalidate-by-prefix), 0004 partial indexes + walk-dedup pushdown, 10K-node benchmark + inline-tier non-blocking runtime assertion.

**Requirements closed:** CANV-01..10, CANV-PERF.

---

### Phase 05: Telemetry Harvester + Portability Filter ✓ Closed

**What shipped:** Kernel daemon module + TCP RPC auth gate + IDE-close survival, Claude JSONL chokidar watcher + offsets DAO, editor-events watcher (TELE-02 Mandate-A debouncing), terminal-events watcher (TELE-03 ANSI strip + 32KB cap), 0005_harvest_tables migration. Portability filter: 6-gate cascade with credential-scrub + 5 PORT-01 predicates, rejected-log + submit-integration. Promoter (PORT-04) + promotion gate (PORT-05) + atomicAccept wiring. goatide-cli harvest subcommand (PORT-03/06), LivenessState + HarvestMetricsDao + bridge LivenessBanner. ROADMAP-SC integration specs (5).

**Requirements closed:** TELE-01, TELE-02, TELE-03, TELE-05, PORT-01, PORT-03..06.

---

### Phase 06: MCP Gateway (Consume 4, Expose 1) ✓ Closed

**What shipped:** stdio-client + 4-provider pool (MCP-01), registry + backoff + namespacing (MCP-02), keychain wrapper (MCP-03), 4 provider adapters (github/slack/linear/jira) + dispatcher, schema-mapper + observation-router (MCP-04/05), TokenRefreshScheduler + revocation detectors (MCP-06), schema-drift snapshot + paths (MCP-07). MCP HTTP server + bearer auth + Origin allowlist, graph.* MCP tools, daemon integration. Bridge LivenessBanner-ext + SchemaDriftBanner + reconnect command. 5 ROADMAP-SC integration specs.

**Requirements closed:** MCP-01..07, MCP-EXPOSE, MCP-LIVENESS.

---

### Phase 07: Drift Detection + Contract Locking ✓ Closed

**What shipped:** DriftPattern + ContractPayload extensions + 'protects' edge kind + 2 migrations. drift/types.ts + drift/patterns.ts + drift/registry.ts + drift/detector.ts. section-parser.ts ATX-only markdown parser (DRIFT-03). runRippleAnalysis + ripple-progressive (DRIFT-04/05). graph.recordContractOverride RPC + metrics DAO (DRIFT-06) + threshold warning. graph.runDriftAndLock + graph.runRippleProgressive RPC handlers. Bridge: save-gate + tier-dispatch wiring, React DriftFindings + ComplianceReport + OverrideButton + IntentDriftBadge. Session-priority surface + IntentDrift wiring + integration test. 5 ROADMAP-SC integration specs flipped to live.

**Requirements closed:** DRIFT-01..06, DRIFT-INTEGRATION.

> **Known pre-existing flake (DEFERRED to Phase 13):** `sc3-section-lock.spec.ts` order-dependent flake from `4f548fe10cd` — addressed by CLOSE-03.

---

### Phase 08: Bridge Runtime Path Fixes (Durable) ✓ Closed

**What shipped:** Wave-0 spike with @types/sinon. BRIDGE-RT-01 resolveKernelPath stat-then-fallback (dual-candidate dist). BRIDGE-RT-02 defensive spawn cwd belt+suspenders. BRIDGE-RT-03 DEFAULT_LOCKFILE_POLL_TIMEOUT_MS 5_000→15_000. BRIDGE-RT-04 bridge mirror with production-deps + build-bridge npm script. BRIDGE-RT-05 exclude **/node_modules/** from gulp source walks + .gitignore extensions/**/node_modules/. Plan 08-06 phase verify automated battery + bridge subtree exclusion fix.

**Requirements closed:** BRIDGE-RT-01..05.

---

### Phase 09: Build & Launch Ergonomics ✓ Closed

**What shipped:** BUILD-RT-01 sentinel-file check in preLaunch.ensureCompiled. BUILD-RT-02 chain transpile-client into root compile script. BUILD-RT-03 refusal-build-rt-03-meta. BUILD-RT-04 kernel postinstall → install-electron-prebuild.cjs (Electron-ABI better-sqlite3 prebuild). freshclone-smoke.sh driver + Playwright _electron.launch SC#5 harness + CDP harness Windows-hardening + static command-contribution check. Phase 9 verify battery uncovered 3 Rule-1 auto-fixes.

**Requirements closed:** BUILD-RT-01..04, BUILD-RT-SMOKE.

> **Known gap (DEFERRED to Phase 13):** BUILD-RT-04 closure scripted the *first* `kernel/npm install` Electron prebuild but didn't fence the fresh-clone case where Node-version `better-sqlite3` lands first — addressed by CLOSE-01.

---

### Phase 10: Bridge Production Polish ✓ Closed

**What shipped:** BRIDGE-POLISH-01 McpListProvidersRequest type contract + 5 missing contributes.commands in bridge package.json + propagation script (prepare_goatide.sh). BRIDGE-POLISH-02 mcp.listProviders end-to-end (kernel pool + daemon + server + bridge KernelClient + SchemaDriftBanner async bootstrap, pollCount === 0/>0). BRIDGE-POLISH-04 live harvest-metrics-e2e harness. BRIDGE-POLISH-05 renderer.log [error]-line meta-test (SC10-5) + ext-host startup timeout 10s→20s. Pre-staged fsPromises helper + SC10-1/SC10-3/SC10-5 placeholder blocks in CDP harness.

**Requirements closed:** BRIDGE-POLISH-01, 02, 04, 05.

---

### Phase 11: Visual Ceremony ✓ Closed (with carve-out)

**What shipped:** Visual-workspace fixture + seed driver + 4 open-question audits (Wave 0). Wave 1: runVis10 + runVis09 + ensureCanvasOpen + harness Wave-1 infra; rearranged waitUntil to comply with VS Code onWillSaveTextDocument contract. Wave 2: runVis01 Verification Canvas chrome + VIS-01 wave-1 registry entry; runVis02 destructive ConfirmationPhrase assertion + benign migration.ts fixture. Wave 3: drift/compliance/override harness (VIS-06/07/08 live-green). Wave 4: status-bar surfaces VIS-04/05/03 + kernel test stubs. DEFERRED-11-01-A closed (VIS-01 + VIS-09 live-green). Full sweep 11/11 PASS achieved via **per-wave Electron isolation workaround**. Bridge mocha + kernel vitest under Electron-as-Node, harness reliability + harvester rejection-CLI test + Wave-3 single-launch defensive harness.

**Requirements closed:** VIS-01..10, VIS-WAVE0, VIS-INTEGRATION (with carve-out — see Phase 13 CLOSE-02).

> **Known carve-out (DEFERRED to Phase 13):** `scripts/visual-ceremony.sh --waves 3` flag forces wave isolation; without it the sweep fails on the same launch — addressed by CLOSE-02.

---

### Phase 12: Robustness Hardening ✓ Closed (2026-05-12)

**What shipped:** Wave 0 RED stubs for surviving Phase 12 plans + refuse-stale-bridge-mirror.sh CI gate (Pitfall 9 defense). HARDEN-01: P0 auto-save bypass — gate destructive + high-impact saves regardless of reason (Manual-destructive regression fence + 3 remaining auto-save stub closures). HARDEN-02: Sync-veto event.waitUntil + fire-and-forget readFile IIFE + 4 save-gate-budget tests proving sync-veto microtask timing. HARDEN-03: Panel dispose-on-reject + ViewColumn.Active (H1+H2 applied) + GREEN flip on getOrCreate-after-dispose-reject round-trip. HARDEN-04: Regenerate bridge mirror + tighten refusal script to byte-equal. HARDEN-05: Regression guard for BRIDGE-RT-01 dual-candidate dist (Tasks 1+2). HARDEN-06: Default VSCODE_DEV=1 for dev-checkout direct-binary launches + freshclone-smoke asserts VSCODE_DEV-less launch loads workbench-dev.html. HARDEN-07: Chain electron-binary provisioning into root postinstall.

**Requirements closed:** HARDEN-01..07, HARDEN-WAVE0.

> **Known carryovers → Phase 13:** CLOSE-01 (better-sqlite3 ABI rebuild scripting), CLOSE-02 (single-launch ceremony), CLOSE-03 (sc3 flake).

---

### Phase 13: v1.2 Closeout (pre-requisite) ✓ Closed

**Closed:** 2026-05-13

**Plan progress:** 13-00 (Wave 0 infra) ✓ | 13-01 (CLOSE-01 ABI rebuild) ✓ | 13-02 (CLOSE-02 single-launch ceremony) ✓ | 13-03 (CLOSE-03 sc3 flake) ✓ | 13-04 (phase-verify) ✓

**Goal:** Land the three v1.2 carryover items from `.planning/phases/12-robustness-hardening/12-SUMMARY.md` (NOTE: the SUMMARY artifact was lost in the 2026-05-12 reconstruction; carryover details preserved in REQUIREMENTS.md CLOSE-01/02/03 entries) that block every v2 feature phase. Without these, the kernel sidecar crashes on startup → bridge runs in degraded mode → `kernel.proposeEdit` (and the new `kernel.queryRationaleAt` v2 RPC) is unreachable → every graph-anchored read-time feature is dead-on-arrival.

**Depends on:** Phase 12 closed (it is — 2026-05-12).

**Requirements (3):** CLOSE-01, CLOSE-02, CLOSE-03

**Success Criteria:**

1. From a fresh `git clone && npm install`, `require('better-sqlite3')` inside the spawned kernel sidecar succeeds against Electron 39's NODE_MODULE_VERSION 140 (not Node 22's ABI 127) without an `NODE_MODULE_VERSION` mismatch crash. Verified by a meta-test that runs `npm install` from a clean checkout, then launches `kernel/dist/main.js` via the Electron-as-Node wrapper, then asserts `require('better-sqlite3')` returns a function. Closes one of the 4 manual launch-dance steps documented in `reference_goatide_launch_recipe.md` (MEMORY entry `reference_goatide_launch_recipe.md`).
2. `bash scripts/visual-ceremony.sh` (no `--waves 3` carve-out flag) deterministically produces 11/11 PASS on a single Electron launch — replacing the per-wave-isolation v1.1 baseline that Plan 12-03 documented as the workaround. Root-cause investigation lands first (hypothesis: pattern registry lazy-seeded only once on first kernel boot causes empty drift-detector findings on subsequent saves in same launch — re-entered via `.planning/phases/12-robustness-hardening/12-03-CEREMONY-PROBE.md` baseline — NOTE: probe artifact lost; reproduce baseline in Wave 0 before fixing), fix confirms/refutes the hypothesis, then the carve-out flag is removed from `scripts/visual-ceremony.sh` defaults.
3. Kernel `src/test/drift/integration/sc3-section-lock.spec.ts` ("enforcing-section edit triggers tri-bucket lock") passes 10/10 across 10 consecutive full-suite kernel vitest runs (Electron-as-Node wrapper). Suspected: WAL state leak from a prior spec in the same vitest pool — characterized in `12-SUMMARY.md ## Regressions Detected` as a pre-existing Phase 7 flake (commit `4f548fe10cd`). Fix candidate from (lost) Plan 12-08: add `beforeEach(() => harness.resetDb())` or move the spec into its own isolated file pool. After fix, 10/10 across 10 runs is the closure gate.
4. After Phase 13 closes, `npm install && npm run start` from a fresh checkout boots GoatIDE into a healthy state — no kernel-degraded banner, no `NODE_MODULE_VERSION` mismatch in the renderer console, the bridge palette exposes `GoatIDE: Set Session Priority` AND the `goatide.kernel.reconnect` handler is wired. Verified by extending the existing `scripts/test/freshclone-smoke-cdp.cjs` Phase-9 smoke with a kernel-health assertion.

**Suggested wave structure:**
- Wave 0: Test infrastructure — meta-tests for CLOSE-01 ABI rebuild (Electron-as-Node `require('better-sqlite3')` assertion) + CLOSE-02 single-launch ceremony harness extension (lift `--waves 3` gate) + CLOSE-03 sc3 flake repro harness (10× consecutive vitest invocations)
- Wave 1: CLOSE-01 — `kernel/scripts/install-electron-prebuild.cjs` rebuild scripted into `cd kernel && npm install`; pin to root `devDependencies.electron` version (same pattern as BUILD-RT-04 Phase 9 closure)
- Wave 2: CLOSE-02 — single-launch root-cause investigation + fix per (lost) `12-03-CEREMONY-PROBE.md`; lift `--waves 3` carve-out
- Wave 3: CLOSE-03 — sc3 flake fix (DB-reset hook OR isolated file pool); 10/10 repro confirms
- Wave 4: phase-verify — fresh-clone smoke regression fence with kernel-health assertion; flip REQUIREMENTS.md traceability; carve-out documentation

**Estimated plans:** 3-5 plans across 5 waves.

**Anti-pattern to avoid:** Don't widen Phase 13 scope to address the remaining v1.2 carryovers (`citesHighImpactPath` substring tightening + panel-recreate upstream-semantics fence). Those stay in v2-iter dogfood; Phase 13's mandate is the three kernel-boot blockers ONLY.

---

### Phase 14: Foundation RPCs ✓ Closed

**Closed:** 2026-05-14

**Goal:** Users can query the graph for reasoning context and receive relevance-ranked, historically-aware receipts — all within the existing Verification Canvas, with no new panel or npm installs.

**What shipped:** `graph.queryRationaleAt` kernel RPC bitemporally composing `resolveAnchor` + `traverse` + `findSuccessor` into a single round-trip; bridge `KernelClient.queryRationaleAt` + `ReadonlyKernelClient` type-only Pick<> read-only surface (DEEP-05 Mandate B fence); `refuse-deep05-write.sh` CI gate + meta-test guarding inspector/ against 4 banned write RPCs; `IntentDriftBadge` migrated to `z.discriminatedUnion('kind', [priority-mismatch, historical-conflict])` end-to-end across kernel emit-sites + bridge Zod schema + bridge type mirrors; `evaluateHistoricalConflict` kernel pure-function emitting amber "Superseded `<date>`" pills via `CitationList.tsx` variant render; `rerankBySessionPriority` 11-line stable-sort lens invoked webview-side under `useMemo`; tier-dispatch threads `session_priority` + `session_priority_indicator` + `graph_snapshot_tx_time` onto every CanvasShowPayload; Canvas header renders `data-testid="canvas-header-session-priority"` informational indicator; Mandate B pinned by 5-case regression (Attempt/Node/Edge count invariants + KernelClient.prototype spy fence); Mandate D pinned by byte-identity test (arity-3 + 5×3 tier matrix snapshot + caller-count fence). Bitemporal asOf threads top-level CanvasShowPayload field → handleMessage → RPC, zero `Date.now()` in the path. No bridge `package.json` changes — no mirror regen.

**Requirements closed:** DEEP-01, DEEP-04, DEEP-05

**Wave-0 imperatives (before any feature code):**
- Define `ReadonlyKernelClient` interface exposing only read-side methods (`queryGraph`, `queryNodes`, `heartbeat`, `runDriftAndLock` read-only result form) — DEEP-05 components receive only this restricted interface
- Add CI gate `scripts/ci/refuse-deep05-write.sh` that greps `src/vs/goatide/extensions/goatide-bridge/src/inspector/` for imports of `atomicAccept|proposeEdit|recordRejection|recordContractOverride` and fails if found

**Success Criteria** (what must be TRUE when Phase 14 completes):
1. User opens the Verification Canvas on a file anchored to a DecisionNode, clicks "Why does this exist?", and receives an ordered list of ConstraintNode and DecisionNode entries with their `valid_from` timestamps and confidence labels — the chain is bitemporal (anchored to the save's `asOf`, not today's graph state)
2. User saves a file whose anchoring DecisionNode has been superseded by a later decision; the IntentDrift badge in the Canvas shows a new amber `historical-conflict` variant displaying the superseded decision's label and supersession date — and the save still proceeds through the normal tier-dispatch flow (Mandate D: badge informs, does not block)
3. User sets a session priority string via "GoatIDE: Set Session Priority"; subsequent Canvas receipts display drift-bearing citations ranked first, with a "Filtered by session priority: [string]" indicator in the Canvas header — the re-ranking does not create any new graph rows (verified: `queryByKind('Attempt')` count unchanged after priority change)
4. `ReadonlyKernelClient` interface is defined; any attempt to import `atomicAccept`, `proposeEdit`, `recordRejection`, or `recordContractOverride` in the inspector source path fails the `refuse-deep05-write.sh` CI gate

**Plans:** 5/5 plans executed

- [x] 14-01-wave0-readonly-kernel-client-ci-gate-PLAN.md — Wave 0: ReadonlyKernelClient type-only + refuse-deep05-write.sh CI gate + meta-test + 5 RED test stubs (DEEP-05)
- [x] 14-02-deep01-rationale-chain-rpc-PLAN.md — Wave 1: graph.queryRationaleAt RPC + KernelClient method + RationaleChain.tsx (DEEP-01)
- [x] 14-03-deep04-historical-conflict-mandate-d-PLAN.md — Wave 2: IntentDriftBadge discriminated union + evaluateHistoricalConflict + amber render + Mandate D byte-identity test (DEEP-04)
- [x] 14-04-deep05-session-priority-lens-PLAN.md — Wave 3: rerankBySessionPriority + Canvas header indicator + Mandate B regression test (DEEP-05)
- [x] 14-05-phase-verify-PLAN.md — Wave 4: phase-verify battery + REQUIREMENTS/ROADMAP/STATE flips + 14-SUMMARY.md

**No bridge package.json changes in this phase** — no mirror regen required.

---

### Phase 15: Graph Inspector Panel

**Goal:** Users can navigate the bitemporal graph through a visual time-travel inspector — a distinct WebviewPanel with Cytoscape.js rendering, a time-travel slider, and Graphify-style dark-theme node-type color coding.

**Depends on:** Phase 14 (KernelClient RPC pattern established; `ReadonlyKernelClient` interface defined)

**Requirements:** DEEP-02

**Wave-0 imperatives (before any feature code):**
- Define `kernelRowToCyElement()` projection utility — accepts a `NodeRow`, returns a `{ group: 'nodes', data: { id, kind, label, valid_from, invalidated_at } }` descriptor; the input `NodeRow` is never mutated (Wave-0 RED test: `structuredClone` before conversion, `assert.deepStrictEqual` after proves input unchanged)
- Define `GraphInspectorPanel` class stub with `VIEW_TYPE = 'goatide.graphInspector'` — RED test asserts this string differs from `CanvasPanel.VIEW_TYPE` (`'goatide.canvas'`)
- Confirm `cytoscape` placed in `devDependencies` (not `dependencies`) in bridge `package.json`; add esbuild config comment confirming webview-only placement

**Success Criteria** (what must be TRUE when Phase 15 completes):
1. User invokes "GoatIDE: Open Graph Inspector" from the command palette; a new panel opens (distinct from the Verification Canvas — different VS Code panel title, different tab) showing the bitemporal graph rendered with Cytoscape.js canvas renderer using the Graphify dark theme (`#0f172a` background, node-type color palette matching DecisionNode/ConstraintNode/ObservationNode/FileAnchorNode/SupersededNode taxonomy)
2. User drags the time-travel slider; nodes and edges visible in the inspector update to reflect only those active at the selected timestamp (`valid_from <= asOf AND (invalidated_at IS NULL OR invalidated_at > asOf)`); the inspector header displays "Viewing snapshot — graph is read-only" at all times
3. User opens the inspector on a graph with 500+ nodes; the panel remains responsive during pan/zoom (Cytoscape `hideEdgesOnViewport: true` active); fcose layout runs once on first open and positions are persisted to React state for subsequent shows
4. Bridge mirror `refuse-stale-bridge-mirror.sh` CI gate passes after adding `cytoscape` and `cytoscape-fcose` — verified by `ls extensions/goatide-bridge/node_modules | grep cytoscape` returning empty (both packages are `devDependencies` and excluded from the mirror)

**New packages:** `cytoscape@^3.33.0` + `cytoscape-fcose@^2.2.0` + `@types/cytoscape@^3.21` in bridge `devDependencies` (landed Plan 15-01)

**Bridge mirror regen REQUIRED** in this phase (`scripts/prepare_goatide.sh`). Plan 15-01 mirrored via direct cp; refuse-stale-bridge-mirror.sh exit 0.

**Plans:** 4/5 plans complete

| Plan | Description | Status | Date |
|------|-------------|--------|------|
| 15-01 | Wave-0 projection utilities + panel stub + cytoscape devDeps + SC#4 meta-test | DONE | 2026-05-14 |
| 15-02 | DEEP-02 RPC handler + KernelClient body (graph.queryGraphSnapshot + graph.queryTimelineTransitions) | DONE | 2026-05-14 |
| 15-03 | DEEP-02 host wiring (GraphInspectorPanel.getOrCreate + reveal + webview html + handler registration) | TBD | — |
| 15-04 | DEEP-02 webview render (App.tsx + Graph.tsx + slider + Cytoscape mount + fcose layout) | TBD | — |
| 15-05 | DEEP-02 phase-verify (5 SCs + playwright canvas-renderer smoke + close) | TBD | — |

**Wave-0 spike outcome (Plan 15-01 Task 8):** SPIKE FAIL — `cytoscape({container, elements: []})` throws "Could not create canvas of type 2d" under jsdom. Wave-3 (Plan 15-04) test surface splits: header/truncation/slider-RPC tests stay under mocha+jsdom; 500-node-smoke + position-persistence downgrade to playwright (Plan 15-05 phase-verify gate set).

---

### Phase 16: Ripple Analysis + Cross-Repo Schema Migration

**Goal:** Users can ask "what would break if this constraint were lifted?" and receive a confidence-weighted impact analysis in the Canvas; the graph schema is extended with `repo_id` namespacing to unblock cross-repo stitching.

**Depends on:** Phase 14 (DEEP-01 rationale chain context displayed alongside impact); Phase 15 (Graph Inspector exists as a soft dependency for DEEP-06-phase-B cross-repo view)

**Requirements:** DEEP-03, DEEP-06 (schema migration — phase-A; cross-repo UI ships in Phase 17 as phase-B)

**DEEP-06 split decision:** DEEP-06 is one requirement delivered in two phases. Phase 16 ships the backward-compatible `ALTER TABLE ADD COLUMN repo_id` migration and `queryByRepo()` DAO method. Phase 17 ships the cross-repo workspace enumeration command and UI. The primary phase mapping for DEEP-06 is Phase 16 (first delivery point); Phase 17 completes it.

**Wave-0 imperatives (before any feature code):**
- Author migration meta-test: `0008_cross_repo_identity.sql` must add `repo_id TEXT NOT NULL DEFAULT 'primary'` with backfill to both `nodes` and `edges`; a kernel vitest spec seeds two "repos" with identical ULID sequences (mock `ulid()`) and confirms `repo_id` namespacing prevents collision. (Note: ROADMAP originally referenced `0007_*`; reconciled to `0008_*` during Phase 16 close — `0007_contract_overrides_metric.sql` already existed on master from Phase 7 DRIFT-06. See 16-SUMMARY.md decisions ledger.)
- Define SHA-256 fingerprint helper `fingerprint(remoteUrl: string): string` using `crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)` — used as the canonical `repoId` value; never inject raw remote URL into SQL

**Success Criteria** (what must be TRUE when Phase 16 completes):
1. User opens the Canvas on a save touching a file anchored to a ConstraintNode; a "What would break if this constraint is lifted?" button appears in `DriftFindings.tsx`; clicking it calls `kernel.constraintLift()` and renders an "Hypothetical Impact" section listing affected nodes with confidence-weighted impact scores (0.0–1.0); the result is labelled "Hypothetical" and no graph rows are written (Mandate B: `queryByKind('Attempt')` count unchanged)
2. The DEEP-03 ripple analysis returns results up to a configurable depth (default 3 hops) with a `confidence_threshold` filter; high-confidence edges (from Explicit-confidence nodes) appear first; a "show all" toggle surfaces lower-confidence edges
3. After the Phase 16 migration runs, `sqlite3 ~/.goatide/graph.db ".schema nodes"` shows `repo_id TEXT NOT NULL DEFAULT 'primary'`; all existing graph rows have `repo_id = 'primary'`; the existing `queryAsOf()`, `queryByAnchor()`, and `traverse()` calls return correct results unchanged (migration is backward-compatible, no existing functionality broken)
4. `queryByRepo('primary', asOf)` returns only primary-repo nodes; the `INDEX nodes_repo_id` exists (verified via `.indices nodes`); `queryByAnchor` without an explicit `repoId` implicitly scopes to `repo_id = 'primary'`

**No bridge package.json changes in this phase** — no mirror regen required.

**Plans:** 5/5 — CLOSED 2026-05-15

- [x] 16-01-wave0-migration-fingerprint-stubs-PLAN.md — Wave 0: migration 0008_cross_repo_identity.sql + drizzle schema + repo-fingerprint.ts + Wave-0 throw-stubs (dao.queryByRepo + constraint-lift.ts) + walkRippleEdges export + bridge mirror types + HypotheticalImpact stub + 8 RED tests + refuse-unbounded-ripple-walk widening + meta-test
- [x] 16-02-deep06-deep03-kernel-bodies-PLAN.md — Wave 1: dao.queryByRepo real body + queryByAnchor extension + constraint-lift.ts real body + graph.constraintLift handler under requireAuth + 13 RED → GREEN kernel tests + full-suite back-compat invariant
- [x] 16-03-deep03-bridge-transport-PLAN.md — Wave 2: KernelClient.constraintLift real body + CanvasPanel.registerConstraintLiftHandler + handleMessage branch + extension.ts wiring + tier-dispatch constraint_lift_eligible + Mandate B bridge regression (5 RED → GREEN)
- [x] 16-04-deep03-webview-ui-PLAN.md — Wave 3: DriftFindings conditional 'What would break?' button + HypotheticalImpact body (badge + radio + show-all) + App.tsx integration + styles.css extension + 6 RED → GREEN jsdom tests
- [x] 16-05-phase-verify-PLAN.md — Wave 4: full verification battery + SC#3 0008_cross_repo_identity.sql (reconciled from ROADMAP's 0007_* draft text) + REQUIREMENTS.md DEEP-03 closure + STATE.md update + 16-VERIFICATION.md + 16-SUMMARY.md + phase-close commit

---

### Phase 17: Cross-Repo UI + Polish Cluster

**Goal:** Users can stitch graphs across multiple repositories in a multi-root workspace and navigate cross-repo edges through the inspector; the extension provides a first-run walkthrough, configurable save-gate settings, an honest empty state for 0-citation receipts, and a compact hover receipt for benign-tier saves.

**Depends on:** Phase 15 (Graph Inspector panel — POLISH-01 walkthrough step 5 references it); Phase 16 (DEEP-06-phase-A schema migration — cross-repo traversal requires `repo_id` column); POLISH-02 must ship before POLISH-04 (benign tier setting governs hover behavior)

**Requirements:** DEEP-06 (cross-repo UI — phase-B completion), POLISH-01, POLISH-02, POLISH-03, POLISH-04

**Wave-0 imperatives (before any feature code):**
- `contributes.walkthroughs` registration smoke: a mocha unit test asserts that the walkthrough completion handler calls `context.globalState.update('goatide.onboardingComplete', true)` — NOT `WorkspaceConfiguration.update` (prevents the async-flush race that causes walkthrough reappearance after fast shutdown; see PITFALLS.md Pitfall 9)
- `getConfiguration` resource-scope unit test: asserts that `vscode.workspace.getConfiguration('goatide.saveGate', doc.uri)` uses the resource-scoped overload — not a global read — in the save-gate handler
- Bridge mirror regen meta-test: after adding `contributes.walkthroughs` + `contributes.configuration` to `package.json`, `refuse-stale-bridge-mirror.sh` must pass (ensures `scripts/prepare_goatide.sh` is run as part of this phase)

**Success Criteria** (what must be TRUE when Phase 17 completes):
1. User opens a VS Code multi-root workspace with 2+ git repositories; invokes "GoatIDE: Open Cross-Repo Graph"; the Graph Inspector opens showing nodes from all workspace repos, with each node's tooltip displaying its `repo_id` fingerprint; cross-repo edges (where `src.repo_id != dst.repo_id`) are visually distinguishable; the command degrades gracefully when `vscode.workspace.workspaceFolders` is `undefined` or length === 1 (shows an info notification "No multi-root workspace detected")
2. On first GoatIDE activation (fresh install), the VS Code Getting Started panel opens automatically with the GoatIDE walkthrough; the walkthrough covers 4-5 steps (Canvas overview, reading a Receipt, IntentDrift badge, save-gate settings link, Graph Inspector link); completing the final step sets `goatide.onboardingComplete` in `context.globalState` and the walkthrough does not reappear on the next launch
3. User opens VS Code Settings and navigates to the GoatIDE section; three native dropdown settings are visible (`goatide.saveGate.destructive`, `goatide.saveGate.highImpact`, `goatide.saveGate.benign`) with per-workspace scope; changing a setting takes effect on the next save without restarting the extension
4. User saves a file with no anchoring graph nodes; the Verification Canvas shows a non-blank empty state: an icon, "No rationale recorded yet" heading, and a "Add DecisionNode" call-to-action button — not the previous blank "Receipt: 0 citations" (and no LLM-generated rationale appears: Mandate A)
5. User makes a benign-tier save; instead of the full Canvas modal, a compact hover (or status-bar notification) appears with the receipt tier badge + top 2 citation labels + "Open full receipt" link; the hover does NOT appear for destructive-tier saves (full modal is required by Mandate D); the hover behavior respects the `goatide.saveGate.benign` setting

**Bridge mirror regen REQUIRED** in this phase (`scripts/prepare_goatide.sh`).

**Plans:** 3/5 plans executed

- [x] 17-01-wave0-stubs-tests-bridge-mirror-PLAN.md — Wave 0: package.json walkthroughs + 3 saveGate.* properties + 3 new commands + walkthrough-completion.ts + workspace-repos.ts + 6 RED tests + 2 new meta-tests (refuse-llm-in-canvas + refuse-stale-bridge-mirror-after-walkthrough) + 5 walkthrough markdown placeholders + bridge mirror regen via prepare_goatide.sh (CLOSED 2026-05-15)
- [ ] 17-02-polish02-polish04-saveGate-hover-PLAN.md — Wave 1: POLISH-02 resource-scoped getConfiguration read at dispatchTier entry + POLISH-04 dispatchHover private function (status-bar message + 'Open full receipt' fallback) + Mandate D byte-identity 3x3 matrix GREEN
- [ ] 17-03-polish01-polish03-walkthrough-emptyState-PLAN.md — Wave 2: POLISH-01 extension.ts wiring (registerWalkthroughCompletion + maybeAutoOpenWalkthrough + placeholder addDecisionNode command) + walkthrough markdown copy refinement + POLISH-03 CitationList.tsx empty-state JSX (icon + literal 'No rationale recorded yet' + CTA) + Mandate A static-text fence
- [ ] 17-04-deep06-phase-b-cross-repo-command-PLAN.md — Wave 3: Kernel wire-schema extension (SerializedNode/EdgeSnapshot gain repo_id + queryGraphSnapshot handler projects) + bridge Zod schema + wireToInspectorRow + edgeRowToCyElement crossRepo flag + Graph.tsx Cytoscape stylesheet selector + goatide.openCrossRepoGraph command + GraphInspectorPanel.getOrCreateForCrossRepo factory + Risk §5 Phase 15 fixture migration
- [ ] 17-05-phase-verify-PLAN.md — Wave 4: full verification battery (kernel + bridge suites + 5 CI gates + 5 meta-tests + freshclone-smoke SC#5 + bridge mirror byte-equal) + 5 manual checkpoint:human-verify items + REQUIREMENTS/ROADMAP/STATE flips + 17-VERIFICATION.md + 17-SUMMARY.md + v2.0 milestone closure + phase-close commit

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Fork Bringup | — | Closed | ~2026-04-29 |
| 01.1. Build Toolchain | — | Closed | ~2026-05-05 |
| 01.2. LFS Push-Ability | — | Closed | ~2026-05-05 |
| 02. Bitemporal Graph Substrate | — | Closed | ~2026-04-29 |
| 03. Edge Traversal + Receipt | — | Closed | ~2026-04-30 |
| 04. Verification Canvas | — | Closed | ~2026-05-06 |
| 05. Telemetry + Portability Filter | — | Closed | ~2026-05-06 |
| 06. MCP Gateway | — | Closed | ~2026-05-07 |
| 07. Drift Detection + Contract Locking | — | Closed | ~2026-05-07 |
| 08. Bridge Runtime Path Fixes | — | Closed | ~2026-05-10 |
| 09. Build & Launch Ergonomics | — | Closed | ~2026-05-10 |
| 10. Bridge Production Polish | — | Closed | ~2026-05-10 |
| 11. Visual Ceremony | — | Closed | ~2026-05-11 |
| 12. Robustness Hardening | — | Closed | 2026-05-12 |
| 13. v1.2 Closeout | — | Closed | 2026-05-13 |
| 14. Foundation RPCs | 5/5 | Closed | 2026-05-14 |
| 15. Graph Inspector Panel | 5/5 | Closed | 2026-05-15 |
| 16. Ripple Analysis + Cross-Repo Schema | 5/5 | Closed | 2026-05-15 |
| 17. Cross-Repo UI + Polish Cluster | 3/5 | In Progress|  |
