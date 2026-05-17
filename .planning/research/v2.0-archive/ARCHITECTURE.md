# Architecture Research

**Domain:** GoatIDE v2.0 — bitemporal graph IDE, new features integration
**Researched:** 2026-05-13
**Confidence:** HIGH (based on direct source inspection of existing kernel, bridge, and schema)

---

## Existing Architecture Summary (baseline for v2.0)

```
┌──────────────────────────────────────────────────────────────────────┐
│  VS Code Workbench (renderer process — browser context)              │
│  src/vs/sessions/, src/vs/workbench/                                 │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  VS Code Extension API
┌───────────────────────────────▼──────────────────────────────────────┐
│  goatide-bridge extension (extension host — Node CJS context)        │
│  src/vs/goatide/extensions/goatide-bridge/src/                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐   │
│  │ CanvasPanel  │  │  save-gate   │  │ React webview (canvas/)   │   │
│  │ (panel.ts)  │  │ (on-will-    │  │ App, DiffPane, CitationList│   │
│  └──────┬──────┘  │  save.ts)    │  │ DriftFindings, etc.        │   │
│         │         └──────┬───────┘  └───────────────────────────┘   │
│         └─────────────── │ ─ KernelClient (TCP) ────────────────┐   │
└──────────────────────────┼─────────────────────────────────────┬┘   │
                           │  vscode-jsonrpc 8.2.1 over TCP       │
┌──────────────────────────▼─────────────────────────────────────▼────┐
│  kernel sidecar (separate Electron-as-Node process)                  │
│  kernel/src/                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ rpc/server.ts│  │ drift/       │  │ graph/ (DAO, traverse,   │   │
│  │ (handlers)   │  │ (detector,   │  │  schema, payloads)       │   │
│  │              │  │  ripple,     │  │                          │   │
│  │              │  │  intent)     │  │                          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  better-sqlite3 + Drizzle ORM → goatide.db (WAL mode)       │    │
│  │  nodes | edges | provenance | receipts | active_nodes view  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

**Established contracts (must not be violated by v2.0):**
- Mandate B (append-only): `GraphDAO` has NO `delete()`, NO generic `update()`. Only `seed()`, `supersede()`, `writeEdge()`. This constraint is enforced at both the Drizzle layer and a BEFORE-DELETE SQLite trigger.
- Mandate C (exact-equality retrieval): zero fuzzy/embedding-based lookup. All queries use `json_extract` + exact equality or recursive CTE traversal.
- CJS/ESM boundary: the bridge is CommonJS (`require`-based). The kernel dist is ESM. Cross-boundary imports use dynamic `import(pathToFileURL(...))` with locally-redeclared interface mirrors (see `canvas-module.ts`).
- Dual-location bridge constraint: bridge source lives at `src/vs/goatide/extensions/goatide-bridge/` (5 `..` to root) and mirrors to `extensions/goatide-bridge/` (2 `..` to root) via `scripts/prepare_goatide.sh`. Every new kernel file reference in the bridge must use the `resolveCanvasIndexPath()`/`resolveKernelPath()` stat-then-fallback pattern.
- RPC pattern: every new kernel endpoint is declared as a `RequestType` in `kernel/src/rpc/methods.ts`, registered in `kernel/src/rpc/server.ts` via `bindHandlers()`, and called from the bridge via a typed method on `KernelClient`.

---

## v2.0 Component Map

### New vs Modified — Explicit List

**NEW kernel files:**
- `kernel/src/graph/rationale.ts` — `queryRationaleChain()` read-only query (DEEP-01)
- `kernel/src/drift/constraint-lift.ts` — hypothetical constraint-lift ripple (DEEP-03)
- `kernel/src/graph/schema/0007_cross_repo_identity.sql` — `repo_id` migration (DEEP-06)
- `kernel/src/daemon/index.ts` — MODIFIED to accept `repoId` from env (DEEP-06)

**MODIFIED kernel files:**
- `kernel/src/rpc/methods.ts` — add `QueryRationaleChainRequest`, `ConstraintLiftRequest`, `QueryTimelineRequest` type definitions
- `kernel/src/rpc/server.ts` — register the three new handlers in `bindHandlers()`
- `kernel/src/drift/detector.ts` — extend `DriftDetectorInput` with optional `supersededAtBefore` predicate (DEEP-04)
- `kernel/src/drift/intent.ts` — extend `evaluateIntentDrift` to consult provenance supersession chains (DEEP-04)
- `kernel/src/graph/dao.ts` — add `queryAsOfWithRepo()` + `queryAllTimepoints()` read methods (DEEP-02, DEEP-06)
- `kernel/src/receipt/render.ts` — add session-priority lens re-rank pass (DEEP-05)

**NEW bridge files:**
- `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/panel.ts` — `GraphInspectorPanel` (DEEP-02)
- `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/webview/index.html` — inspector webview HTML (DEEP-02)
- `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/webview/index.tsx` — Cytoscape.js React root (DEEP-02)
- `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/webview/GraphView.tsx` — Cytoscape mount + time slider (DEEP-02)
- `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/messages.ts` — typed host↔webview messages (DEEP-02)
- `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/commands.ts` — `goatide.graph.openInspector` command (DEEP-02, DEEP-06)
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/RationaleChain.tsx` — inline rationale chain view (DEEP-01)
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/HoverReceipt.tsx` — compact hover receipt (POLISH-04)

**MODIFIED bridge files:**
- `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts` — add `queryRationaleChain()`, `queryTimeline()`, `constraintLift()` typed methods
- `src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts` — re-export new `RequestType` definitions (mirror pattern)
- `src/vs/goatide/extensions/goatide-bridge/src/save-gate/tier-dispatch.ts` — thread session-priority lens (DEEP-05) + historical-supersession awareness flag (DEEP-04)
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/App.tsx` — add `RationaleChain` panel, improved empty-state (POLISH-03), hover receipt trigger (POLISH-04)
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/CitationList.tsx` — empty-state UX (POLISH-03)
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts` — add `rationale_chain.request`, `rationale_chain.response` message types
- `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` — register `GraphInspectorPanel`, cross-repo workspace enumeration command, `contributes.walkthroughs` activation, session-priority config reader
- `src/vs/goatide/extensions/goatide-bridge/package.json` — add `cytoscape`, `cytoscape-fcose` deps; add `contributes.walkthroughs`, `contributes.configuration` for POLISH-01/02; mirror regen required after this change

**NEW Electron main process files:**
- `src/vs/goatide/update/goatideUpdater.ts` — `electron-updater` initializer, gated on `!process.env.VSCODE_DEV` (C3)
- `electron-builder.yml` — NSIS installer config (C3)

---

## Integration Points by Feature

### DEEP-01: Rationale Chain Query

**Kernel side — new RPC:**

File: `kernel/src/rpc/methods.ts`
```typescript
export interface QueryRationaleChainParams {
    anchor_file: string;    // file path to look up anchoring nodes
    as_of?: string;         // ISO-8601; defaults to now
    max_hops?: number;      // default 4
}
export interface RationaleChainNode {
    node_id: string;
    kind: 'ConstraintNode' | 'DecisionNode';
    body: string;
    valid_from: string;
    hop: number;
    edge_kind: string;
}
export interface QueryRationaleChainResult {
    chain: RationaleChainNode[];
}
export const QueryRationaleChainRequest = new RequestType<
    QueryRationaleChainParams, QueryRationaleChainResult, Error
>('graph.queryRationaleChain');
```

File: `kernel/src/graph/rationale.ts` — implements the read. Uses existing `traverse()` with `scope: 'all'` + post-filter to `ConstraintNode | DecisionNode` kinds only. DOES NOT touch `GraphDAO.seed()` or `supersede()` — read-only.

**Bridge side:**
- `client.ts`: `queryRationaleChain(params)` method using `sendWithTimeout`
- `canvas/messages.ts`: add `rationale_chain.request` (webview → host) and `rationale_chain.response` (host → webview) typed messages
- `canvas/panel.ts`: wire `rationale_chain.request` message in `handleMessage()` → call `kernel.queryRationaleChain()` → post `rationale_chain.response`
- `canvas/webview/RationaleChain.tsx`: new React component rendered inside `App.tsx` on citation click

**Mandate B compliance:** pure read — no `seed()`, no `supersede()`, no `writeEdge()`. Query uses existing `traverse()` + kind filter.

---

### DEEP-02: Time-Travel Graph Inspector

**Kernel side — new RPC:**

File: `kernel/src/rpc/methods.ts`
```typescript
export interface QueryTimelineParams {
    as_of: string;           // snapshot timestamp for the slider position
    scope?: 'all' | 'repo';  // 'repo' reserved for DEEP-06 cross-repo opt-in
    repo_id?: string;        // DEEP-06 extension point; ignored if DEEP-06 not yet built
    max_nodes?: number;      // default 2000 (Cytoscape performance ceiling)
}
export interface TimelineNodeRow {
    node_id: string;
    kind: string;
    body_preview: string;     // first 80 chars of body
    valid_from: string;
    invalidated_at: string | null;
}
export interface TimelineEdgeRow {
    edge_id: string;
    kind: string;
    src_id: string;
    dst_id: string;
    valid_from: string;
    invalidated_at: string | null;
}
export interface QueryTimelineResult {
    nodes: TimelineNodeRow[];
    edges: TimelineEdgeRow[];
    earliest_ts: string;
    latest_ts: string;
    truncated: boolean;
}
export const QueryTimelineRequest = new RequestType<
    QueryTimelineParams, QueryTimelineResult, Error
>('graph.queryTimeline');
```

File: `kernel/src/graph/dao.ts` — add `queryAllTimepoints()` returning the min `valid_from` and max `recorded_at` across all nodes (used to calibrate the slider range). Add `queryTimelineSnapshot(asOf, maxNodes)` that reads nodes AND edges visible at `asOf` using the bitemporal predicates already in `queryAsOf()`.

**Bridge side — new panel:**

File: `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/panel.ts`

Pattern: mirror `CanvasPanel` exactly for lifecycle but with `VIEW_TYPE = 'goatide.graphInspector'`. Key differences from `CanvasPanel`:
- NOT a singleton in the `CanvasPanel` sense — can be opened explicitly by command, does NOT intercept saves.
- Uses `retainContextWhenHidden: true` (same as CanvasPanel — Cytoscape renders are expensive to rebuild).
- Has its own `dist/inspector/` esbuild output directory (separate bundle from `dist/canvas/`).
- `localResourceRoots` includes `dist/inspector/` instead of `dist/canvas/`.

File: `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/webview/GraphView.tsx`

```typescript
// Pseudocode — shows the integration pattern
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
cytoscape.use(fcose);

export function GraphView({ rpc }: { rpc: InspectorRpc }): React.ReactElement {
    const cyRef = React.useRef<HTMLDivElement>(null);
    const cyInstance = React.useRef<cytoscape.Core | null>(null);
    const [asOf, setAsOf] = React.useState<string>('');
    const [sliderRange, setSliderRange] = React.useState({ min: 0, max: 0 });

    React.useEffect(() => {
        if (!cyRef.current) return;
        cyInstance.current = cytoscape({
            container: cyRef.current,
            style: [/* node/edge styles mapped to VS Code token colors */],
            layout: { name: 'fcose' },
            hideEdgesOnViewport: true,   // performance: hides during pan/zoom
        });
        return () => cyInstance.current?.destroy();
    }, []);

    // On asOf change: post inspector.queryTimeline to host → receive nodes/edges → update cy
    React.useEffect(() => {
        rpc.queryTimeline({ as_of: asOf }).then((result) => {
            const cy = cyInstance.current;
            if (!cy) return;
            cy.elements().remove();
            cy.add(result.nodes.map(n => ({ group: 'nodes', data: { id: n.node_id, ...n } })));
            cy.add(result.edges.map(e => ({ group: 'edges', data: { id: e.edge_id, source: e.src_id, target: e.dst_id, ...e } })));
            cy.layout({ name: 'fcose' }).run();
        });
    }, [asOf, rpc]);

    return (
        <div className="graph-inspector">
            <input type="range" min={sliderRange.min} max={sliderRange.max}
                   onChange={e => setAsOf(new Date(+e.target.value).toISOString())} />
            <div ref={cyRef} className="cytoscape-container" style={{ width: '100%', height: '600px' }} />
        </div>
    );
}
```

**Build config addition:** add a second esbuild entrypoint in the bridge's `esbuild.config.mjs` targeting `src/graph-inspector/webview/index.tsx` → `dist/inspector/index.js`. The `cytoscape` + `cytoscape-fcose` packages are bundled into this output (they are webview-only deps, not loaded in the extension host).

**Mandate B compliance:** `queryTimeline` is a pure snapshot read. The slider changes `asOf` but never calls any mutation. The inspector panel has no "edit" affordance. The `QueryTimelineResult` shape makes `invalidated_at` visible to the renderer so historically-superseded nodes can be styled differently (e.g., grey/strikethrough) but the renderer cannot write back.

---

### DEEP-03: Constraint-Lift Ripple Analysis

**Kernel side — new RPC:**

File: `kernel/src/rpc/methods.ts`
```typescript
export interface ConstraintLiftParams {
    constraint_node_id: string;
    as_of?: string;
    confidence_threshold?: number;  // 0.0-1.0; default 0.5
}
export interface ConstraintLiftResult {
    // Same shape as ComplianceReport but semantics are "what would break if removed"
    // rather than "what is currently affected". The `generated_at` field is present
    // and the `truncated` flag applies the same nodeCap defense as ripple.ts.
    hypothetical_impact: ComplianceReport;
    confidence_score: number;  // 0.0-1.0 aggregate confidence across the impact set
}
export const ConstraintLiftRequest = new RequestType<
    ConstraintLiftParams, ConstraintLiftResult, Error
>('graph.constraintLift');
```

File: `kernel/src/drift/constraint-lift.ts` — implements `runConstraintLiftAnalysis()`. Reuses the existing `walkRippleEdges()` from `ripple.ts` (outgoing edges from the ConstraintNode). The "inverted" semantics mean: what nodes currently `anchors` or `protects`-reference this ConstraintNode? Answer: walk inbound `anchors` + `protects` edges (not outbound). This is an inbound-edge walk — a new SQL query shape that is NOT the same as `runRippleAnalysis()` which walks outbound edges.

Concrete SQL for inbound walk: use `WHERE e.dst_id = ?` (vs `e.src_id = ?` in `walkRippleEdges`). Reuse the same bitemporal predicates and nodeCap defense.

**Mandate B compliance:** reads only. The `ConstraintLiftResult.hypothetical_impact` is a computed snapshot — it is NEVER written to the graph as a node or edge. The `generated_at` timestamp is from `new Date().toISOString()` in-memory only. No `seed()`, no `supersede()`, no `writeEdge()`.

**Bridge side:** no new panel. Results surface in the existing `ComplianceReport` React component inside `CanvasPanel` webview. Add a `constraintLift` button to `DriftFindings.tsx` that triggers the RPC and posts the result as a `compliance_report.full` message (reusing the existing post infrastructure from `panel.ts`).

---

### DEEP-04: IntentDrift with Historical-Supersession Awareness

**Kernel side — modification:**

File: `kernel/src/drift/detector.ts` — extend `DriftDetectorInput` with:
```typescript
readonly supersededBeforeMs?: number;  // optional: only emit findings for patterns
                                       // whose ContractNode was superseded before this epoch
```

File: `kernel/src/drift/intent.ts` — extend `evaluateIntentDrift` to accept the `dao` handle and call `dao.findSuccessor(citation.node_id)` to check whether the cited DecisionNode has been superseded. If `findSuccessor` returns a non-null row AND `successor.valid_from < sessionStartTs`, emit an additional `IntentDriftBadge` with a `explanation` noting historical supersession. The `findSuccessor` query is already in `GraphDAO` — no new DAO methods needed.

No new kernel files. No new RPC methods. The existing `graph.proposeEdit` RPC already accepts `session_priority`; the extended `renderReceipt` call will pick up the additional badge naturally.

**Mandate B compliance:** `findSuccessor()` is a read. The badges are emitted in-memory and returned on the `ProposeEditResult.receipt` wire. No graph mutations.

---

### DEEP-05: Session-Priority Lens

**Kernel side — modification:**

File: `kernel/src/receipt/render.ts` — add a `sessionPriorityLens(receipt, sessionPriority)` function that re-ranks the `citations[]` array by placing `intent_drift_badge`-bearing citations first. Pure array re-sort, no DB interaction.

This is already partially wired: `graph.proposeEdit` accepts `session_priority` and calls `renderReceipt()` with it. The lens is a post-render pass that re-orders the citation array for display priority without changing the receipt's node IDs or provenance.

**Bridge side:** no new RPC. The existing `proposeEdit` call in `tier-dispatch.ts` already sends `session_priority` from `vscode.workspace.getConfiguration('goatide.session').get('priority')`. DEEP-05 adds a **command** `goatide.session.setPriority` (already exists as a quickPick) that also refreshes the currently-open CanvasPanel by re-running the last `proposeEdit` payload with the updated priority.

**Mandate B compliance:** pure re-sort of in-memory citation array. Zero graph mutations.

---

### DEEP-06: Cross-Repo Graph Stitching

**Kernel side — schema migration + DAO changes:**

File: `kernel/drizzle/migrations/0007_cross_repo_identity.sql` (new migration):
```sql
-- Add repo_id to nodes and edges tables. NULL = local repo (back-compat for
-- all existing rows). Cross-repo rows are inserted with an explicit repo_id.
-- The active_nodes view is RECREATED to include repo_id in its column set.
-- Mandate B: no DROP TABLE, no data delete. ALTER TABLE only adds a nullable column.
ALTER TABLE nodes ADD COLUMN repo_id TEXT;
ALTER TABLE edges ADD COLUMN repo_id TEXT;
```

File: `kernel/src/graph/dao.ts` — add `queryByRepo(repoId, asOf)` that reads nodes scoped to a specific `repo_id`. The default `queryAsOf()` remains unchanged (reads all nodes regardless of `repo_id`).

File: `kernel/src/daemon/index.ts` — accept `GOATIDE_REPO_ID` env var, pass to `GraphDAO` constructor so seeds from this workspace are tagged.

**Bridge side — new command:**

File: `src/vs/goatide/extensions/goatide-bridge/src/graph-inspector/commands.ts`
- `goatide.graph.openCrossRepo` command: enumerates `vscode.workspace.workspaceFolders`, resolves a `repo_id` for each using `simple-git` remote URL fingerprint, calls `kernel.queryTimeline({ scope: 'all' })` (no `repo_id` filter = stitched view), opens `GraphInspectorPanel`.

**DEEP-06 ordering decision:** DEEP-06 schema migration (`repo_id` column) MUST run before any DEEP-06 read-side features. However because `repo_id` is a nullable `ALTER TABLE ADD COLUMN`, all existing rows have `repo_id = NULL`. The bitemporal read queries (`queryAsOf`, `queryByKind`, etc.) treat NULL repo_id as "local" and return them unfiltered. This means DEEP-06 migration is safe to ship as Phase N and the cross-repo traversal opt-in can be Phase N+1 without breaking any existing functionality. This is the recommended split: ship the migration with DEEP-06-phase-A, ship the UI with DEEP-06-phase-B.

**Mandate B compliance:** `ALTER TABLE ADD COLUMN` with `NULL` default is not a destructive schema change. No existing row data is modified. The migration adds optional columns to a table whose append-only character is enforced by triggers that are not affected by nullable column additions.

---

### POLISH-01: First-Run Walkthrough

**Location:** `src/vs/goatide/extensions/goatide-bridge/package.json`

Add to `contributes`:
```json
"walkthroughs": [{
    "id": "goatide.onboarding",
    "title": "GoatIDE — Understanding the Verification Canvas",
    "description": "Learn how GoatIDE's bitemporal graph surfaces rationale for every code change.",
    "when": "!goatide.onboardingComplete",
    "steps": [
        {
            "id": "step1.canvas",
            "title": "What Is the Verification Canvas?",
            "description": "...",
            "media": { "image": "resources/walkthrough/canvas-overview.png", "altText": "Canvas overview" }
        }
    ]
}]
```

**No new kernel RPC.** The completion flag is written via `vscode.workspace.getConfiguration('goatide').update('onboardingComplete', true, vscode.ConfigurationTarget.Global)` in the final walkthrough step's `completionEvents`. Bridge mirror regen needed after `package.json` change.

---

### POLISH-02: Per-Resource Save-Gate Settings

**Location:** `src/vs/goatide/extensions/goatide-bridge/package.json` — add to `contributes.configuration`:
```json
"goatide.saveGate.destructive": { "type": "string", "enum": ["block","confirm","suppress"], "scope": "resource" },
"goatide.saveGate.highImpact":  { "type": "string", "enum": ["block","confirm","suppress"], "scope": "resource" },
"goatide.saveGate.benign":      { "type": "string", "enum": ["confirm","suppress"],          "scope": "resource" }
```

**Read in:** `src/vs/goatide/extensions/goatide-bridge/src/save-gate/tier-dispatch.ts` via `vscode.workspace.getConfiguration('goatide.saveGate', document.uri)`. Bridge mirror regen needed after `package.json` change.

---

### C3: Windows Auto-Update

**Electron main process — new file:**

File: `src/vs/goatide/update/goatideUpdater.ts`

```typescript
// NOT in src/vs/platform/update/ — that's the VS Code upstream InnoSetup path.
// This file lives in the GoatIDE-specific goatide/ subfolder.
import { autoUpdater } from 'electron-updater';

export function initializeGoatideUpdater(): void {
    if (process.env.VSCODE_DEV) {
        // Dev mode: updater inactive. HARDEN-06 asserts this in freshclone-smoke-cdp.cjs.
        return;
    }
    autoUpdater.checkForUpdatesAndNotify().catch(e => {
        console.error('[goatide-updater] checkForUpdatesAndNotify failed:', e);
    });
}
```

**Integration point:** call `initializeGoatideUpdater()` from the Electron main process bootstrap. The least-invasive location is `src/vs/code/electron-main/main.ts` (the VS Code fork entry) — add a conditional call after `app.whenReady()`, gated on `!process.env.VSCODE_DEV`. Avoid modifying `src/vs/platform/update/` (upstream sync hygiene).

**New config file:** `electron-builder.yml` at repo root. NOT in `package.json` `build` key — that conflicts with the existing VS Code gulp build system.

**Dependency location:** `electron-updater` goes in root `dependencies` (ships in packaged app); `electron-builder` goes in root `devDependencies` (build-time only).

---

## Data Flow Changes by Feature

### DEEP-01 data flow (new)
```
User clicks "Why?" on citation in CanvasPanel webview
    ↓ postMessage 'rationale_chain.request' { node_id }
CanvasPanel.handleMessage() in panel.ts
    ↓ kernel.queryRationaleChain({ anchor_file, as_of })
kernel/src/graph/rationale.ts queryRationaleChain()
    ↓ traverse(sqlite, { anchorIds, scope: 'all', max_hops: 4, at })
    ↓ filter to ConstraintNode | DecisionNode kinds
    ↓ return RationaleChainNode[]
panel.ts receives result
    ↓ postMessage 'rationale_chain.response' { chain }
RationaleChain.tsx renders chain inline in App.tsx
```
No graph mutation at any step.

### DEEP-02 data flow (new)
```
User invokes 'GoatIDE: Open Graph Inspector' command
    ↓ commands.ts creates GraphInspectorPanel
    ↓ panel posts 'inspector.init' to webview
    ↓ webview requests timeline: postMessage 'inspector.queryTimeline' { as_of: now }
GraphInspectorPanel.handleMessage()
    ↓ kernel.queryTimeline({ as_of })
kernel/src/graph/dao.ts queryTimelineSnapshot(asOf, maxNodes)
    ↓ SELECT nodes WHERE valid_from <= asOf AND (invalidated_at IS NULL OR invalidated_at > asOf)
    ↓ SELECT edges (same bitemporal filter)
    ↓ return { nodes[], edges[], earliest_ts, latest_ts, truncated }
panel posts 'inspector.timelineData' to webview
    ↓ GraphView.tsx updates cytoscape: cy.elements().remove(); cy.add(nodes+edges); cy.layout().run()

User drags time slider (asOf changes)
    ↓ GraphView re-requests via same flow — full snapshot refresh
```
The slider READS a different timestamp but never writes to the kernel. Historical nodes rendered as styled differently (grey, strikethrough) — style-only, no mutation.

### DEEP-03 data flow (new)
```
User clicks "What would break?" button in DriftFindings.tsx
    ↓ postMessage 'constraint_lift.request' { constraint_node_id, as_of }
CanvasPanel.handleMessage() in panel.ts
    ↓ kernel.constraintLift({ constraint_node_id, as_of, confidence_threshold })
kernel/src/drift/constraint-lift.ts runConstraintLiftAnalysis()
    ↓ walkRippleEdgesInbound(sqlite, constraint_node_id, maxHops=3, asOf)
    ↓ return { hypothetical_impact: ComplianceReport, confidence_score: number }
panel.postComplianceReportFull(hypotheticalImpact)
ComplianceReport.tsx renders the hypothetical impact report
```
The result is labelled "Hypothetical Impact" (not the existing "Compliance Report") to distinguish from the `runRippleProgressive` live-impact report. Zero graph writes.

### DEEP-04 data flow (modified)
```
on-will-save.ts fires (existing flow)
    ↓ kernel.proposeEdit({ diff, destructive, asOf, session_priority })
kernel/src/rpc/server.ts ProposeEditRequest handler
    ↓ buildReceipt(...)
    ↓ renderReceipt(receipt, dao, { sessionPriority })
        ↓ NEW: for each DecisionNode citation, call dao.findSuccessor(citation.node_id)
        ↓ if findSuccessor returns non-null row with valid_from < sessionStartTs:
        ↓   append historical_supersession: true to IntentDriftBadge
    ↓ return rendered receipt with enriched intent_drift_badge[] per citation
IntentDriftBadge.tsx in webview renders additional historical-supersession indicator
```

### DEEP-05 data flow (modified)
```
tier-dispatch.ts calls kernel.proposeEdit({ ..., session_priority }) (existing)
    ↓ kernel returns receipt with session-priority lens already applied
    ↓ NEW: citations are re-sorted by intent_drift_badge presence
    ↓ canvas receives citation array with drift-bearing citations listed first
App.tsx renders CitationList with reordered entries
```

### DEEP-06 data flow (new, opt-in)
```
User opens multi-root workspace with 2+ repos
    ↓ 'GoatIDE: Open Cross-Repo Graph' command in commands.ts
    ↓ enumerate vscode.workspace.workspaceFolders
    ↓ for each folder: simple-git(folder.uri.fsPath).remote(['get-url','origin']) → repo_id fingerprint
    ↓ kernel.queryTimeline({ scope: 'all' })  (no repo_id filter → stitched view)
GraphInspectorPanel renders stitched graph
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `kernel/src/graph/rationale.ts` | Read-only: ConstraintNode + DecisionNode chain for a file anchor | `traverse()`, `GraphDAO.queryByAnchor()` |
| `kernel/src/graph/dao.ts` (extended) | New: `queryTimelineSnapshot()`, `queryAllTimepoints()`, `queryByRepo()` | `better-sqlite3` directly |
| `kernel/src/drift/constraint-lift.ts` | Hypothetical inbound-edge walk from ConstraintNode | `walkRippleEdgesInbound()` (new internal fn), `kernel/src/graph/traverse.ts` |
| `kernel/src/rpc/methods.ts` (extended) | Wire type definitions for new RPCs | Imported by both `rpc/server.ts` and bridge `kernel/methods.ts` |
| `GraphInspectorPanel` | Separate-from-Canvas WebviewPanel, owns Cytoscape lifecycle | `KernelClient.queryTimeline()`, Graph Inspector webview |
| `GraphView.tsx` | Cytoscape.js mount, time slider state, element update on asOf change | `InspectorRpc`, `cytoscape`, `cytoscape-fcose` |
| `RationaleChain.tsx` | Inline rationale chain rendered inside CanvasPanel | `CanvasPanel` message bus, existing `App.tsx` |
| `goatideUpdater.ts` | electron-updater init, VSCODE_DEV guard | Electron main process `app.whenReady()` |

---

## Build Order (Phase Dependencies)

The recommended phase ordering considers: (1) kernel RPC contracts must exist before bridge callers, (2) schema migrations must land before features that use the new columns, (3) the DEEP-02 inspector panel is the most complex new UI surface and needs its own esbuild config change, (4) bridge `package.json` changes require `scripts/prepare_goatide.sh` regeneration (Phase 8 BRIDGE-RT-04 pattern).

```
Phase 14: Foundation RPCs (DEEP-01 + DEEP-05 + DEEP-04)
    - kernel/src/rpc/methods.ts: add QueryRationaleChainRequest type
    - kernel/src/graph/rationale.ts: new file
    - kernel/src/rpc/server.ts: register graph.queryRationaleChain handler
    - kernel/src/receipt/render.ts: session-priority lens re-rank + historical-supersession badge
    - bridge kernel/methods.ts: re-export new type
    - bridge kernel/client.ts: add queryRationaleChain() method
    - bridge canvas/messages.ts: rationale_chain message types
    - bridge canvas/panel.ts: wire rationale_chain.request handler
    - bridge canvas/webview/RationaleChain.tsx: new component
    - bridge canvas/webview/App.tsx: mount RationaleChain + DEEP-05 citation re-sort
    RATIONALE: These three features share the "existing CanvasPanel, no new panel" scope.
    No new packages. No schema changes. Lowest risk first.
    No bridge package.json changes → no mirror regen needed in this phase.

Phase 15: Graph Inspector Panel (DEEP-02)
    - bridge esbuild.config.mjs: add second entrypoint for inspector webview
    - bridge graph-inspector/panel.ts: GraphInspectorPanel (mirrors CanvasPanel pattern)
    - bridge graph-inspector/webview/index.tsx, index.html: inspector webview root
    - bridge graph-inspector/webview/GraphView.tsx: Cytoscape.js + time slider
    - bridge graph-inspector/messages.ts: inspector message types
    - kernel/src/rpc/methods.ts: add QueryTimelineRequest
    - kernel/src/graph/dao.ts: queryTimelineSnapshot(), queryAllTimepoints()
    - kernel/src/rpc/server.ts: register graph.queryTimeline handler
    - bridge package.json: add cytoscape + cytoscape-fcose deps → scripts/prepare_goatide.sh regen
    - bridge extension.ts: register graph-inspector panel + command
    NEEDS: Phase 14 complete (KernelClient pattern established).
    Bridge mirror regen is MANDATORY in this phase (new npm deps in package.json).

Phase 16: Constraint-Lift + DEEP-06 Schema Migration (DEEP-03 + DEEP-06-phase-A)
    - kernel/src/drift/constraint-lift.ts: runConstraintLiftAnalysis() + inbound walk
    - kernel/src/rpc/methods.ts: add ConstraintLiftRequest
    - kernel/src/rpc/server.ts: register graph.constraintLift handler
    - bridge kernel/client.ts: add constraintLift() method
    - bridge canvas/webview/DriftFindings.tsx: "What would break?" button + hypothetical ComplianceReport
    - kernel/drizzle/migrations/0007_cross_repo_identity.sql: ALTER TABLE ADD COLUMN repo_id
    - kernel/src/graph/dao.ts: queryByRepo() method
    RATIONALE: DEEP-03 needs no new panel, only extends DriftFindings. Schema migration
    for DEEP-06 is cheap (nullable ALTER TABLE) and can ship here without UI.
    DEEP-06-phase-A migration is safe to ship early because repo_id = NULL
    is transparent to all existing queries.

Phase 17: Cross-Repo UI + Polish (DEEP-06-phase-B + POLISH-01/02/03/04)
    - bridge graph-inspector/commands.ts: cross-repo workspace enumeration command
    - kernel/src/daemon/index.ts: GOATIDE_REPO_ID env var acceptance
    - bridge package.json: contributes.walkthroughs + contributes.configuration entries
    - bridge canvas/webview/CitationList.tsx: POLISH-03 empty-state
    - bridge canvas/webview/HoverReceipt.tsx: POLISH-04 hover receipt
    - bridge extension.ts: register hover provider
    Bridge mirror regen MANDATORY (package.json contributes changes).
    NEEDS: Phase 16 schema migration (DEEP-06-phase-A) for cross-repo traversal.

Phase 18: Windows Auto-Update (C3)
    - electron-builder.yml: new config file at repo root
    - src/vs/goatide/update/goatideUpdater.ts: new Electron main module
    - src/vs/code/electron-main/main.ts: conditional call to initializeGoatideUpdater()
    - root package.json devDependencies: electron-builder; root dependencies: electron-updater
    - scripts/test/freshclone-smoke-cdp.cjs: assert autoUpdater.isUpdaterActive() === false in dev mode
    RATIONALE: Auto-update is fully independent of all graph features. Placing it last
    means all graph features can be validated before the build pipeline changes.
    C3 touches the Electron main process which has the widest blast radius; isolating
    it to the final phase minimises the risk window.
```

---

## Mandate B — Append-Only Defense per Feature

| Feature | Graph Writes? | Defense |
|---------|--------------|---------|
| DEEP-01 queryRationaleChain | NONE — read only | `rationale.ts` calls only `traverse()` + `dao.queryById()` |
| DEEP-02 queryTimeline | NONE — read only | `queryTimelineSnapshot()` is a SELECT only; slider changes `asOf` in-memory |
| DEEP-03 constraintLift | NONE — hypothetical only | `runConstraintLiftAnalysis()` returns in-memory `ComplianceReport`; result is never passed to `dao.seed()` |
| DEEP-04 historical supersession | NONE — read only | `dao.findSuccessor()` is a SELECT; new `IntentDriftBadge` fields are ephemeral on the RPC response wire |
| DEEP-05 session-priority lens | NONE — re-sort only | `sessionPriorityLens()` operates on `RenderedCitation[]` in memory; never writes back |
| DEEP-06 schema migration | SCHEMA ONLY — no row mutations | `ALTER TABLE ADD COLUMN` with NULL default; existing rows are untouched; the DAO `delete()` prohibition is not affected |
| DEEP-06 cross-repo traversal | NONE — read only | `queryByRepo()` is a SELECT; `repo_id` on new seeds is set at seed time by the normal `dao.seed()` path |

---

## Anti-Patterns to Avoid in v2.0

### Anti-Pattern 1: Storing Hypothetical Computations in the Graph

**What:** Seeding a `DriftPattern` or `ContractNode` node as a "hypothetical removed constraint" to represent the DEEP-03 constraint-lift analysis.

**Why bad:** Mandate B says the graph is the source of truth for what has been decided. Hypothetical nodes would pollute the provenance trail with non-decisions and confuse DEEP-01 rationale chain queries.

**Instead:** Return the hypothetical impact as a transient `ComplianceReport` on the RPC response wire only. Never `dao.seed()` a hypothetical.

### Anti-Pattern 2: Giving the Graph Inspector a Mutation Affordance

**What:** Adding an "Edit Node" button to `GraphView.tsx` that calls `kernel.seed()` or `kernel.supersede()` through a new RPC.

**Why bad:** The Graph Inspector is a read-only time-travel viewer. Allowing writes from the inspector breaks the save-gate contract (edits must go through `onWillSaveTextDocument` → `on-will-save.ts` → save-gate) and bypasses the tier classification and confirmation phrase workflow.

**Instead:** Inspector panels are view-only. Any decision to supersede a node must flow through the normal save-gate path or an explicit command that mirrors the `CanvasPanel.showAndAwait()` + `atomicAccept()` path.

### Anti-Pattern 3: Adding cytoscape to the Extension Host Bundle

**What:** `import cytoscape from 'cytoscape'` in `graph-inspector/panel.ts` (extension host / Node context) instead of only in the webview bundle.

**Why bad:** `cytoscape` is a DOM-dependent library (it accesses `window` and `document` on import). Importing it in the extension host (Node.js) will crash the extension host process.

**Instead:** Keep cytoscape exclusively in the webview bundle (`dist/inspector/index.js`). The extension host `GraphInspectorPanel` never imports cytoscape — it only serialises `QueryTimelineResult` to JSON and posts it to the webview via `postMessage`.

### Anti-Pattern 4: Sharing the CanvasPanel webview bundle with the Graph Inspector

**What:** Adding cytoscape to `dist/canvas/index.js` and rendering the graph inside the existing CanvasPanel.

**Why bad:** The Canvas bundle already includes React + react-dom. Adding cytoscape adds ~110KB to a bundle that is loaded on every save trigger. The inspector is opened rarely (explicit command). The two panels have different lifecycles (Canvas: per-save singleton; Inspector: explicit open, retainContext).

**Instead:** Separate esbuild entrypoint → `dist/inspector/index.js`. The canvas bundle is unaffected.

### Anti-Pattern 5: Using `electron-builder`'s `build` key in root `package.json`

**What:** Adding the `build` key to the root VS Code `package.json` for electron-builder config.

**Why bad:** The VS Code build system already uses the `build` folder extensively. The `package.json` `build` key specifically conflicts with some gulp tasks that read the package.json programmatically.

**Instead:** `electron-builder.yml` at repo root (standalone config file). `electron-builder` reads this by default when no `build` key is in `package.json`.

---

## Bridge Mirror Regen Call-Outs

Per BRIDGE-RT-04 (Phase 8), any change to `goatide-bridge/package.json` requires running `bash scripts/prepare_goatide.sh` to regenerate the `extensions/goatide-bridge/` mirror with production deps. The `refuse-stale-bridge-mirror.sh` CI gate will fail otherwise.

| Phase | Trigger | Required Action |
|-------|---------|----------------|
| Phase 15 | Add `cytoscape` + `cytoscape-fcose` to bridge `package.json` | `bash scripts/prepare_goatide.sh` |
| Phase 17 | Add `contributes.walkthroughs` + `contributes.configuration` to bridge `package.json` | `bash scripts/prepare_goatide.sh` |

Phases 14, 16, 18 do NOT modify bridge `package.json` and do not require regen.

---

## Sources

- GoatIDE source: `kernel/src/rpc/server.ts` — existing `bindHandlers()` pattern (direct inspection)
- GoatIDE source: `kernel/src/rpc/methods.ts` — existing `RequestType` declaration pattern (direct inspection)
- GoatIDE source: `kernel/src/drift/ripple.ts` — `walkRippleEdges()` BFS pattern + nodeCap defense (direct inspection)
- GoatIDE source: `kernel/src/drift/intent.ts` — `evaluateIntentDrift()` pure-function pattern (direct inspection)
- GoatIDE source: `kernel/src/graph/dao.ts` — append-only contract + read API shape (direct inspection)
- GoatIDE source: `src/vs/goatide/extensions/goatide-bridge/src/canvas/panel.ts` — `CanvasPanel` lifecycle, singleton pattern, `buildHtml()` CSP template (direct inspection)
- GoatIDE source: `src/vs/goatide/extensions/goatide-bridge/src/save-gate/canvas-module.ts` — dual-location `resolveCanvasIndexPath()` stat-then-fallback pattern (direct inspection)
- GoatIDE source: `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts` — `KernelClient.sendWithTimeout()` + RPC method call pattern (direct inspection)
- GoatIDE source: `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` — activation wire-up, `resolveKernelPath()` dual-candidate pattern (direct inspection)
- GoatIDE `.planning/research/STACK.md` — stack decisions for Cytoscape.js 3.33, cytoscape-fcose 2.2, electron-builder 26.8.1, electron-updater 6.8.3 (co-authored)
- Cytoscape.js documentation — `cytoscape({ container, style, layout })` init pattern (HIGH confidence)
- electron-builder auto-update docs — `autoUpdater.isUpdaterActive()` dev-mode behavior; `forceDevUpdateConfig` pattern (HIGH confidence)

---
*Architecture research for: GoatIDE v2.0 — deep features + polish + Windows auto-update integration*
*Researched: 2026-05-13*
