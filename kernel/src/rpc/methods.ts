/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/rpc/methods.ts — Phase 3 (Plan 03-04) + Phase 4 (Plan 04-04) typed JSON-RPC
// RequestType definitions.
//
// Per 03-RESEARCH.md ## Code Examples — RequestType Definitions. Both the kernel server
// and the (Phase-4) bridge client import from this module so the wire contract is
// strictly typed end-to-end.
//
// vscode-jsonrpc 8.2.1 (NOT 9.x — see Plan 03-01 SUMMARY for the version-pin rationale)
// exposes RequestType from both the package root and 'vscode-jsonrpc/node'. We import
// from 'vscode-jsonrpc' (the common surface) so this module is reusable from a future
// browser/IPC client too.
//
// Plan 04-04 extends the surface from 2 methods (queryGraph, proposeEdit) to 6:
//   - graph.recordRejection (CANV-03)
//   - graph.atomicAccept (CANV-07)
//   - graph.queryAttemptByStagingPath (CANV-07 recovery scan)
//   - graph.queryNodes (citation hydration for Plan 04-05 save gate)
//
// All four new methods use snake_case wire-property names (receipt_id, change_id,
// staging_path, target_path, accept_latency_ms, attempt_kind, attempt_node_id, node_ids)
// — explicit exception to CLAUDE.md ## Naming Conventions camelCase rule, because these
// names match the SQLite column-name convention (graph_snapshot_tx_time, node_id,
// edge_path) and serialize zero-cost between row and RPC payload.

import { RequestType, NotificationType } from 'vscode-jsonrpc';
import type { AnchorRequest } from '../graph/anchor.js';
import type { Scope, TraverseRow } from '../graph/traverse.js';
import type { RationaleChainEntry } from '../graph/rationale-chain.js';
import type { ReasoningReceipt } from '../receipt/index.js';
import type { RawObservation, ObservationSource } from '../harvester/observations.js';
import type { SubmitObservationResult } from '../harvester/index.js';
import type { LivenessReport } from '../harvester/liveness.js';
import type { HarvestMetricsRow } from '../harvester/metrics.js';
import type { DriftFinding, LockTrigger, ComplianceReport } from '../drift/types.js';

// -------- graph.queryGraph --------

export interface QueryGraphParams {
	anchor: AnchorRequest;
	scope?: Scope;          // default 'all'
	max_hops?: number;      // default 4 (TRAV-02)
	at?: string;            // default new Date().toISOString() (TRAV-03)
}

export interface QueryGraphResult {
	nodes: TraverseRow[];
	paths: string[];
}

export const QueryGraphRequest = new RequestType<QueryGraphParams, QueryGraphResult, Error>('graph.queryGraph');

// -------- graph.queryRationaleAt (Plan 14-02 — DEEP-01) --------
//
// Phase 14 Plan 14-02 (Wave-1) — bitemporal "Why does this exist?" composition. The handler
// composes resolveAnchor + traverse + filter + findSuccessor (see
// kernel/src/graph/rationale-chain.ts) into a single round-trip. The bridge calls this
// exactly once per Verification Canvas "Why does this exist?" button click; the asOf
// parameter is REQUIRED and MUST be the receipt's graph_snapshot_tx_time (REC-03 invariant
// — never new Date().toISOString() at click time, never optional with a fallback).
//
// Wire shape mirrors QueryGraphRequest (snake_case where the schema uses it; the
// JSON-RPC method name is dot-namespaced under `graph.`).

export interface QueryRationaleAtParams {
	anchor: AnchorRequest;
	asOf: string;        // ISO-8601 — REQUIRED (not optional)
	max_hops?: number;   // default 4
}

export interface QueryRationaleAtResult {
	chain: RationaleChainEntry[];
	has_superseded: boolean;
}

export const QueryRationaleAtRequest = new RequestType<QueryRationaleAtParams, QueryRationaleAtResult, Error>('graph.queryRationaleAt');
export type { RationaleChainEntry };

// -------- graph.queryGraphSnapshot (Plan 15-01 Wave-0 — type-only; handler lands Wave-1 / Plan 15-02) --------
//
// Phase 15 DEEP-02 bitemporal snapshot for the Graph Inspector. The bridge inspector calls
// this exactly once per slider movement; `params.asOf` is the inspector's current point in
// bitemporal time. `max_nodes` caps the response so unbounded graphs do not blow the wire
// budget — when the result is truncated, `truncated: true` is set and Wave 3 (Plan 15-04)
// renders a "Showing first N nodes (truncated)" banner.
//
// Wire shape is snake_case (matches receipt/CanvasShowPayload precedent for SQLite-aligned
// row-shape fields). The handler in Wave-1 composes `dao.queryAsOf(asOf)` (nodes) +
// `dao.queryEdgesAsOf(asOf)` (edges — landed in Plan 15-01) and projects each row.

export interface QueryGraphSnapshotParams {
	asOf: string;
	max_nodes?: number;
}

export interface SerializedNodeSnapshot {
	node_id: string;
	kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	label: string;
	valid_from: string;
	invalidated_at: string | null;
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — Pitfall D defense. Projected from SQLite repo_id column (migration 0008). Default 'primary' for all pre-Phase-16 rows. */
	repo_id: string;
}

export interface SerializedEdgeSnapshot {
	edge_id: string;
	kind: string;
	src_id: string;
	dst_id: string;
	valid_from: string;
	invalidated_at: string | null;
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — Pitfall D defense. Projected from SQLite repo_id column (migration 0008). Default 'primary' for all pre-Phase-16 rows. */
	repo_id: string;
}

export interface QueryGraphSnapshotResult {
	nodes: SerializedNodeSnapshot[];
	edges: SerializedEdgeSnapshot[];
	truncated: boolean;
}

export const QueryGraphSnapshotRequest = new RequestType<
	QueryGraphSnapshotParams, QueryGraphSnapshotResult, Error
>('graph.queryGraphSnapshot');

// -------- graph.queryTimelineTransitions (Plan 15-01 Wave-0 — type-only; handler lands Wave-1) --------
//
// RESEARCH Risk 4 — discrete slider granularity over the union of all `valid_from` and
// `invalidated_at` instants across nodes + edges. Output is sorted ascending, deduplicated.
// The webview slider snaps to these transition points so every drag step produces a
// visually-distinct snapshot.

export interface QueryTimelineTransitionsResult {
	transitions: string[];
}

export const QueryTimelineTransitionsRequest = new RequestType<
	void, QueryTimelineTransitionsResult, Error
>('graph.queryTimelineTransitions');

// -------- graph.proposeEdit --------
//
// Plan 07-05 (DRIFT-02) extends ProposeEditParams additively with an optional
// session_priority field. When supplied, the kernel handler runs renderReceipt against the
// freshly-built receipt and decorates each cited DecisionNode whose
// derived_under_priority mismatches the session priority with an intent_drift_badge.
// When omitted, the response shape is identical to the Phase 4 / pre-Plan-07-05 surface.
// Backward compatible: pre-Plan-07-05 bridge callers omit the field; new bridge callers
// (Plan 07-05 tier-dispatch.ts) read goatide.session.priority from VS Code config and pass it.

export interface ProposeEditParams {
	diff: string;
	destructive: boolean;
	asOf?: string;
	/**
	 * Phase 7 Plan 07-05 (DRIFT-02): when set, the kernel runs evaluateIntentDrift over
	 * the rendered receipt and decorates matching citations with intent_drift_badge.
	 * Mandate-C exact-equality (Pitfall 5: 'Quality' !== 'Quality-First').
	 */
	session_priority?: string;
}

export interface ProposeEditResult {
	receipt: ReasoningReceipt;
}

export const ProposeEditRequest = new RequestType<ProposeEditParams, ProposeEditResult, Error>('graph.proposeEdit');

// -------- graph.recordRejection (CANV-03) --------
//
// Creates an OpenQuestion node + 'references' edge to the receipt's first cited node
// (proxy linkage per RESEARCH ## Pattern: Reject-with-Note + ## Pitfall 10) + persists
// detail.rejected_change_id for cross-reference.
//
// Empty notes are rejected at the handler boundary (note.length >= 1).

export interface RecordRejectionParams {
	receipt_id: string;
	change_id: string;
	note: string;
}

export interface RecordRejectionResult {
	open_question_id: string;
}

export const RecordRejectionRequest = new RequestType<RecordRejectionParams, RecordRejectionResult, Error>('graph.recordRejection');

// -------- graph.recordContractOverride (Plan 07-06 — DRIFT-06) --------
//
// Phase 7 audit-trail RPC. Every contract-lock override path (Plan 07-07 bridge save-gate
// override flow) MUST funnel through this method — it is the constitutional pin against
// silent escape hatches. The handler:
//   1. Validates note.length >= 1 (CANV-03 precedent: no empty escape-hatch notes).
//   2. Resolves contract_node_id via dao.queryById; rejects if missing or not a ContractNode.
//   3. Seeds an Attempt(attempt_kind='contract_override') whose body is the developer's note.
//   4. Writes a 'references' edge from the Attempt to the ContractNode (two-tx pattern,
//      mirroring atomicAccept; recovery-scan deferred to Phase-7-iter).
//   5. Increments harvest_metrics_daily.contract_overrides via the optional metrics DAO.
//
// Pitfall-9 shame-loop defense: the per-day count surfaces ONLY in `goatide-cli harvest
// metrics` (opt-in CLI), NOT in the bridge status bar. Plan 07-06 deliberately does not add
// a status-bar badge.

export interface RecordContractOverrideParams {
	change_id: string;
	contract_node_id: string;
	section_name: string;
	note: string;        // >=1 char required (CANV-03 precedent)
}

export interface RecordContractOverrideResult {
	attempt_node_id: string;
}

export const RecordContractOverrideRequest = new RequestType<RecordContractOverrideParams, RecordContractOverrideResult, Error>('graph.recordContractOverride');

// -------- graph.createDecisionNode (Phase 20 AUTH-01) --------
//
// Human-authored DecisionNode write path. The bridge canvas/authoring-flow.ts (Plan 20-03)
// is the SOLE production caller; it enforces Mandate A by calling showInputBox with
// opts.value === '' so the rationale body originates from human keystrokes, never an LLM.
//
// Mandate B fence: refuse-deep05-write.sh BANNED array includes 'createDecisionNode' since
// Plan 20-01; any inspector/*.ts file importing this RPC fails the CI gate. The new method
// lives on KernelClient (NOT in the ReadonlyKernelClient Pick<>) so the structural narrowing
// keeps the read-only inspector layer ignorant of the write surface.
//
// Pattern reference: RecordContractOverrideRequest (lines 194-221) — closest single-tx write
// RPC. createDecisionNode differs in that it does NOT write an edge (Phase 20 OQ#3 scope-cut:
// constraint-link picker deferred to v2.2; this RPC creates a standalone DecisionNode with
// no outgoing edges, equivalent to the historical Plan 04-02 atomicAccept pre-edge state).
//
// repo_id: optional, default 'primary'. Phase 21 XREPO-01 forward-compat — once cross-repo
// workspace support lands, the bridge will pass the active workspace's repo_id; for v2.1 the
// param is always omitted on the bridge side and the server defaults it to 'primary'.

export interface CreateDecisionNodeParams {
	body: string;
	anchor: {
		file?: string;
		symbol?: string;
		ticket_id?: string;
		line?: number;
	};
	derived_under_priority?: string;
	repo_id?: string;
}

export interface CreateDecisionNodeResult {
	node_id: string;
}

export const CreateDecisionNodeRequest = new RequestType<CreateDecisionNodeParams, CreateDecisionNodeResult, Error>('graph.createDecisionNode');

// -------- graph.atomicAccept (CANV-07) --------
//
// Persists an Attempt node with attempt_kind='accepted', tier, accept_latency_ms in the
// payload + a 'references' edge from the Attempt to the receipt's first cited node.
// staging_path + target_path live in provenance.detail for the recovery-scan reverse-lookup.

export interface AtomicAcceptParams {
	change_id: string;
	receipt_id: string;
	tier: 'silent' | 'inline' | 'modal';
	accept_latency_ms: number;
	staging_path: string;
	target_path: string;
	body: string;
	anchor: { file?: string; symbol?: string; line?: number; ticket_id?: string };
}

export interface AtomicAcceptResult {
	attempt_node_id: string;
}

export const AtomicAcceptRequest = new RequestType<AtomicAcceptParams, AtomicAcceptResult, Error>('graph.atomicAccept');

// -------- graph.queryAttemptByStagingPath (CANV-07 recovery scan support) --------
//
// Looks up the most recent active Attempt whose payload references the given staging_path.
// Returns all-null if not found. Used by the bridge's recovery scan (Plan 04-05) to
// reconcile orphan .goat-staging-* files against the kernel's pending Attempts.

export interface QueryAttemptByStagingPathParams {
	staging_path: string;
}

export interface QueryAttemptByStagingPathResult {
	attempt_node_id: string | null;
	target_path: string | null;
	attempt_kind: string | null;
}

export const QueryAttemptByStagingPathRequest = new RequestType<QueryAttemptByStagingPathParams, QueryAttemptByStagingPathResult, Error>('graph.queryAttemptByStagingPath');

// -------- graph.queryNodes (citation hydration for Plan 04-05 save gate) --------
//
// Returns the slim shape needed by classifyTier's contractAllowlist signal: kind + body
// + contract_path? + invalidated_at + successor_id. Bounded scan (one queryById per id),
// no traversal. Plan 04-05 uses this in the cancel-then-redo handler to hydrate
// citationDetails before invoking classifyTier.

export interface QueryNodesParams {
	node_ids: string[];
}

export interface QueryNodesResult {
	nodes: Array<{
		node_id: string;
		kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
		body: string;
		contract_path?: string;
		invalidated_at: string | null;
		successor_id: string | null;
	}>;
}

export const QueryNodesRequest = new RequestType<QueryNodesParams, QueryNodesResult, Error>('graph.queryNodes');

// -------- graph.heartbeat (CANV-10 — liveness probe) --------
//
// Lightweight liveness probe. Bridge polls every 10s; on 30s of missed heartbeat (3
// consecutive misses) the bridge transitions ConnectionStateMachine to degraded. The
// kernel reports its pid + db_path + uptime_ms so the bridge can verify it's the same
// process it spawned (defense-in-depth against pid recycling under fast-restart).
//
// Note: method namespace is `graph.heartbeat` to stay consistent with the other methods
// (every name starts with `graph.`). If a future phase introduces a non-graph surface
// (e.g. Phase 6 MCP), the namespace may be revisited.

export interface HeartbeatParams {
	/* intentionally empty — heartbeat is parameterless */
}

export interface HeartbeatResult {
	ok: boolean;
	pid: number;
	db_path: string;
	uptime_ms: number;
}

export const HeartbeatRequest = new RequestType<HeartbeatParams, HeartbeatResult, Error>('graph.heartbeat');

// -------- harvester.authenticate (TELE-05 — daemon TCP per-socket auth gate) --------
//
// MUST be the first request issued on every fresh TCP connection. The kernel rejects
// other request types until this round-trips successfully. Wrong tokens trigger
// connection.dispose() + socket.destroy() so the bridge falls through to spawnDetachedKernel
// (lockfile tampering / stale token after a stale-pid kernel was cleared).

export interface AuthenticateParams {
	token: string;
}

export interface AuthenticateResult {
	ok: true;
}

export const AuthenticateRequest = new RequestType<AuthenticateParams, AuthenticateResult, Error>('harvester.authenticate');

// -------- harvester.submitObservation (Plan 05-03 — RawObservation ingest) --------
//
// Accepts a discriminated-union RawObservation (claude_jsonl | editor_save |
// terminal_shell | git_commit). The handler runs Zod validation at the boundary; on
// schema failure returns {accepted: false, reject_reason: 'schema_violation: ...'}
// instead of throwing — deterministic error reporting for the bridge.
//
// Per-source enrichment dispatch + provisional filter/promoter scaffold lives in
// kernel/src/harvester/index.ts submitRawObservation. Plans 05-05 (filter), 05-06
// (promoter), and 05-07 (liveness) flesh out the placeholders.
//
// Auth gate from Plan 05-02 inherited: caller must have authenticated first on the
// per-socket TCP connection before this RPC is reachable.

export type SubmitObservationParams = RawObservation;
export type { SubmitObservationResult };

export const SubmitObservationRequest = new RequestType<SubmitObservationParams, SubmitObservationResult, Error>('harvester.submitObservation');

// -------- harvester.getLiveness (Plan 05-07 — TELE-06 watchdog) --------
//
// Bridge polls every 30s (configurable via env GOATIDE_LIVENESS_POLL_INTERVAL_MS for tests).
// Kernel reads the in-memory LivenessState; sources never observed return stale=false on
// first call (initial-grace via boot timestamp).

export interface GetLivenessParams {
	/* intentionally empty — getLiveness is parameterless */
}

export interface GetLivenessResult {
	sources: LivenessReport[];
}

export const GetLivenessRequest = new RequestType<GetLivenessParams, GetLivenessResult, Error>('harvester.getLiveness');
export type { LivenessReport };

// -------- harvester.getDailyMetrics (Plan 05-07 — PORT-06 dashboard) --------
//
// Returns last <days> rows from harvest_metrics_daily, sorted (date_utc DESC, source ASC).
// Used by `goatide-cli harvest metrics` for the per-source accept-rate dashboard. The
// sustained_zero_sources field is the calibration signal — sources with sustained volume
// but zero promotions are surfaced as a footer warning.

export interface GetDailyMetricsParams {
	days: number;
	/** Override the volume floor for sustained-zero detection. Defaults to 10. */
	min_daily_volume_floor?: number;
}

export interface GetDailyMetricsResult {
	rows: HarvestMetricsRow[];
	sustained_zero_sources: ObservationSource[];
}

export const GetDailyMetricsRequest = new RequestType<GetDailyMetricsParams, GetDailyMetricsResult, Error>('harvester.getDailyMetrics');
export type { HarvestMetricsRow };

// -------- mcp.* (Plan 06-06 — MCP-03 + MCP-06 + MCP-07 RPC surface) --------
//
// Four NEW request types backing the bridge UI surfaces:
//   - mcp.getProviderState(provider)            — banner click target reads the ProviderState string.
//   - mcp.getSchemaDriftReport()                — SchemaDriftBanner polls every 30s.
//   - mcp.acceptProviderSchemaDrift(provider)   — "Accept new schema" quickPick action.
//   - mcp.reconnectProvider(provider)           — goatide.mcp.reconnect command + LivenessBanner action.
//
// Snake_case wire-property names (provider, drift_summary, paused, accepted, reconnected)
// match the rest of the kernel surface.

export type McpProviderNameWire = 'github' | 'slack' | 'linear' | 'jira';
export type McpProviderStateWire = 'connecting' | 'connected' | 'paused_drift' | 'paused_auth' | 'restarting' | 'closed';

export interface McpGetProviderStateParams {
	provider: McpProviderNameWire;
}

export interface McpGetProviderStateResult {
	provider: McpProviderNameWire;
	state: McpProviderStateWire;
}

export const McpGetProviderStateRequest = new RequestType<McpGetProviderStateParams, McpGetProviderStateResult, Error>('mcp.getProviderState');

export interface McpGetSchemaDriftReportParams {
	/* intentionally empty — getSchemaDriftReport is parameterless */
}

export interface McpSchemaDriftReportEntry {
	provider: McpProviderNameWire;
	paused: boolean;
	drift_summary?: string;
}

export interface McpGetSchemaDriftReportResult {
	providers: McpSchemaDriftReportEntry[];
}

export const McpGetSchemaDriftReportRequest = new RequestType<McpGetSchemaDriftReportParams, McpGetSchemaDriftReportResult, Error>('mcp.getSchemaDriftReport');

// -------- mcp.listProviders (Plan 10-02 — POLISH-02 precondition for SchemaDriftBanner polling) --------
//
// Phase 10 Plan 10-00 stages this type contract; Plan 10-02 registers the handler. The
// bridge's SchemaDriftBanner uses this method as a precondition gate — when no providers
// are configured (empty array), the banner skips its 30s drift-report poll loop entirely,
// avoiding unnecessary kernel round-trips at idle. When >=1 provider is configured, the
// banner resumes its standard poll cadence.
//
// Wire shape mirrors McpGetSchemaDriftReport — parameterless request, `providers` array
// result. Snake_case wire-property name (`providers`) is symmetric with the rest of the
// kernel mcp.* surface.

/**
 * Parameters for `mcp.listProviders`. Intentionally empty: the kernel returns the full
 * configured-provider set regardless of caller context.
 */
export interface McpListProvidersParams {
	/* intentionally empty — listProviders is parameterless */
}

/**
 * Result of `mcp.listProviders`. The `providers` array is empty when no MCP providers
 * have been configured (Plan 06-04 keychain entries absent). The bridge's
 * SchemaDriftBanner treats an empty array as a signal to suppress its drift-report poll.
 */
export interface McpListProvidersResult {
	providers: McpProviderNameWire[];
}

export const McpListProvidersRequest = new RequestType<McpListProvidersParams, McpListProvidersResult, Error>('mcp.listProviders');

export interface McpAcceptProviderSchemaDriftParams {
	provider: McpProviderNameWire;
}

export interface McpAcceptProviderSchemaDriftResult {
	accepted: boolean;
}

export const McpAcceptProviderSchemaDriftRequest = new RequestType<McpAcceptProviderSchemaDriftParams, McpAcceptProviderSchemaDriftResult, Error>('mcp.acceptProviderSchemaDrift');

export interface McpReconnectProviderParams {
	provider: McpProviderNameWire;
}

export interface McpReconnectProviderResult {
	reconnected: boolean;
}

export const McpReconnectProviderRequest = new RequestType<McpReconnectProviderParams, McpReconnectProviderResult, Error>('mcp.reconnectProvider');

// -------- graph.runDriftAndLock (Plan 07-07 — DRIFT-01 + DRIFT-03 bridge integration) --------
//
// Phase 7 RPC method bridging the kernel's pattern detector (Plan 07-02) + lock detector
// (Plan 07-03) into the bridge save-gate flow. The bridge calls this between proposeEdit
// and tier-dispatch:
//   1. Resolves the contract registry once via loadContractRegistry(dao, asOf).
//   2. Runs runDriftDetector against the diff for pattern-level findings.
//   3. Runs detectsContractLock against the diff for enforcing-section locks.
//
// Wire shape uses snake_case for symmetry with the rest of the kernel surface. Result is
// the structural pair {drift_findings, lock_trigger} that tier-dispatch's classifyTier
// consumes (escalate to inline on findings, force modal on lock).

export interface RunDriftAndLockParams {
	diff: string;
	asOf: string;
}

export interface RunDriftAndLockResult {
	drift_findings: DriftFinding[];
	lock_trigger: LockTrigger | null;
}

export const RunDriftAndLockRequest = new RequestType<RunDriftAndLockParams, RunDriftAndLockResult, Error>('graph.runDriftAndLock');

// -------- graph.runRippleProgressive (Plan 07-07 — DRIFT-04 + DRIFT-05 bridge integration) --------
//
// Phase 7 RPC method bridging the kernel's progressive-disclosure ripple analyzer (Plan
// 07-04) into the bridge save-gate flow. The handler runs in two phases:
//   Phase A: synchronous runRippleAnalysis(maxHops:1); emits a graph.driftProgress
//            notification with hops_complete=1 + the partial report.
//   Phase B: yield (setImmediate); runRippleAnalysis(maxHops:3); returns as the final
//            response.
//
// vscode-jsonrpc 8.2.1 sendNotification flushes synchronously to the underlying transport;
// the bridge sees the notification BEFORE the awaited Promise resolves (verified by the
// notification-ordering test in kernel/src/test/drift/rpc.spec.ts).

export interface RunRippleProgressiveParams {
	contract_node_id: string;
	asOf: string;
}

export interface RunRippleProgressiveResult {
	report: ComplianceReport;
}

/**
 * Notification emitted mid-flight by graph.runRippleProgressive. The bridge subscribes to
 * this notification type via connection.onNotification and uses Promise.race against a 50ms
 * timeout to avoid blocking dispatch on slow notifications (Plan 07-07 Truth #5).
 */
export interface DriftProgressNotification {
	hops_complete: 1 | 3;
	partial: ComplianceReport;
}

export const RunRippleProgressiveRequest = new RequestType<RunRippleProgressiveParams, RunRippleProgressiveResult, Error>('graph.runRippleProgressive');
export const DriftProgressNotificationType = new NotificationType<DriftProgressNotification>('graph.driftProgress');

// -------- graph.constraintLift (Phase 16 Plan 16-01 — DEEP-03 wire type; handler lands Wave 1 in Plan 16-02) --------
//
// Hypothetical-impact analyzer seeded from a ConstraintNode. Walks outgoing
// (parent_of | references | derived_from | protects) edges up to maxHops (1|2|3 literal-union).
// Mandate B: read-only — the handler NEVER calls atomicAccept/proposeEdit/recordRejection/
// recordContractOverride. The bridge-side Mandate B regression test in
// constraint-lift-no-graph-mutation.test.ts verifies this via KernelClient.prototype spy.
// refuse-unbounded-ripple-walk.sh (widened in Plan 16-01 Task 5) CI-gates max_hops <= 3.

export interface ConstraintLiftParams {
	constraint_node_id: string;
	asOf: string;
	max_hops?: 1 | 2 | 3;          // default 3
	confidence_threshold?: number;  // 0.0..1.0; default 0.5
}
export interface ConstraintLiftResult {
	hypothetical_impact: ComplianceReport;
	confidence_score: number;
}
export const ConstraintLiftRequest = new RequestType<ConstraintLiftParams, ConstraintLiftResult, Error>('graph.constraintLift');
