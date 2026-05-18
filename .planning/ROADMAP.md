# GoatIDE Roadmap

> **Reconstruction notice (2026-05-12):** Rebuilt after destructive subagent wiped `.planning/`. Phase 13 section is verbatim from this session's `roadmap get-phase 13` output (preserved in conversation context). Phases 01-12 are reconstructed one-line summaries derived from commit subjects — they accurately describe *what shipped* but the originally-authored Goal/Success-Criteria/Wave-Structure prose is gone. v2.0 milestone scope is locked per `project_v2_milestone_locked.md` but not yet broken into phases.

---

## Milestones

| Milestone | Status | Phases | Notes |
|-----------|--------|--------|-------|
| v1.0      | Closed | 01, 02 | Fork bringup + graph substrate |
| v1.1      | Closed | 03, 04, 05, 06, 07 | Traversal, Canvas, Telemetry, MCP, Drift |
| v1.2      | Closed (2026-05-13) | 08, 09, 10, 11, 12, 13 | Runtime fixes, ergonomics, polish, ceremony, hardening, closeout |
| v2.0      | Closed (2026-05-16) | 14, 15, 16, 17 | 10 requirements: DEEP-01..06, POLISH-01..04; C3 auto-update → v2.1 |
| v2.1      | Active (started 2026-05-16) | 18, 19, 20, 21, 22 | 4/5 phases closed (18, 19, 20, 21); Phase 22 (distribution) cert-gated |

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
- [x] **Phase 17: Cross-Repo UI + Polish Cluster** - Cross-repo stitching UI, onboarding, settings UI, empty-state, hover receipt (closed 2026-05-16)
- [x] **Phase 18: E2E Verification Gate** - Real installable build, bridge registration gap closed, 12/13 CDP smoke SCs pass (closed 2026-05-17)
- [x] **Phase 19: Walkthrough Foregrounding Fix** - GoatIDE walkthrough wins first-launch race against VS Code default (closed 2026-05-17)
- [x] **Phase 20: DecisionNode Authoring Write Path** ✓ Closed - addDecisionNode write path + post-hoc Reject button + Mandate A/B fence extensions
- [x] **Phase 21: Cross-Repo Activation (Single-DB)** - repo_id on 4 write RPCs + WorkspaceRepoState + native HTML title tooltip + first end-to-end cross-repo edge integration test (closed 2026-05-18)
- [ ] **Phase 22: Distribution (C1/C2/C3)** - macOS notarization, Windows Azure Trusted Signing, electron-updater auto-update

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

**Plans:** 5/5 plans executed — CLOSED 2026-05-16

- [x] 17-01-wave0-stubs-tests-bridge-mirror-PLAN.md — Wave 0: package.json walkthroughs + 3 saveGate.* properties + 3 new commands + walkthrough-completion.ts + workspace-repos.ts + 6 RED tests + 2 new meta-tests (refuse-llm-in-canvas + refuse-stale-bridge-mirror-after-walkthrough) + 5 walkthrough markdown placeholders + bridge mirror regen via prepare_goatide.sh (CLOSED 2026-05-15)
- [x] 17-02-polish02-polish04-saveGate-hover-PLAN.md — Wave 1: POLISH-02 resource-scoped getConfiguration read at dispatchTier entry + POLISH-04 dispatchHover private function (status-bar message + 'Open full receipt' fallback) + Mandate D byte-identity 3x3 matrix GREEN (CLOSED 2026-05-15)
- [x] 17-03-polish01-polish03-walkthrough-emptyState-PLAN.md — Wave 2: POLISH-01 extension.ts wiring (registerWalkthroughCompletion + maybeAutoOpenWalkthrough + placeholder addDecisionNode command) + walkthrough markdown copy refinement + POLISH-03 CitationList.tsx empty-state JSX (icon + literal 'No rationale recorded yet' + CTA) + Mandate A static-text fence (CLOSED 2026-05-16)
- [x] 17-04-deep06-phase-b-cross-repo-command-PLAN.md — Wave 3: Kernel wire-schema extension (SerializedNode/EdgeSnapshot gain repo_id + queryGraphSnapshot handler projects) + bridge Zod schema + wireToInspectorRow + edgeRowToCyElement crossRepo flag + Graph.tsx Cytoscape stylesheet selector + goatide.openCrossRepoGraph command + GraphInspectorPanel.getOrCreateForCrossRepo factory + Risk §5 Phase 15 fixture migration (CLOSED 2026-05-16)
- [x] 17-05-phase-verify-PLAN.md — Wave 4: full verification battery (kernel 408/408 + bridge 122 passing + 5 CI gates + 5 meta-tests + freshclone-smoke SC#5 5/5 + bridge mirror byte-equal) + autonomous CDP smoke (10/12 SCs PASS) + REQUIREMENTS/ROADMAP/STATE flips + 17-VERIFICATION.md + 17-SUMMARY.md + v2.0 milestone closure + phase-close commit (CLOSED 2026-05-16)

**What shipped:**

- **DEEP-06 phase-B:** `goatide.openCrossRepoGraph` command with graceful degradation (single-folder shows info notification; multi-root opens Cross-Repo Inspector). `GraphInspectorPanel.getOrCreateForCrossRepo` factory reuses single panel singleton (Pitfall 2 avoidance). Cytoscape stylesheet `edge[?crossRepo]` selector with dashed amber-400 styling. Kernel wire-schema extended: `SerializedNodeSnapshot`/`SerializedEdgeSnapshot` carry `repo_id` projected from SQLite. Bridge Zod schemas + `wireToInspectorRow` + `edgeRowToCyElement` carry `crossRepo` boolean. Single-DB deployment model: all v2.0 nodes carry `repo_id='primary'`; multi-daemon orchestration deferred to v2.1.
- **POLISH-01:** First-run `contributes.walkthroughs` (5 steps covering Canvas, Receipt, IntentDrift, settings, Graph Inspector). `registerWalkthroughCompletion` writes `goatide.onboardingComplete` to `context.globalState` (NOT `WorkspaceConfiguration` — Pitfall 9 fence). `maybeAutoOpenWalkthrough` fires at activation. N3 ordering invariant documented. Walkthrough is registered + visible; foregrounding is a v2.1 polish item.
- **POLISH-02:** `contributes.configuration` 3 `saveGate.*` properties as resource-scoped native dropdowns (`destructive` enum=[block,confirm], `highImpact` enum=[block,confirm,suppress], `benign` enum=[modal,hover,suppress]). Resource-scoped `getConfiguration('goatide.saveGate', doc.uri)` at `dispatchTier` entry; changes effective on next save without reload.
- **POLISH-03:** `CitationList.tsx` empty-state replaces blank "Receipt: 0 citations" with info-circle icon + BYTE-EXACT literal "No rationale recorded yet" heading + body paragraph + "Add DecisionNode" CTA wired to `goatide.canvas.addDecisionNode` (v2.1 informational placeholder). Mandate A structural fence via `refuse-llm-in-canvas.meta.sh`.
- **POLISH-04:** `dispatchHover` private function in `tier-dispatch.ts` routes benign-tier saves to ephemeral status-bar message (top-2 citation labels + 4s auto-dismiss + "Open full receipt" fallback). Mandate D: destructive saves NEVER de-escalate via benign setting; 4x3 byte-identity matrix test.

**Verification:** Kernel 408/408 PASS. Bridge 122 passing / 16 pre-existing failures / 0 new failures. 5/5 CI gates OK. 5/5 meta-tests META PASS. SC#5 freshclone-smoke 5/5. Autonomous CDP smoke (phase17-smoke-cdp.cjs) 10/12 SCs PASS.

**Requirements closed:** DEEP-06 phase-B, POLISH-01, POLISH-02, POLISH-03, POLISH-04

**v2.0 milestone note:** This phase closes the v2.0 milestone (10/10 requirements: DEEP-01..06 + POLISH-01..04). C3 deferred to v2.1. v2.0 ships as manual-install build. v2.1 scope: C1/C2/C3 distribution + multi-daemon cross-repo writes + DecisionNode authoring UI + walkthrough foregrounding.

---

## v2.1 Milestone — Verify + Ship (started 2026-05-16)

**Requirements:** 14 (VERIFY-01..05, WALK-01, AUTH-01..04, XREPO-01..03, C1, C2, C3)
**Sequencing:** Phase 18 verification gates all subsequent work. Phase 22 distribution is gated on external cert procurement.
**Granularity:** Standard (5 phases from 5 natural delivery boundaries).

---

### Phase 18: E2E Verification Gate

**Goal:** Users can install and run GoatIDE as a real binary — not dev-mode — and every v2.0 feature visible in the CDP smoke is reachable from the installed application.

**Closed:** 2026-05-17

**Depends on:** Phase 17 closed (v2.0 baseline established)

**Requirements:** VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05

**Wave-0 imperatives (before any feature code):**
- Decide test-package vs GA-package Electron fuse strategy: test-package keeps `EnableNodeCliInspectArguments` fuse ON for CDP automation; GA package may disable for security. Both build targets reachable from `electron-builder.test.yml` + `electron-builder.yml`.
- Diagnose SC11/SC12 root cause from Phase 17 CDP smoke (suspected: bridge registration gap + settings UI render path — confirm by inspecting the installed binary's `extensions/goatide-bridge/` contents and checking if the real bridge loads).
- Assert zero requests to `code.visualstudio.com` in the test-package smoke (Pitfall H pre-fence: VS Code IUpdateService polling must not fire even before Phase 22 wires electron-updater).

**Success Criteria** (what must be TRUE when Phase 18 completes):
1. Running `scripts/package-goatide.sh` produces a `.dmg` (macOS) or NSIS `.exe` (Windows) installable artifact via `electron-builder --prepackaged .build/VSCode-<platform>`; the kernel sidecar is excluded from ASAR (`asarUnpack: ["kernel/**"]`) so `better_sqlite3.node` loads correctly at the Electron ABI; `electron-builder.yml` lives at repo root and does not conflict with the existing gulp pipeline.
2. Installing the GoatIDE artifact and launching it on a clean machine loads the real bridge (not the stub `extensions/goatide-bridge/` empty stub): the Verification Canvas opens on a file save, the Graph Inspector command is reachable from the palette, and the save-gate destructive prompt appears — confirming `scripts/prepare_goatide.sh` ran during packaging and the bridge mirror is not stale.
3. The extended `scripts/test/phase18-smoke-cdp.cjs` harness achieves 12/13 SCs PASS against the test-package binary (SC3b walkthrough foregrounding SOFT-FAIL deferred to Phase 19 WALK-01 — not counted in gate); root cause of SC11/SC12 was diagnosed and fixed before the harness extension.
4. The test-package vs GA-package build split is documented in `electron-builder.test.yml` and `electron-builder.yml`; the test package has the `EnableNodeCliInspectArguments` Electron fuse ON; the GA package has it OFF; both are buildable from the same `scripts/package-goatide.sh` with a `--test` flag.
5. A manual UAT checklist walk of the installed GA binary confirms all v2.0 user-visible surfaces function on the installable: walkthrough visible in Getting Started panel (foregrounding fix is Phase 19), Canvas tier dispatch fires on save, Graph Inspector opens, destructive save-gate confirmation prompt appears, settings UI exposes 3 saveGate properties, empty-state CTA is visible, dispatchHover status-bar message appears for benign saves, `goatide.openCrossRepoGraph` shows graceful single-folder notification.

**Plans:** 5/5 plans complete

- [x] 18-01-wave0-diagnostics-spikes-PLAN.md — Wave 0: SC11/SC12 dev-mode capture + Pitfall H pre-fence + Open Question spikes (CLOSED 2026-05-16)
- [x] 18-02-electron-builder-package-script-PLAN.md — Wave 1: electron-builder.yml + electron-builder.test.yml + scripts/package-goatide.sh + root devDep (CLOSED 2026-05-17)
- [x] 18-03-phase18-smoke-harness-PLAN.md — Wave 2: scripts/test/phase18-smoke-cdp.cjs (13 SCs against installed test-package) + first-run capture (CLOSED 2026-05-17)
- [x] 18-04-sc11-sc12-fixes-PLAN.md — Wave 3: win-unpacked gap investigation + final SCORE 12/13 confirmed + sandbox:true root cause documented (CLOSED 2026-05-17)
- [x] 18-05-uat-closeout-PLAN.md — Wave 4: 18-UAT-CHECKLIST.md (8/8 AUTO-APPROVED) + REQUIREMENTS/ROADMAP/STATE flips + 18-VERIFICATION.md + 18-SUMMARY.md (CLOSED 2026-05-17)

**What shipped:**
- `electron-builder.yml` (GA profile, hardened fuses, `asarUnpack: ["kernel/**"]`, `npmRebuild: false`) + `electron-builder.test.yml` (extends base, CDP-attachable fuses, `dist/test/` output). Both buildable via `scripts/package-goatide.sh [--test]`. VERIFY-01 + VERIFY-04 CLOSED.
- `scripts/package-goatide.sh`: 5-step orchestration (prepare → bridge fallback → refuse-stale → gulp → kernel-inject → electron-builder). Bridge registration gap closed at packaging time. VERIFY-02 CLOSED.
- `scripts/test/phase18-smoke-cdp.cjs`: 13-SC CDP smoke harness. 12/13 PASS, EXIT 0. SC3b deferred to Phase 19. SC13 CDN gate: 0 hits. VERIFY-03 CLOSED.
- `18-UAT-CHECKLIST.md`: 8/8 AUTO-APPROVED (user fast-track basis documented). VERIFY-05 CLOSED.
- Key finding: GA binary is not CDP-attachable due to `sandbox: true` webPreferences (sandbox:true, NOT fuses). Dev-mirror mode accepted as permanent automated gate. Phase 22 owns the fix.

---

### Phase 19: Walkthrough Foregrounding Fix

**Goal:** A user who installs GoatIDE for the first time sees the GoatIDE walkthrough in the VS Code Getting Started panel — not VS Code's default "Setup VS Code" walkthrough — without having to manually navigate to it.

**Depends on:** Phase 18 (installable binary verified; SC3b currently SOFT-FAIL on the installed build; fix is validated against the installed binary)

**Requirements:** WALK-01

**Wave-0 imperatives (before any feature code):**
- Inspect `product.json` in VS Code 1.117.0 source to confirm whether `configurationDefaults` key is honoured for `workbench.startupEditor`. If supported, use `"workbench.startupEditor": "none"` in `product.json configurationDefaults` (cleanest fix; no code change). If not supported, fall back to `setTimeout(2000ms)` + double-invoke `workbench.action.openWalkthrough` in `maybeAutoOpenWalkthrough` (VS Code issue #187958 workaround).
- Verify the GoatIDE walkthrough identifier matches exactly what was registered in Phase 17 POLISH-01 (confirm the actual registered ID string in `extension.ts`).
- Confirm that `product.json` changes survive the brander script — add Wave-0 assertion that the brander preserves the `configurationDefaults` key across upstream-sync.

**Success Criteria** (what must be TRUE when Phase 19 completes):
1. On a clean GoatIDE install (fresh user data directory, no prior GoatIDE state), launching the installed binary opens the GoatIDE walkthrough foregrounded in the Getting Started panel — the VS Code "Setup VS Code" walkthrough is not selected; the GoatIDE walkthrough is the active tab.
2. On a second launch of the same install (after the first-run walkthrough was shown), the walkthrough does NOT auto-open again — the `context.globalState` fence (`goatide.onboardingComplete`) prevents re-showing; no regression of Phase 17 POLISH-01's Pitfall 9 mitigation.
3. The Phase 17 CDP smoke SC3b ("walkthrough registered in the Getting Started panel DOM and foregrounded") flips from SOFT-FAIL to PASS in the Phase 18 test-package harness after the Phase 19 fix lands.

**Plans:** 3/4 plans complete
- [x] 19-01-wave0-red-stubs-PLAN.md -- Wave 0: RED stubs for configurationDefaults static + startupEditor runtime probe + brander meta-test (CLOSED 2026-05-17)
- [x] 19-02-primary-fix-configurationDefaults-PLAN.md -- Wave 1: bridge package.json contributes.configurationDefaults + mirror sync (CLOSED 2026-05-17)
- [SKIPPED] 19-03-conditional-fallback-double-invoke-PLAN.md -- Wave 2: SKIPPED (runtime_probe GREEN in Wave 1); setTimeout 2000ms double-invoke implemented as Rule 1 auto-fix during 19-04 execution
- [x] 19-04-phase-verify-sc3b-flip-PLAN.md -- Wave 3: SC3b DOM-based detection, SOFT-FAIL -> PASS, 3-run flakiness fence 3/3 EXIT 0 + closure ceremony (CLOSED 2026-05-17)

**Closed:** 2026-05-17

---

### Phase 20: DecisionNode Authoring Write Path

**Goal:** Users can explicitly author a DecisionNode from within the IDE — via command palette or the empty-state CTA — and the new node appears as a citation on their next save; users can also post-hoc reject a benign-tier save attempt.

**Depends on:** Phase 19 (both phases touch `extension.ts` and `tier-dispatch.ts`; sequential landing avoids conflicts in high-traffic shared files)

**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04

**Wave-0 imperatives (before any feature code):**
- Extend `refuse-deep05-write.sh` BANNED array to include the new write RPC token (`createDecisionNode` or whichever name is chosen) BEFORE any authoring or inspector-adjacent code is written — Mandate B fence must be in place before the write surface exists (Pitfall C).
- Extend `refuse-llm-in-canvas.meta.sh` Mandate A fence to cover host-side authoring files (`canvas/authoring-*.ts` and `canvas/panel.ts`) — the current fence scans only `canvas/webview/*`; the host side is the v2.0 blind spot (Pitfall B).
- Decide the write RPC name and add it to the BANNED array; document the choice. NEVER add this RPC to `ReadonlyKernelClient`.
- Author a RED unit test asserting `textarea.value === ''` (empty string) when the DecisionNode form opens — Mandate A: form body must never be pre-populated from kernel data or any LLM source.
- Write a RED unit test confirming the Reject button NEVER renders on destructive-tier saves — byte-identity matrix test extension (Mandate D).

**Success Criteria** (what must be TRUE when Phase 20 completes):
1. User invokes "GoatIDE: Add DecisionNode" from the command palette (or clicks the "Add DecisionNode" CTA in the empty-state canvas); a multi-step flow prompts for anchor selection (from the current file's known anchors) and a human-authored rationale text; on confirmation, the DecisionNode is written to the graph via the new `graph.createDecisionNode` kernel RPC (departed from original ROADMAP wording per Phase 20 research Pitfall A — `proposeEdit`/`atomicAccept` operate on file diffs and create Attempt nodes, not DecisionNodes; the new RPC is the correct primitive); a success notification shows the new node ID and "It will appear as a citation on your next save."
2. User makes a benign-tier save and sees the `dispatchHover` status-bar message; the message includes a "Reject" action button; clicking Reject shows a confirmation modal; confirming calls `kernel.recordRejection(attemptId)` and the attempt is marked rejected in the graph. The Reject button NEVER appears on destructive-tier saves (Mandate D — byte-identity matrix test extended to cover this).
3. `refuse-llm-in-canvas.meta.sh` CI gate passes against all host-side authoring files (`canvas/panel.ts`, `canvas/authoring-*.ts`) in addition to the existing `canvas/webview/*` scope — positive test: a clean authoring file passes; negative test: a file importing a forbidden LLM token fails.
4. `refuse-deep05-write.sh` BANNED array includes the v2.1 write RPC token and the CI gate fails if any file under `inspector/` imports it — Mandate B fence covers the new write surface before any inspector UI is written.

**Plans:** 5/5 plans complete

- [x] 20-01-wave0-fences-red-stubs-PLAN.md -- Wave 0: AUTH-03/04 fence extensions + 7 RED stubs + Mandate D matrix extension (CLOSED 2026-05-18)
- [x] 20-02-kernel-rpc-bridge-client-PLAN.md -- Wave 1: graph.createDecisionNode kernel RPC + bridge KernelClient method (CLOSED 2026-05-18)
- [x] 20-03-authoring-flow-and-command-swap-PLAN.md -- Wave 2: canvas/authoring-flow.ts multi-step flow + extension.ts command body swap (CLOSED 2026-05-18)
- [x] 20-04-reject-button-dispatchHover-PLAN.md -- Wave 2: dispatchHover Reject branch + recordRejection wiring (CLOSED 2026-05-18)
- [x] 20-05-phase-verify-and-closure-PLAN.md -- Wave 3: full-suite verify + 3-run flakiness fence + REQUIREMENTS/ROADMAP/STATE flips + 20-VERIFICATION + 20-SUMMARY (CLOSED 2026-05-18)

**Closed:** 2026-05-18

---

### Phase 21: Cross-Repo Activation (Single-DB Multi-Repo) -- Closed 2026-05-18

**Goal:** Users working in a VS Code multi-root workspace see real cross-repo edges in the Graph Inspector when a save in one repo cites a node from another repo's graph -- the dormant `edge[?crossRepo]` Cytoscape styling fires for the first time.

**Depends on:** Phase 20 (both phases modify `tier-dispatch.ts` and kernel write RPC signatures; sequential landing avoids conflicts)

**Requirements:** XREPO-01, XREPO-02, XREPO-03

**Closed:** 2026-05-18

**Plans:** 4/4 plans complete

- [x] 21-01-wave0-fences-red-stubs-adr-PLAN.md -- Wave 0: ADR + dbPath-keyed daemon fence + 10 RED/GREEN test stubs + WorkspaceRepoState skeleton (CLOSED 2026-05-17)
- [x] 21-02-kernel-params-bridge-threading-PLAN.md -- Wave 1: kernel write-RPC repo_id? params on 4 RPCs + bridge mirror + WorkspaceRepoState implementation + tier-dispatch threading (CLOSED 2026-05-18)
- [x] 21-03-xrepo03-tooltip-integration-PLAN.md -- Wave 2: workspace_repos folder_name wire schema + native HTML title tooltip + cross-repo-edge-activation integration test (CLOSED 2026-05-18)
- [x] 21-04-phase-verify-and-closure-PLAN.md -- Wave 3: full-suite verify + 3-run flakiness fence + 21-VERIFICATION.md + 21-SUMMARY.md + REQUIREMENTS/ROADMAP/STATE closure flips (CLOSED 2026-05-18)

**What shipped:**

- XREPO-01: Optional `repo_id?: string` added to 4 kernel write-RPC params interfaces (`ProposeEditParams`, `AtomicAcceptParams`, `RecordRejectionParams`, `RecordContractOverrideParams`); 3 handlers persist `repo_id ?? 'primary'` into `provenance.detail`; dbPath-keyed daemon fence rejects same-DB second opener; backward-compat preserved (all 2-arg call sites continue to work).
- XREPO-02: `WorkspaceRepoState` bridge module under `save-gate/`; `getActiveRepoId` fingerprints git remote URL (12-char SHA-256 hex) or returns `'primary'`; cache invalidation on `onDidChangeWorkspaceFolders`; repo_id threaded through tier-dispatch/apply-edit/on-will-save/pending-attempts with single-source-of-truth in `handleProposedSave`; `queryByAnchor` Path B (undefined skips WHERE predicate for cross-repo opt-in).
- XREPO-03: `workspace_repos[].folder_name` added to wire schema; Graph.tsx `buildRepoLabel` pure function + Cytoscape mouseover/mouseout native HTML title tooltip (zero new deps, Pitfall G defense); end-to-end `cross-repo-edge-activation.integrationTest.ts` proves Phase 16+17+21 chain; dormant Phase 17 `edge[?crossRepo]` selector ACTIVATED for the first time.

**Success Criteria** (what must be TRUE when Phase 21 completes):
1. In a VS Code multi-root workspace with 2+ git repositories, saving a file in repo-A that cites a node from repo-B's graph causes a cross-repo edge to appear in the Graph Inspector (`edge[?crossRepo]` Cytoscape selector fires, rendering as dashed amber-400 per `PALETTE.crossRepoEdge`); the Inspector node tooltip shows the `repo_id` fingerprint (12-char hex) and a readable repo name derived from the workspace folder name.
2. `tier-dispatch.ts` reads `WorkspaceRepoState.getActiveRepoId()` on every save and passes the `repo_id` through `proposeEdit` and `atomicAccept` RPCs; all existing 2-arg call sites (tests + extension.ts wiring) continue to work without modification (backward-compat: `repo_id` defaults to `'primary'`).
3. The single-DB model is preserved -- one kernel daemon, one `graph.db`, `repo_id` column partitions rows; the kernel startup guard rejects a second readwrite opener on the same DB path with a clear error message; no new DB file is created for secondary workspace repos.

---

### Phase 22: Distribution (C1/C2/C3)

**Goal:** Users can download a signed, notarized GoatIDE installer from GitHub Releases, install it without security warnings, and receive in-app notifications when a newer release is available.

**Depends on:** Phase 21 (all graph features verified on the installable binary before adding updater complexity to Electron main process; `main.ts` has widest blast radius — land last); external preconditions: Apple Developer account + Azure Trusted Signing account must be provisioned before Phase 22 begins.

**Requirements:** C1, C2, C3

**Wave-0 imperatives (before any feature code):**
- External cert procurement gate: Apple Developer ID Application certificate and Azure Trusted Signing account must be verified as available. If certs are not yet provisioned, ship an unsigned installable for self-testing and document Phase 22 as blocked on cert procurement.
- Stub VS Code's `IUpdateService` as a no-op in the DI container BEFORE wiring `electron-updater` — prevents the dual-updater crash where VS Code's built-in updater polls `code.visualstudio.com` and races with electron-updater (Pitfall H).
- Add `dev-app-update.yml` to `.gitignore` before the file is created — electron-updater generates this file locally; committing it leaks the update URL configuration.
- Author `goatideUpdater.ts` stub with `VSCODE_DEV` guard (`if (process.env.VSCODE_DEV) return;`) as the first line — RED test asserts the guard fires in test environment before any updater initialization.

**Success Criteria** (what must be TRUE when Phase 22 completes):
1. On macOS, downloading the GoatIDE `.dmg` from GitHub Releases and opening it does not produce an "app is damaged" Gatekeeper error — the DMG is notarized via `@electron/notarize` notarytool, `better_sqlite3.node` and all `.node` files are re-signed with the hardened runtime in the `beforeSign` hook, and `xcrun stapler staple` embeds the notarization ticket in the DMG so offline installs validate without Apple CDN access.
2. On Windows, the GoatIDE NSIS installer is signed via Azure Trusted Signing; running the installer shows the publisher name in the SmartScreen dialog (if shown) rather than "Unknown Publisher"; `signtool verify /pa GoatIDE-Setup.exe` exits 0.
3. On a GoatIDE install that is one or more versions behind the latest GitHub Release, the app surfaces an in-app notification "GoatIDE update available (vX.Y.Z) — Restart Now / Later" within the first launch after the new release is published; clicking "Restart Now" applies the NSIS/DMG update; the updater NEVER fires when `VSCODE_DEV` is set (dev-mode guard, enforced by unit test); VS Code's built-in `IUpdateService` is stubbed to no-op so no duplicate update logic runs.

**Plans:** 4/5 plans executed

**Plan 22-01:** Closed -- Wave-0 fences + electron-builder Wave-1 baseline

**Plan 22-02:** Closed cert-gated -- C1 macOS signing infrastructure complete (electron-builder.yml hooks + entitlements plists + @electron/notarize); live signed-build UAT deferred to CI (Windows host, Apple Developer ID secrets not yet available). Next: Plan 22-03 (C2 Windows Azure Trusted Signing config, also cert-gated).

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
| 17. Cross-Repo UI + Polish Cluster | 5/5 | Closed | 2026-05-16 |
| 18. E2E Verification Gate | 5/5 | Complete    | 2026-05-17 |
| 19. Walkthrough Foregrounding Fix | 3/4 | Complete    | 2026-05-17 |
| 20. DecisionNode Authoring Write Path | 5/5 | Complete    | 2026-05-18 |
| 21. Cross-Repo Activation (Single-DB) | 4/4 | Complete | 2026-05-18 |
| 22. Distribution (C1/C2/C3) | 4/5 | In Progress|  |

