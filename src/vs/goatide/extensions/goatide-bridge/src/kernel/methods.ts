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

import { RequestType } from 'vscode-jsonrpc';

// -------- graph.queryGraph --------

export interface AnchorRequest {
	kind: 'file' | 'symbol' | 'ticket' | 'node_id';
	path?: string;
	value?: string;
	symbol?: string;
	ticket_id?: string;
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

// -------- graph.proposeEdit --------

export interface ProposeEditParams {
	diff: string;
	destructive: boolean;
	asOf?: string;
}

export interface Citation {
	node_id: string;
	version: string;
	confidence: 'Explicit' | 'Inferred';
	edge_path: string;
	snippet: string;
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
