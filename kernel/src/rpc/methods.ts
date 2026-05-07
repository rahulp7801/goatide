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

import { RequestType } from 'vscode-jsonrpc';
import type { AnchorRequest } from '../graph/anchor.js';
import type { Scope, TraverseRow } from '../graph/traverse.js';
import type { ReasoningReceipt } from '../receipt/index.js';
import type { RawObservation, ObservationSource } from '../harvester/observations.js';
import type { SubmitObservationResult } from '../harvester/index.js';
import type { LivenessReport } from '../harvester/liveness.js';
import type { HarvestMetricsRow } from '../harvester/metrics.js';

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

// -------- graph.proposeEdit --------

export interface ProposeEditParams {
	diff: string;
	destructive: boolean;
	asOf?: string;
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
