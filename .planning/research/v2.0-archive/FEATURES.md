# Feature Research

**Domain:** VS Code fork — bitemporal graph IDE (v2.0 deep features + polish + Windows auto-update)
**Researched:** 2026-05-13
**Confidence:** HIGH for POLISH-01/02/03/04 and C3 (official VS Code API patterns verified); MEDIUM for DEEP-01/03/04/05/06 (GoatIDE-novel, no direct ecosystem comparator); MEDIUM for DEEP-02 (reference repo visual conventions verified via source inspection)

---

## Scope Notice

This document covers ONLY the 11 new v2.0 capabilities. Existing v1.x features (Verification Canvas, Drift Detection, Telemetry, MCP Gateway, save-gate, Bridge, bitemporal graph substrate) are already shipped and are listed only when a v2.0 feature depends on them.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a user of a "graph-anchored agent IDE" assumes must work. Missing any of these makes the v2.0 release feel unfinished or hostile.

| Feature | Why Expected | Complexity | Requirement ID |
|---------|--------------|------------|----------------|
| First-run walkthrough explaining Canvas + Receipts before first save-gate encounter | Any IDE or VS Code extension with novel UI must orient the user before the UI appears in anger — otherwise the first encounter is the gate blocking work | SMALL | POLISH-01 |
| Settings UI knobs for save-gate strictness (block / confirm / suppress per tier) | Power users expect config files for this; casual users expect the Settings UI. Shipping v2.0 without configurable gate behavior forces every user to read source code to understand how to soften the gate | SMALL | POLISH-02 |
| Meaningful empty state when Canvas has 0 citations | A blank panel with "Receipt: 0 citations" is standard-UX failure — users interpret blank as broken | SMALL | POLISH-03 |
| Hover-driven compact receipt for low-tier (benign) saves | Full modal for every benign save is a flow-breaker. Users coming from Copilot/Cursor expect inline hints, not dialogs. The existing full Canvas works for destructive/high-impact tiers; benign should be lighter | SMALL | POLISH-04 |
| Windows auto-update so users are not permanently on the install version | Any distribution channel users trust implies auto-update. A solo-dogfood IDE without auto-update means manual reinstall for every release | MEDIUM | C3 |
| Rationale query answering "why does this code exist" from graph | The core pitch of GoatIDE's "Company Brain" is answering attribution questions. If v2.0 ships without this, the graph substrate (v1.0–v1.2) has no user-visible payoff beyond drift detection | MEDIUM | DEEP-01 |
| Proactive surfacing when active code conflicts with a superseded decision | IntentDrift already ships for contract-level drift. Extending it to historical supersession is the *expected completion* of that feature — users who understand the v1.x drift badge will immediately ask "does it know about old decisions?" | MEDIUM | DEEP-04 |

### Differentiators (Competitive Advantage)

Features that no existing tool (Copilot, Cursor, Continue, Codeium) provides because they lack a bitemporal append-only graph substrate.

| Feature | Value Proposition | Complexity | Requirement ID |
|---------|-------------------|------------|----------------|
| Visual time-travel Graph Inspector (DEEP-02) | Competitors show code state at a point in time (git blame, git log). GoatIDE's graph shows *why* code evolved through time — decisions, constraints, supersessions. The Cytoscape.js `<input type="range">` time-slider filtering `valid_from`/`valid_to` bitemporal fields is impossible in git-only tools. Graphify-style dark theme with node-type color coding (rationale nodes distinct from code nodes) and code-review-graph-style community toggle + degree-scaled sizing for large repos | LARGE | DEEP-02 |
| Constraint-lift ripple analysis (DEEP-03) | No existing tool answers "what would break if we removed this architectural constraint?" Competitors answer "what calls this function?" (structural). DEEP-03 answers with confidence-weighted impact scores along outgoing graph edges — a qualitatively different class of information | MEDIUM | DEEP-03 |
| Session-priority lens re-ranking receipts without graph mutation (DEEP-05) | Competitors filter suggestions by file relevance or recency. GoatIDE re-ranks drift findings and receipt citations by the *semantic priority* of the current session (e.g., "I am working on auth hardening") without writing to the graph — preserving Mandate B append-only integrity while giving the user a personalized relevance view | MEDIUM | DEEP-05 |
| Cross-repo graph stitching (DEEP-06) | Git tools stop at repo boundaries. GoatIDE's `repoId`-tagged graph traversal lets a user working in a microservice workspace ask "what contracts does this service share with the payments repo?" — a query that requires edges across repos in the same bitemporal graph. Cross-repo traversal without requiring a monorepo or external graph DB is a first-class differentiator | LARGE | DEEP-06 |

### Anti-Features (Explicitly NOT Building)

Features that seem natural extensions but violate GoatIDE's founding mandates or create architectural debt.

| Feature | Why Requested | Why Problematic | Mandate Violated | Alternative |
|---------|---------------|-----------------|------------------|-------------|
| Timeline scrubber that mutates graph state ("restore to point in time") | Visual time-travel implies restore. Users will ask for it | Violates Mandate B (append-only bitemporal, no mutation). "Restoring" would require hard-deleting or backdating provenance rows, destroying the audit trail that is the product's core value | **Mandate B** | DEEP-02 time-slider is read-only: it changes what the *inspector shows*, not what is stored. The graph never changes. Make this explicit in the inspector UI ("viewing snapshot — graph is not modified") |
| LLM inference to fill in missing rationale nodes ("why probably exists") | If DEEP-01 returns 0 citations, users want an answer anyway | Violates Mandate A (no-prompt: GoatIDE surfaces rationale from the graph, not from LLM inference) and Mandate C (no vector search). LLM inference without graph citations produces confident-sounding hallucinations about code history | **Mandate A + C** | POLISH-03 improved empty state: honest "no rationale recorded yet" with CTA to add a DecisionNode. DEEP-01 should return partial chains rather than no answer |
| Vector similarity search over graph nodes ("find nodes semantically similar to X") | Graph navigation feels like a search problem; embedding-based fuzzy matching is the obvious solution | Violates Mandate C (no vector search). GoatIDE's retrieval model is graph traversal over typed edges + AnchorResultCache. Adding vector retrieval introduces a dual-retrieval path that will create inconsistency between "find by anchor" and "find by similarity" | **Mandate C** | Anchor-based lookup + edge traversal with BFS depth controls (already in TRAV-01..06). DEEP-02 inspector adds community toggling and text search over node labels (like code-review-graph fallback pattern) |
| Auto-populating DecisionNodes from git commit messages via LLM parsing | Users want the graph populated automatically | Violates Mandate A (no-prompt) if LLM is involved. Also violates Mandate D (verification-first) — auto-populated rationale bypasses the Canvas/Receipt verification loop | **Mandate A + D** | The portability filter (PORT-01..06 via Telemetry Harvester) already harvests Claude JSONL for structured observations. Let users promote telemetry observations into graph nodes via the existing promoter flow rather than auto-creating unverified nodes |
| Allowing DEEP-03 ripple analysis to propose automatic constraint deletion | The ripple analysis result might suggest "lift this constraint — low impact". An auto-apply button would be natural | Violates Mandate D (verification-first). No graph mutation should happen without a Canvas/Receipt review cycle | **Mandate D** | DEEP-03 surfaces the analysis in the Canvas (as a new receipt variant) and requires the user to invoke the existing override flow to act on it |
| IntentDrift badge auto-suppressing saves when historical conflict detected (DEEP-04) | Drift detection could short-circuit the save automatically | Violates Mandate D (verification-first). Auto-blocking without user verification is the same failure mode as HARDEN-01 caught (P0 auto-save bypass). The badge must inform, not veto | **Mandate D** | DEEP-04 surfaces the historical conflict in the Canvas during the existing save-gate flow, same tier-dispatch path. User sees the conflict and chooses to proceed, override, or abort |
| Cross-repo graph pulling data from external databases or cloud graph services | DEEP-06 cross-repo sounds like it needs a shared server | Mandates require local-first. Pulling data from a cloud graph service creates privacy concerns with the portability filter and breaks the "no external dependency at runtime" architecture | Architecture constraint | DEEP-06 stitches graphs from local workspace folders only — all `repoId`-tagged nodes live in the local SQLite kernel. No network calls for traversal |
| Squirrel.Windows as the Windows auto-update mechanism | Squirrel.Windows is VS Code's historical choice; forking VS Code might seem to inherit it | electron-builder has explicitly deprecated Squirrel.Windows and removed auto-update support for it. VS Code's Squirrel pipeline requires Microsoft's `updateUrl` CDN — GoatIDE cannot write to it | N/A (ecosystem deprecation) | electron-builder NSIS + electron-updater with GitHub Releases publish provider — confirmed current best practice per electron-builder 26.x docs |

---

## Detailed Feature Behavior

### DEEP-01: Rationale Chain Query

**Table stakes behavior:**
- User invokes from the Verification Canvas ("Why does this exist?") for any file or selection
- System executes `kernel.queryRationaleChain(anchor, asOf)` — recursive CTE walk over ConstraintNodes and DecisionNodes that anchor the changed file/symbol
- Canvas renders an ordered list of rationale chain items: `[NodeType] [Label] — [valid_from timestamp] — [confidence: Explicit | Inferred]`
- If chain has 0 items: POLISH-03 empty state ("No rationale recorded for this anchor. Add a DecisionNode to start the chain.")
- Response appears within the same Canvas modal as existing CitationList — no new panel

**Differentiator behavior:**
- Bitemporal `asOf` parameter means the query returns the rationale chain *as it existed when the save was made*, not the current graph state — a time-anchored answer competitors cannot provide
- Confidence scoring (Explicit vs Inferred) is displayed per chain item so the user knows which nodes were directly recorded vs inferred via edge traversal

**Complexity:** MEDIUM. New `kernel.queryRationaleChain` RPC (recursive CTE over ConstraintNode/DecisionNode edge types, already schema-present). New React component in Canvas webview. No new kernel deps.

**Depends on:** Phase 03 (traverse, receipt, RPC daemon), Phase 04 (Canvas webview host), Phase 13 CLOSE-01 (kernel sidecar stable).

---

### DEEP-02: Visual Time-Travel Graph Inspector

**Table stakes behavior:**
- User opens inspector via command palette: "GoatIDE: Open Graph Inspector"
- Opens a new `WebviewPanel` (distinct from Verification Canvas — own panel instance, own esbuild bundle)
- Displays the bitemporal graph for the current workspace using Cytoscape.js canvas renderer with `cytoscape-fcose` layout
- Time-travel slider (`<input type="range">`) filters visible nodes/edges to those where `valid_from <= asOf AND (valid_to IS NULL OR valid_to > asOf)` at the selected timestamp
- Slider range spans from earliest `valid_from` in the graph to `Date.now()`

**Visual conventions (from Graphify primary reference):**
The inspector adopts Graphify's dark-first color palette and semantic node-type coloring, adapted for GoatIDE's node taxonomy:

| Node Type | Fill | Stroke | Text | Rationale |
|-----------|------|--------|------|-----------|
| DecisionNode | `#450a0a` | `#f87171` | `#fee2e2` | Graphify `api` red — high-visibility for architectural decisions |
| ConstraintNode | `#064e3b` | `#34d399` | `#d1fae5` | Graphify `klass` green — structural/enforcing |
| ObservationNode | `#172554` | `#60a5fa` | `#dbeafe` | Graphify `module` blue — telemetry-sourced facts |
| FileAnchorNode | `#2e1065` | `#a78bfa` | `#ede9fe` | Graphify `async` purple — code-anchored |
| SupersededNode | `#3f3f46` | `#a1a1aa` | `#f4f4f5` | Graphify `test` gray — visually muted, historically present but inactive |
| RationaleEdge | Dashed stroke, muted opacity | — | label: relation type | Graphify comments out low-confidence edges; GoatIDE renders them dashed |
| ProtectsEdge | Solid stroke, accent color | — | "protects" label | High-visibility for contract-guard edges |

Background: `#0f172a` (Graphify dark background). Accent: `#38bdf8`. Controls (zoom, fit, reset): same toolbar pattern as Graphify.

**Visual conventions (from code-review-graph fallback, large repos):**
When node count exceeds 500 (large-repo / DEEP-06 cross-repo stitched): enable code-review-graph patterns:
- Degree-scaled node size: high-connectivity constraint nodes rendered larger (radius proportional to outgoing edge count, cap at 3×)
- Community toggles: per-NodeType visibility pills ("DecisionNodes OFF/ON", "SupersededNodes OFF/ON")
- Search: text match over node labels surfaces matching nodes + direct neighbors (highlight + fade non-matches to opacity 0.2)
- Edge type filter pills: hide/show by edge kind (protects, calls, rationale_for, etc.)
- Keyboard navigation: Arrow keys to nearest node, Enter to select, Escape to deselect

**What the inspector is NOT:**
- No mutation of graph state (time-slider changes display only; label "Viewing snapshot — graph is read-only" displayed in inspector header)
- No vector search over node labels
- No restore-to-point-in-time action

**Complexity:** LARGE. New WebviewPanel with separate esbuild bundle. Cytoscape.js + cytoscape-fcose install in bridge. New `kernel.queryGraphSnapshot(asOf, repoId?)` RPC returning nodes+edges as JSON array. React + Cytoscape imperative integration via `useRef`. Time-slider React state management.

**Depends on:** Phase 02 (graph schema with valid_from/valid_to), Phase 03 (traversal), Phase 04 (WebviewPanel pattern). DEEP-06 if cross-repo view wanted (repoId column migration must ship first).

---

### DEEP-03: Constraint-Lift Ripple Analysis

**Table stakes behavior:**
- User invokes from the Canvas on a save touching a ConstraintNode-anchored file: "What breaks if this constraint is lifted?"
- System calls extended `kernel.runRippleAnalysis(constraintNodeId, confidenceThreshold)` returning a ranked list of downstream edges with confidence-weighted impact scores
- Canvas renders results as a new "Impact Analysis" section: `[Edge kind] → [Target node] — Impact score: [0.0–1.0] — Confidence: [Explicit|Inferred]`
- User must still proceed through the existing override flow to act on any finding (Mandate D)

**Differentiator behavior:**
- Confidence-weighted scoring: edges from Explicit-confidence nodes score higher than Inferred nodes — surfaces only high-confidence impact chains by default, with a "show all" toggle for lower-confidence edges
- Partial results: analysis returns results up to a configurable depth (default 3 hops), avoiding unbounded CTE expansion on large graphs

**Anti-feature explicitly excluded:** No "auto-lift" button. DEEP-03 is read-only analysis surfaced in Canvas. Acting on the analysis requires the human to invoke the override flow.

**Complexity:** MEDIUM. Extends existing `runRippleAnalysis` in `kernel/src/drift/` to accept confidence threshold param and return weighted scores. New Canvas "Impact Analysis" React component. No new deps.

**Depends on:** Phase 07 (DRIFT-04/05 runRippleAnalysis baseline). DEEP-01 (rationale chain context displayed alongside impact).

---

### DEEP-04: Historical-Supersession IntentDrift

**Table stakes behavior:**
- When a save touches code anchored to a node whose predecessor was superseded (i.e., `provenance` table shows a supersession chain), the existing IntentDrift badge in the Canvas is extended to show: "This code is anchored to [NodeLabel], which superseded [OldNodeLabel] on [date]. The old decision said: [snippet from superseded node payload]."
- Badge renders in the Canvas with a new `historical-conflict` variant (distinct CSS class, amber color distinct from the existing `drift` red)
- If no supersession chain exists for the anchoring node: no badge shown (silent — do not surface noise for normal nodes)

**Anti-feature explicitly excluded:** DEEP-04 does NOT automatically block the save. The badge informs; the user decides via the existing tier-dispatch override flow (Mandate D).

**Complexity:** MEDIUM. Adds `supersededAt` predicate to `DriftDetector.detect()` by joining `provenance` table for supersession chains. New `historical-conflict` badge variant in React. No new kernel deps.

**Depends on:** Phase 07 (DRIFT-INTEGRATION, IntentDriftBadge exists). Phase 02 (provenance table with supersession chain). Phase 13 CLOSE-01 (kernel stable).

---

### DEEP-05: Session-Priority Lens

**Table stakes behavior:**
- User sets a session priority string via the existing "GoatIDE: Set Session Priority" quickPick (already shipped in v1.1 status-bar surface)
- DEEP-05 adds: when a priority is active, receipts and drift findings in the Canvas are re-ranked by relevance to the priority string (keyword overlap against node labels + edge `relation` fields)
- Re-ranking is in-memory, executed in the kernel receipt layer: `kernel.reRankReceiptBySessionPriority(receiptRows, priorityString)` returns the same rows in a different order
- No graph rows are written, no provenance entry is created (Mandate B — read-only lens)
- Priority indicator shown in Canvas header: "Filtered by session priority: [priority string]"

**Anti-feature explicitly excluded:** Re-ranking must NOT write any rows to the graph. It is a stateless computation over an existing `ReceiptRow[]`. Any implementation that persists the re-ranked order to the database violates Mandate B.

**Complexity:** MEDIUM. New in-memory re-rank function in `kernel/src/receipt/`. New KernelClient RPC message type. Canvas header shows active priority with clear/change button. No new deps.

**Depends on:** Phase 03 (ReceiptDAO, receipt row schema), Phase 04 (Canvas webview), existing "Set Session Priority" command from v1.1 IntentDrift wiring.

---

### DEEP-06: Cross-Repo Graph Stitching

**Table stakes behavior:**
- When the user opens a VS Code multi-root workspace with 2+ git repositories, GoatIDE detects each workspace folder as a separate repo via `simpleGit(repoPath).remote(['get-url', 'origin'])` and assigns a stable `repoId` (SHA of remote URL)
- New Drizzle migration adds `repoId TEXT NOT NULL DEFAULT 'default'` to `nodes` and `edges` tables; existing single-repo data migrates to `repoId = 'default'`
- `traverse()` and `buildReceipt()` accept an optional `repoId[]` filter; when omitted, returns results from all repos
- New command: "GoatIDE: Show Cross-Repo Edges" — opens a panel listing edges where `source.repoId != target.repoId`
- Cross-repo edges are created explicitly by the user (via Canvas "Link to other repo's node" action) — they are NOT auto-inferred

**Anti-feature explicitly excluded:** Cross-repo traversal uses only local SQLite kernel databases (one per repo, joined via in-process attach or serialized merge). No cloud graph service, no network calls at traversal time.

**Complexity:** LARGE. Drizzle migration (repoId column on nodes+edges). `simpleGit` repo fingerprinting on workspace folder open. Updated `traverse()` CTE to filter/join by repoId. New bridge command + VS Code `workspaceFolders` enumeration. DEEP-02 inspector must show repoId in node tooltips for cross-repo context.

**Depends on:** Phase 02 (graph schema, GraphDAO), Phase 03 (traverse, buildReceipt), Phase 06 (workspace folder awareness in bridge). DEEP-02 recommended but not required.

---

### POLISH-01: First-Run Onboarding

**Table stakes behavior:**
- Uses VS Code `contributes.walkthroughs` contribution point in `goatide-bridge/package.json` — native VS Code Getting Started panel integration (available since VS Code 1.74, fully stable in 1.117; HIGH confidence via official API docs)
- Walkthrough auto-opens on first extension activation via `when: "!goatide.onboardingComplete"` context key
- 4–5 steps covering: (1) What is the Verification Canvas, (2) How to read a Reasoning Receipt, (3) What the IntentDrift badge means, (4) How to configure save-gate strictness (links to POLISH-02 settings), (5) How to open the Graph Inspector (links to DEEP-02 command)
- Each step uses SVG media (theme-color-aware, per VS Code walkthrough guidelines) + `completionEvents: ["onCommand:goatide.canvas.open"]` style events to auto-check steps
- Completion stored via `vscode.workspace.getConfiguration('goatide').update('onboardingComplete', true, ConfigurationTarget.Global)`

**Anti-feature explicitly excluded:** No third-party tour library (react-joyride, Shepherd.js). They cannot integrate with VS Code's Getting Started panel, add bundle weight, and produce UX foreign to VS Code users. The platform provides this for free.

**Complexity:** SMALL. JSON-defined in `package.json` `contributes.walkthroughs`. SVG assets. One context key. No new npm packages.

**Depends on:** Phase 04 (Canvas), Phase 07 (IntentDrift badge), POLISH-02 (settings UI — link target in step 4), DEEP-02 (Graph Inspector — link target in step 5).

---

### POLISH-02: Settings UI for Save-Gate Strictness

**Table stakes behavior:**
- Three new `contributes.configuration` entries with `"scope": "resource"` (per-workspace) in `goatide-bridge/package.json`:
  - `goatide.saveGate.destructive`: `"block" | "confirm" | "suppress"` (default: `"block"`)
  - `goatide.saveGate.highImpact`: `"block" | "confirm" | "suppress"` (default: `"confirm"`)
  - `goatide.saveGate.benign`: `"confirm" | "suppress"` (default: `"suppress"`)
- VS Code Settings UI renders `enum` + `enumDescriptions` as a native dropdown automatically — no custom settings webview
- Bridge save-gate handler reads `vscode.workspace.getConfiguration('goatide.saveGate', workspaceUri)` before dispatching tier

**Anti-feature explicitly excluded:** No custom settings webview. The native Settings UI dropdown covers 100% of the UX requirement. Custom webviews for settings add maintenance burden and break keyboard navigation conventions.

**Complexity:** SMALL. `package.json` `contributes.configuration` entries only. One `getConfiguration` call in the save-gate handler.

**Depends on:** Phase 04 (CANV-05 tier classifier — save-gate dispatches on tier; POLISH-02 hooks before that dispatch).

---

### POLISH-03: Empty-State UX for 0-Citation Receipts

**Table stakes behavior:**
- The existing `CitationList` React component in the Canvas webview renders a conditional branch when `citations.length === 0`
- New empty state: icon (graph/question-mark SVG using VS Code `--vscode-foreground` token) + heading "No rationale recorded yet" + body text "This file has no linked Decisions or Constraints in the graph. Save a DecisionNode to start capturing why this code exists." + CTA button: "Add DecisionNode" (invokes `goatide.graph.addDecisionNode` command)
- Styling uses CSS custom properties from existing VS Code token color set (`--vscode-descriptionForeground`, `--vscode-button-background`, etc.) — not hardcoded hex values

**Anti-feature explicitly excluded:** Do NOT display an LLM-generated "likely rationale" for 0-citation state (Mandate A: no-prompt; Mandate C: no vector). The empty state is honest and actionable, not synthetic.

**Complexity:** SMALL. React conditional in existing `CitationList`. SVG asset. CSS custom properties. One new command stub.

**Depends on:** Phase 04 (Canvas webview, CitationList component), DEEP-01 (CTA links to adding a rationale chain).

---

### POLISH-04: Hover-Driven Receipt Drilldown

**Table stakes behavior:**
- For saves classified as `benign` tier: instead of the full Canvas modal, the save-gate emits a compact receipt via a `vscode.languages.registerHoverProvider` hover (or via a status-bar notification if hover position is unavailable)
- Hover content: `vscode.MarkdownString` showing receipt tier badge + top 2 citation labels + "Open full receipt" link triggering `goatide.canvas.open`
- For `destructive` and `highImpact` tiers: existing full Canvas modal continues unchanged — POLISH-04 applies only to `benign` tier
- The compact hover is dismissed automatically after 5 seconds with no user action

**Anti-feature explicitly excluded:** Do NOT use a WebviewPanel for the compact receipt hover — a `MarkdownString` hover is sufficient and avoids panel proliferation. Do NOT show the hover for destructive saves (full modal is required by Mandate D).

**Complexity:** SMALL. New `registerHoverProvider` or status-bar path in the bridge save-gate handler. Controlled by POLISH-02 `goatide.saveGate.benign` setting (if set to `"suppress"`, no hover shown either).

**Depends on:** Phase 04 (save-gate tier classification, CANV-05), POLISH-02 (benign tier setting controls whether this triggers).

---

### C3: Windows Auto-Update Channel

**Table stakes behavior:**
- User on Windows receives update notification in the VS Code notification area when a new GoatIDE release is published to GitHub Releases
- Notification: "GoatIDE [version] is available. Restart to update." with "Restart Now" and "Later" actions
- Update downloads in the background via `electron-updater`'s delta `.blockmap` mechanism — not a full installer download
- On first launch after install: SmartScreen warning is expected (no EV cert until v2.1 — acceptable for solo dogfood)
- Two channels: `stable` (semver `1.x.x`) and `beta` (semver `2.x.x-beta.N`) — channel set by build config

**Implementation pattern (from electron-builder 26.x docs — HIGH confidence):**
- `electron-builder.yml` at repo root (NOT in `package.json` `build` key — that conflicts with VS Code's gulp pipeline)
- NSIS target with `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`
- `electron-updater` initialized in new `src/vs/goatide/update/goatideUpdater.ts` on `app.whenReady()`
- All `electron-updater` initialization gated behind `!process.env.VSCODE_DEV` to prevent update polling in dev mode and CI

**Anti-feature explicitly excluded:**
- Squirrel.Windows: explicitly deprecated in electron-builder; requires Microsoft's `updateUrl` CDN which GoatIDE cannot write to
- Signing without cert: do NOT add `signtoolOptions` to the electron-builder config until C2 (EV cert, deferred to v2.1) is available — attempting to sign without a cert breaks CI
- Auto-applying update without user confirmation: `electron-updater` shows notification, user triggers restart (Mandate D spirit: user controls timing)

**Complexity:** MEDIUM. New `electron-builder.yml`. New `goatideUpdater.ts` in Electron main process. GitHub Releases workflow in CI. Freshclone-smoke guard asserting `isUpdaterActive() === false` in dev mode.

**Depends on:** Phase 09 (BUILD-RT-SMOKE freshclone smoke — must pass before adding new distribution path). No v2.0 deep features depend on C3; it is parallel-buildable.

---

## Feature Dependencies

```
DEEP-01 (rationale query)
    └──requires──> Phase 03 (traverse + receipt RPC)
    └──requires──> Phase 04 (Canvas webview host)
    └──enhances──> POLISH-03 (CTA in empty state)

DEEP-02 (graph inspector)
    └──requires──> Phase 02 (bitemporal schema: valid_from/valid_to)
    └──requires──> Phase 03 (traversal for snapshot query)
    └──requires──> Phase 04 (WebviewPanel pattern)
    └──enhanced by──> DEEP-06 (cross-repo repoId visible in inspector)

DEEP-03 (ripple analysis)
    └──requires──> Phase 07 (DRIFT-04/05 runRippleAnalysis baseline)
    └──enhanced by──> DEEP-01 (rationale context alongside impact)

DEEP-04 (historical IntentDrift)
    └──requires──> Phase 07 (IntentDriftBadge component)
    └──requires──> Phase 02 (provenance supersession chain)
    └──requires──> Phase 13 CLOSE-01 (kernel stable)

DEEP-05 (session-priority lens)
    └──requires──> Phase 03 (ReceiptDAO, receipt rows)
    └──requires──> Phase 04 (Canvas webview — displays re-ranked receipt)
    └──requires──> existing v1.1 "Set Session Priority" quickPick command

DEEP-06 (cross-repo stitching)
    └──requires──> Phase 02 (GraphDAO, schema migrations)
    └──requires──> Phase 03 (traverse + buildReceipt accepting repoId[])
    └──requires──> Phase 06 (bridge workspace folder awareness)
    └──soft-dependency──> DEEP-02 (inspector shows repoId in node tooltip)

POLISH-01 (onboarding)
    └──requires──> Phase 04 (Canvas must exist to walkthrough it)
    └──requires──> Phase 07 (IntentDrift badge — step 3)
    └──references──> POLISH-02 (step 4 links to settings)
    └──references──> DEEP-02 (step 5 links to inspector)

POLISH-02 (settings UI)
    └──requires──> Phase 04 (CANV-05 tier classifier — hooks before dispatch)
    └──feeds into──> POLISH-04 (benign tier setting controls hover)

POLISH-03 (empty state)
    └──requires──> Phase 04 (CitationList component in Canvas webview)
    └──references──> DEEP-01 (CTA adds DecisionNode)

POLISH-04 (hover drilldown)
    └──requires──> Phase 04 (CANV-05 tier classifier)
    └──requires──> POLISH-02 (benign tier setting governs when hover fires)

C3 (Windows auto-update)
    └──requires──> Phase 09 (BUILD-RT-SMOKE — distribution gate)
    └──no dependency on any DEEP feature (parallel track)
```

### Dependency Notes

- **DEEP-02 soft-depends on DEEP-06:** The inspector works without cross-repo; DEEP-06 just adds repoId tooltips. Can ship DEEP-02 before DEEP-06.
- **POLISH-01 references DEEP-02:** Walkthrough step 5 links to the Graph Inspector. If DEEP-02 ships after POLISH-01, step 5 should be gated behind `when: "goatide.graphInspectorAvailable"` context key or omitted from the initial walkthrough.
- **POLISH-04 requires POLISH-02:** The benign tier hover respects the `goatide.saveGate.benign` setting. If POLISH-02 is not shipped first, POLISH-04 has no configuration path.
- **C3 is parallel to all DEEP features:** Windows auto-update has no feature dependency on any graph capability. It can be built in a separate phase alongside DEEP work.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| POLISH-01 (onboarding) | HIGH — reduces bounce on first Canvas encounter | LOW | P1 |
| POLISH-02 (settings UI) | HIGH — currently no config path for gate strictness | LOW | P1 |
| POLISH-03 (empty state) | MEDIUM — polish but visibly broken without it | LOW | P1 |
| DEEP-01 (rationale query) | HIGH — first user-visible payoff of graph substrate | MEDIUM | P1 |
| DEEP-04 (historical IntentDrift) | HIGH — logical completion of v1.x drift feature | MEDIUM | P1 |
| POLISH-04 (hover drilldown) | MEDIUM — friction reduction for benign saves | LOW | P2 |
| DEEP-02 (graph inspector) | HIGH — visual differentiator, demo-worthy | LARGE | P2 |
| DEEP-03 (ripple analysis) | HIGH — unique capability, complex to explain to new users | MEDIUM | P2 |
| DEEP-05 (session-priority lens) | MEDIUM — power user feature | MEDIUM | P2 |
| C3 (Windows auto-update) | HIGH for distribution trust, LOW for feature capability | MEDIUM | P2 |
| DEEP-06 (cross-repo stitching) | MEDIUM — microservice users will want this | LARGE | P3 |

**Priority key:**
- P1: Must have — v2.0 is incomplete without it
- P2: Should have — ships if phase estimates hold
- P3: Nice to have — defer to v2.1 if v2.0 phases run long

---

## Mandate Compliance Summary

| Requirement ID | Mandate A (no-prompt) | Mandate B (append-only) | Mandate C (no-vector) | Mandate D (verification-first) |
|----------------|----------------------|------------------------|----------------------|-------------------------------|
| DEEP-01 | SAFE — graph CTE only, no LLM | SAFE — read-only | SAFE — traversal only | SAFE — displayed in Canvas, user acts |
| DEEP-02 | SAFE — snapshot query only | SAFE — slider is read-only display | SAFE — no embedding | SAFE — inspector is read-only |
| DEEP-03 | SAFE — ripple CTE only | SAFE — analysis is read-only | SAFE — confidence scoring is graph-edge weight | AT RISK — ensure no auto-lift action; must go through override flow |
| DEEP-04 | SAFE — provenance join only | SAFE — badge is read-only | SAFE | AT RISK — badge must not auto-block save; inform only |
| DEEP-05 | SAFE — keyword overlap, no LLM | AT RISK — must NOT write re-ranked order to DB | SAFE — keyword match over labels | SAFE — lens is stateless |
| DEEP-06 | SAFE | AT RISK — cross-repo edge creation must go through Canvas receipt flow | SAFE | AT RISK — cross-repo edge creation must require verification |
| POLISH-01 | SAFE | SAFE | SAFE | SAFE |
| POLISH-02 | SAFE | SAFE | SAFE | SAFE |
| POLISH-03 | AT RISK — empty state CTA must NOT offer LLM-generated rationale | SAFE | AT RISK — empty state must NOT offer "find similar" via vector | SAFE |
| POLISH-04 | SAFE | SAFE | SAFE | AT RISK — hover must NOT appear for destructive tier (full modal required) |
| C3 | SAFE | SAFE | SAFE | SAFE — user confirms restart |

---

## Sources

- GoatIDE REQUIREMENTS.md (v2.0 DEEP-01..06, POLISH-01..04, C3 definitions — reconstructed 2026-05-13)
- GoatIDE ROADMAP.md (v1.x phase history — shipped feature baseline)
- GoatIDE STACK.md (v2.0 stack additions — sibling research agent, 2026-05-13)
- [Graphify v7 callflow_html.py](https://github.com/safishamsi/graphify) — source-inspected via raw GitHub: Mermaid rendering library, dark `#0f172a` background, semantic node-type color palette (entry/api/async/klass/ui/module/test/concept/function type mapping), zoom/pan toolbar
- [code-review-graph graph.ts](https://github.com/tirth8205/code-review-graph) — source-inspected via raw GitHub: D3 force-directed, 5 node types with distinct shape+color, degree-scaled sizing, community toggle pills, BFS/search navigation, hover tooltip with file path + line range
- [VS Code contributes.walkthroughs](https://code.visualstudio.com/api/ux-guidelines/walkthroughs) — confirmed: auto-opens on install, SVG media, completionEvents API, when-condition for context keys
- [VS Code contribution points reference](https://code.visualstudio.com/api/references/contribution-points) — confirmed: walkthrough step fields, completionEvents types (onCommand, onSettingChanged, onContext, onView, onLink)
- [VS Code settings UX guidelines](https://code.visualstudio.com/api/ux-guidelines/settings) — confirmed: enum + enumDescriptions renders as native dropdown, resource scope for per-workspace config
- [electron-builder auto-update docs](https://www.electron.build/auto-update.html) — confirmed: Squirrel.Windows deprecated, NSIS supported, VSCODE_DEV interaction, forceDevUpdateConfig testing path
- [Cytoscape.js](https://js.cytoscape.org/) — confirmed: canvas renderer, filtering API, element collection operations for time-slider pattern

---
*Feature research for: GoatIDE v2.0 — deep features + polish + Windows auto-update*
*Researched: 2026-05-13*
