/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge-side mirror of kernel/src/rpc/methods.ts. Same vscode-jsonrpc version (^8.2.1) so
// the wire shape is byte-identical. Pitfall 5: NEVER bump the bridge to 9.x while the kernel
// is on 8.x.
//
// Re-declarations of the kernel-side types. We mirror the SHAPE, not the import — bridge cannot
// import from kernel/src directly without bundling. (In practice esbuild can bundle kernel
// pure modules, but for typed RequestTypes the safer path is duplication. They never drift
// because the wire schema is the contract.)
//
// Snake_case wire-property names (receipt_id, change_id, staging_path, target_path,
// accept_latency_ms, attempt_kind, attempt_node_id, node_ids) — explicit exception to
// CLAUDE.md ## Naming Conventions camelCase rule, mirroring the kernel side per
// STATE.md ## Decisions [Phase 04] entry.

import { RequestType, NotificationType } from 'vscode-jsonrpc';

// -------- graph.queryGraph --------

export interface AnchorRequest {
	kind: 'file' | 'symbol' | 'ticket' | 'node_id';
	path?: string;
	value?: string;
	symbol?: string;
	ticket_id?: string;
	// Phase 14 Plan 14-02 (DEEP-01) — id field used when kind === 'node_id'. The kernel's
	// resolveAnchor switch reads req.id for the node_id branch (kernel/src/graph/anchor.ts).
	// Bridge ↔ kernel wire shape: snake_case JSON, byte-identical to the kernel's
	// AnchorRequest discriminated union.
	id?: string;
}

export interface QueryGraphParams {
	anchor: AnchorRequest;
	scope?: 'parents' | 'siblings' | 'references' | 'all';
	max_hops?: number;
	at?: string;
}

export interface TraverseRow {
	node_id: string;
	level: number;
	edge_path: string;
	kind: string;
}

export interface QueryGraphResult {
	nodes: TraverseRow[];
	paths: string[];
}

export const QueryGraphRequest = new RequestType<QueryGraphParams, QueryGraphResult, Error>('graph.queryGraph');

// -------- graph.queryRationaleAt (Plan 14-02 — DEEP-01) --------
//
// Bridge-side mirror of the kernel's QueryRationaleAtRequest. The Verification Canvas
// "Why does this exist?" button click posts canvas.requestRationale to the host;
// panel.ts handleMessage extracts the citation seed + the receipt's
// graph_snapshot_tx_time, then calls KernelClient.queryRationaleAt with that asOf —
// REC-03 single-snapshot invariant (Pitfall 1 fence: NEVER new Date().toISOString() at
// click time). Wire shape is byte-identical to kernel/src/rpc/methods.ts.

export interface RationaleChainEntry {
	node_id: string;
	kind: 'ConstraintNode' | 'DecisionNode';
	body: string;
	valid_from: string;
	invalidated_at: string | null;
	successor_id: string | null;
	confidence: 'Explicit' | 'Inferred';
	edge_path: string;
	derived_under_priority?: string;
}

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

// -------- graph.proposeEdit --------
//
// Phase 7 Plan 07-05 (DRIFT-02): ProposeEditParams gains optional session_priority.
// When supplied, the kernel runs evaluateIntentDrift over the rendered receipt and
// decorates matching citations with intent_drift_badge. Backward compatible: the field is
// optional; pre-Plan-07-05 callers omit it. Mandate-C exact-equality (Pitfall 5).

export interface ProposeEditParams {
	diff: string;
	destructive: boolean;
	asOf?: string;
	session_priority?: string;
}

export interface IntentDriftBadge {
	citation_node_id: string;
	session_priority: string;
	cited_priority: string;
	explanation: string;
}

export interface Citation {
	node_id: string;
	version: string;
	confidence: 'Explicit' | 'Inferred';
	edge_path: string;
	snippet: string;
	/**
	 * Phase 7 Plan 07-05: present when proposeEdit was called with session_priority and
	 * the kernel decorated this citation. Null on matching DecisionNode citations (or
	 * non-DecisionNode citations); undefined when session_priority was not supplied.
	 */
	intent_drift_badge?: IntentDriftBadge | null;
}

export interface ReasoningReceipt {
	id: string;
	change_id: string;
	citations: Citation[];
	drill_chain: string[];
	destructive: boolean;
	graph_snapshot_tx_time: string;
}

export interface ProposeEditResult {
	receipt: ReasoningReceipt;
}

export const ProposeEditRequest = new RequestType<ProposeEditParams, ProposeEditResult, Error>('graph.proposeEdit');

// -------- graph.recordRejection (CANV-03) --------

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

export interface QueryAttemptByStagingPathParams {
	staging_path: string;
}

export interface QueryAttemptByStagingPathResult {
	attempt_node_id: string | null;
	target_path: string | null;
	attempt_kind: string | null;
}

export const QueryAttemptByStagingPathRequest = new RequestType<QueryAttemptByStagingPathParams, QueryAttemptByStagingPathResult, Error>('graph.queryAttemptByStagingPath');

// -------- graph.queryNodes (citation hydration for save-gate) --------

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
// Lightweight liveness probe; bridge-side mirror of the kernel's HeartbeatRequest. Used by
// HeartbeatPoller (Plan 04-06) to detect a hung-but-alive kernel that doesn't drop the
// stdio connection.

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
// other request types until this round-trips successfully. Wrong tokens close the socket
// and the bridge falls through to spawnDetachedKernel.

export interface AuthenticateParams {
	token: string;
}

export interface AuthenticateResult {
	ok: true;
}

export const AuthenticateRequest = new RequestType<AuthenticateParams, AuthenticateResult, Error>('harvester.authenticate');

// -------- harvester.submitObservation (Plan 05-03 — RawObservation ingest) --------
//
// Mirror of the kernel-side SubmitObservationRequest. The wire shape is the
// RawObservation discriminated-union (single source of truth in
// kernel/src/harvester/observations.ts). Bridge cannot statically import the kernel-side
// Zod schema (CJS<->ESM constraint per Plan 04-05); we redeclare the union structurally.
//
// Plan 05-04 makes APPEND-ONLY additive edits inside the terminal_shell branch — no
// replacement of any existing branch. The schema grows additively across plans.

interface BaseObservationFields {
	id: string;
	ts: string;
	body: string;
}

export interface ClaudeJsonlObservationInput extends BaseObservationFields {
	source: 'claude_jsonl';
	file_path: string;
	parsed?: unknown;
}

export interface EditorSaveObservationInput extends BaseObservationFields {
	source: 'editor_save';
	file_path: string;
	language: string;
	line_count: number;
	detail?: { working_set_size: number };
}

export interface TerminalShellObservationInput extends BaseObservationFields {
	source: 'terminal_shell';
	output: string;
	exit_code: number | null;
	cwd: string | null;
	detail?: { confidence: number; truncated: boolean };
}

export interface GitCommitObservationInput extends BaseObservationFields {
	source: 'git_commit';
	repo_path: string;
	head_commit_at_emit: string | null;
	head_branch_at_emit: string | null;
	diff?: string;
	message?: string;
	author?: string;
	files_changed?: number;
}

/**
 * Phase 6 Plan 06-05 — MCP-04/05 external-signal observation. Bridge mirror of the
 * kernel-side McpExternalSignalObservationSchema (kernel/src/harvester/observations.ts).
 * Routed via kernel/src/mcp/clients/observation-router.ts — the bridge does NOT submit
 * mcp_external_signal observations directly today (the kernel's MCP consume side wraps
 * tool-call results internally), but this mirror exists so the bridge type-system stays
 * structurally aligned with the kernel's RawObservation union.
 */
export interface McpExternalSignalObservationInput extends BaseObservationFields {
	source: 'mcp_external_signal';
	provider: 'github' | 'slack' | 'linear' | 'jira';
	tool_name: string;
	detail?: {
		candidate_node_kind_hint?: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | null;
		[k: string]: unknown;
	};
}

export type SubmitObservationParams =
	| ClaudeJsonlObservationInput
	| EditorSaveObservationInput
	| TerminalShellObservationInput
	| GitCommitObservationInput
	| McpExternalSignalObservationInput;

export interface SubmitObservationResult {
	id: string;
	accepted: boolean;
	reject_reason?: string;
}

export const SubmitObservationRequest = new RequestType<SubmitObservationParams, SubmitObservationResult, Error>('harvester.submitObservation');

// -------- harvester.getLiveness (Plan 05-07 TELE-06) --------
//
// Bridge-side mirror of the kernel's GetLivenessRequest. LivenessBanner polls every
// 30s (configurable via env GOATIDE_LIVENESS_POLL_INTERVAL_MS).

export interface LivenessReport {
	source: string;
	stale: boolean;
	silent_for_ms: number;
	threshold_ms: number;
	last_observation_iso?: string;
}

export interface GetLivenessParams {
	/* intentionally empty — getLiveness is parameterless */
}

export interface GetLivenessResult {
	sources: LivenessReport[];
}

export const GetLivenessRequest = new RequestType<GetLivenessParams, GetLivenessResult, Error>('harvester.getLiveness');

// -------- harvester.getDailyMetrics (Plan 05-07 PORT-06) --------
//
// Bridge-side mirror. The CLI consumer talks DB-direct; this binding exists for any
// future bridge-resident dashboard surface (Phase-6 MCP / metrics UI).

export interface HarvestMetricsRow {
	date_utc: string;
	source: string;
	submitted: number;
	rejected_by_filter: number;
	promoted_to_node: number;
}

export interface GetDailyMetricsParams {
	days: number;
	min_daily_volume_floor?: number;
}

export interface GetDailyMetricsResult {
	rows: HarvestMetricsRow[];
	sustained_zero_sources: string[];
}

export const GetDailyMetricsRequest = new RequestType<GetDailyMetricsParams, GetDailyMetricsResult, Error>('harvester.getDailyMetrics');

// -------- mcp.* (Plan 06-06 — bridge mirror of kernel-side MCP-03 + MCP-06 + MCP-07 RPC surface) --------
//
// Four NEW request types backing the bridge UI surfaces:
//   - mcp.getProviderState(provider)            — banner click target reads the ProviderState string.
//   - mcp.getSchemaDriftReport()                — SchemaDriftBanner polls every 30s.
//   - mcp.acceptProviderSchemaDrift(provider)   — "Accept new schema" quickPick action.
//   - mcp.reconnectProvider(provider)           — goatide.mcp.reconnect command + LivenessBanner action.
//
// Snake_case wire-property names mirror the kernel side. Wire shape is byte-identical to
// kernel/src/rpc/methods.ts; bridge cannot import kernel/src/rpc/methods.ts directly without
// bundling, so we redeclare here per the pattern established for the other RPC surfaces.

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
// Bridge-side mirror of the kernel's McpListProvidersRequest. SchemaDriftBanner calls this
// before starting its 30s drift-report poll loop; an empty `providers` array suppresses the
// poll until at least one provider is configured. Wire shape is byte-identical to
// kernel/src/rpc/methods.ts (Pitfall 5: never let the bridge drift from the kernel surface).

/**
 * Parameters for `mcp.listProviders`. Intentionally empty: the kernel returns the full
 * configured-provider set regardless of caller context.
 */
export interface McpListProvidersParams {
	/* intentionally empty — listProviders is parameterless */
}

/**
 * Result of `mcp.listProviders`. Empty array when no MCP providers have been configured;
 * SchemaDriftBanner skips its drift-report poll in that case.
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

// -------- graph.recordContractOverride (Plan 07-06 — DRIFT-06 audit-trail RPC) --------
//
// Bridge-side mirror of the kernel's RecordContractOverrideRequest. tier-dispatch.ts is the
// SOLE caller (Option A: save-gate-owned override path). refuse-silent-override.sh
// allowlists kernel/src/drift/ + bridge/src/save-gate/, ensuring no parallel path bypasses
// the audit trail.

export interface RecordContractOverrideParams {
	change_id: string;
	contract_node_id: string;
	section_name: string;
	note: string;
}

export interface RecordContractOverrideResult {
	attempt_node_id: string;
}

export const RecordContractOverrideRequest = new RequestType<RecordContractOverrideParams, RecordContractOverrideResult, Error>('graph.recordContractOverride');

// -------- graph.runDriftAndLock (Plan 07-07 — DRIFT-01 + DRIFT-03 bridge integration) --------
//
// Bridge-side mirror of the kernel's RunDriftAndLockRequest. on-will-save.ts calls this
// between proposeEdit and tier-dispatch; the result feeds CanvasShowPayload + classifyTier.

export interface DriftFinding {
	contract_node_id: string;
	contract_anchor_file: string;
	pattern_index: number;
	pattern_kind: 'regex' | 'jsonpath' | 'forbidden_import';
	file: string;
	hunk_line: number;
	message: string;
}

export interface LockTrigger {
	contract_node_id: string;
	contract_anchor_file: string;
	section_name: string;
	edited_line_range: readonly [number, number];
	hunk_index: number;
}

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
// Bridge-side mirror of the kernel's RunRippleProgressiveRequest + DriftProgressNotificationType.
// tier-dispatch.ts subscribes to graph.driftProgress notifications via connection.onNotification
// and uses Promise.race against a 50ms timeout to avoid blocking dispatch on slow notifications.

export interface ComplianceRow {
	node_id: string;
	kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	anchor_file?: string;
	edge_path: string;
	hops: 1 | 2 | 3;
	body_preview: string;
}

export interface ComplianceReport {
	contract_node_id: string;
	max_hops: 1 | 2 | 3;
	definitely_affected: ComplianceRow[];
	potentially_affected: ComplianceRow[];
	truncated: boolean;
	generated_at: string;
}

export interface RunRippleProgressiveParams {
	contract_node_id: string;
	asOf: string;
}

export interface RunRippleProgressiveResult {
	report: ComplianceReport;
}

export interface DriftProgressNotification {
	hops_complete: 1 | 3;
	partial: ComplianceReport;
}

export const RunRippleProgressiveRequest = new RequestType<RunRippleProgressiveParams, RunRippleProgressiveResult, Error>('graph.runRippleProgressive');
export const DriftProgressNotificationType = new NotificationType<DriftProgressNotification>('graph.driftProgress');
