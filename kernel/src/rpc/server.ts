/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/rpc/server.ts — Phase 3 (Plan 03-04) + Phase 4 (Plan 04-04) + Phase 5 (Plan 05-02).
//
// Phase-3 surface: queryGraph + proposeEdit. vscode-jsonrpc 8.2.1 (NOT 9.x — see Plan 03-01
// SUMMARY for the version-pin rationale). StreamMessageReader/Writer over process.stdin/stdout
// (LSP wire format). Pitfall 3 — STDOUT IS RESERVED for JSON-RPC framing.
//
// Plan 04-04 adds: graph.recordRejection, graph.atomicAccept,
// graph.queryAttemptByStagingPath, graph.queryNodes. Plan 04-06 adds graph.heartbeat.
//
// Plan 05-02 generalises createRpcServer into a transport-agnostic factory:
//   - createRpcServer({ transport: 'stdio', ... })  — existing behavior (back-compat).
//   - bindHandlersForTcp({ connection, socket, authState, expectedToken, ... })
//       — wires the handler set per TCP socket; gates everything except harvester.authenticate
//         until authState.authenticated flips true.

import type * as net from 'node:net';
import * as rpc from 'vscode-jsonrpc/node.js';
import type Database from 'better-sqlite3';
import { resolveAnchor, traverse, type GraphDAO, type NodeKind } from '../graph/index.js';
import { composeRationaleChainAt } from '../graph/rationale-chain.js';
import { buildReceipt, renderReceipt, type ReceiptDAO } from '../receipt/index.js';
import { validateAuthToken } from '../daemon/auth-token.js';
import { submitRawObservation, type HarvesterDeps } from '../harvester/index.js';
import { RawObservationSchema, type ObservationSource } from '../harvester/observations.js';
import { flipCiteEligibleOnAcceptedReceipt } from '../harvester/promotion-gate/index.js';
import { resolveLivenessThresholdsFromEnv } from '../harvester/liveness.js';
import { resolvePort06ParamsFromEnv, type HarvestMetricsDao } from '../harvester/metrics.js';
import {
	QueryGraphRequest,
	QueryRationaleAtRequest,
	QueryGraphSnapshotRequest,
	QueryTimelineTransitionsRequest,
	ConstraintLiftRequest,
	ProposeEditRequest,
	RecordRejectionRequest,
	RecordContractOverrideRequest,
	CreateDecisionNodeRequest,
	AtomicAcceptRequest,
	QueryAttemptByStagingPathRequest,
	QueryNodesRequest,
	HeartbeatRequest,
	AuthenticateRequest,
	SubmitObservationRequest,
	GetLivenessRequest,
	GetDailyMetricsRequest,
	McpGetProviderStateRequest,
	McpGetSchemaDriftReportRequest,
	McpListProvidersRequest,
	McpAcceptProviderSchemaDriftRequest,
	McpReconnectProviderRequest,
	RunDriftAndLockRequest,
	RunRippleProgressiveRequest,
	DriftProgressNotificationType,
	type QueryGraphResult,
	type QueryRationaleAtResult,
	type QueryGraphSnapshotResult,
	type QueryTimelineTransitionsResult,
	type SerializedNodeSnapshot,
	type SerializedEdgeSnapshot,
	type ConstraintLiftResult,
	type ProposeEditResult,
	type RecordRejectionResult,
	type RecordContractOverrideResult,
	type CreateDecisionNodeResult,
	type AtomicAcceptResult,
	type QueryAttemptByStagingPathResult,
	type QueryNodesResult,
	type HeartbeatResult,
	type AuthenticateResult,
	type SubmitObservationResult,
	type GetLivenessResult,
	type GetDailyMetricsResult,
	type McpGetProviderStateResult,
	type McpGetSchemaDriftReportResult,
	type McpListProvidersResult,
	type McpAcceptProviderSchemaDriftResult,
	type McpReconnectProviderResult,
	type RunDriftAndLockResult,
	type RunRippleProgressiveResult,
} from './methods.js';
import type { McpProviderName, ProviderState } from '../mcp/clients/types.js';
import { computeMcpLiveness } from '../mcp/liveness.js';
import {
	loadContractRegistry,
	runDriftDetector,
	detectsContractLock,
	runRippleAnalysis,
} from '../drift/index.js';
import { runConstraintLiftAnalysis } from '../drift/constraint-lift.js';

export interface CreateRpcServerArgs {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	/** DB path for heartbeat reporting (Plan 04-06). Defaults to '<unknown>' if not provided. */
	dbPath?: string;
	/**
	 * Phase 7 Plan 07-06 (DRIFT-06): optional HarvestMetricsDao for the contract-override
	 * counter. When present, graph.recordContractOverride bumps the daily counter (source=
	 * 'canvas'). Stdio mode in production runs without metrics (the daemon owns the metrics
	 * lifecycle); tests inject a harness-owned DAO so the increment-side assertion lands.
	 */
	metrics?: HarvestMetricsDao;
	/** Override stdin/stdout for tests (defaults to process.stdin/process.stdout). */
	reader?: rpc.MessageReader;
	writer?: rpc.MessageWriter;
	/**
	 * Phase 16 Plan 16-02 — optional pre-built connection for tests that construct their own
	 * reader/writer pair and pass an already-created connection. When provided, skips the
	 * createMessageConnection(reader, writer) call and binds handlers directly to this connection.
	 * Production stdio mode never passes this; it uses reader/writer (or process.stdin/stdout).
	 */
	connection?: rpc.MessageConnection;
}

/**
 * Per-socket trust state for the TCP transport. The first request on any TCP socket MUST
 * be harvester.authenticate; until that round-trips with the correct token,
 * authenticated=false and every other handler returns an "Unauthenticated" error.
 */
export interface SocketAuthState {
	authenticated: boolean;
}

/**
 * Plan 06-06 — control surface the RPC server uses to answer mcp.* requests. Implemented by
 * the daemon's McpClientPool; the structural interface keeps the RPC layer ignorant of the
 * concrete pool class so unit tests can drive the handlers with synthetic mocks.
 */
export interface McpControlSurface {
	getProviderState: (provider: McpProviderName) => ProviderState;
	getSchemaDriftReport: () => Array<{ provider: McpProviderName; paused: boolean; drift_summary?: string }>;
	acceptProviderSchemaDrift: (provider: McpProviderName) => Promise<boolean>;
	reconnect: (provider: McpProviderName) => Promise<void>;
	/**
	 * Plan 10-02 (POLISH-02) — names of providers configured for this pool. Sourced from
	 * the daemon's `McpClientPool.listProviders()` (configs.map(c => c.provider) at pool
	 * construction time). The wrapping `mcp.listProviders` RPC handler is registered
	 * UNCONDITIONALLY (outside the `if (mcpControl)` gate) so the bridge always receives a
	 * structured response — when no providers are configured, the handler returns
	 * `{providers: []}` via the `mcpControl?.listProviders() ?? []` nullish-coalesce.
	 */
	listProviders: () => McpProviderName[];
}

interface HandlerContext {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	dbPath: string;
	startMs: number;
	/**
	 * Plan 07-06 (DRIFT-06): optional metrics DAO for contract-override counter.
	 * graph.recordContractOverride calls metrics?.incrementContractOverride('canvas', now)
	 * after the Attempt seed + edge land. Absent in stdio mode, present in daemon mode AND
	 * test harnesses that wire harness.metrics.
	 */
	metrics?: HarvestMetricsDao;
}

/**
 * Bind every kernel RPC handler to the given connection. When authState is provided, the
 * handlers are gated: any request other than harvester.authenticate returns an
 * "Unauthenticated" error until authState.authenticated flips true.
 *
 * harvesterDeps is optional: when present, the harvester.submitObservation handler is
 * registered (parses RawObservation via Zod at boundary, dispatches to
 * submitRawObservation). Stdio mode (no harvester pipeline running in-process) doesn't
 * pass deps; daemon mode does.
 */
function bindHandlers(
	connection: rpc.MessageConnection,
	ctx: HandlerContext,
	authState?: SocketAuthState,
	harvesterDeps?: HarvesterDepsForRpc,
	mcpControl?: McpControlSurface,
): void {
	const requireAuth = <P, R>(fn: (params: P) => R): ((params: P) => R) => {
		if (!authState) {
			return fn;
		}
		return (params: P): R => {
			if (!authState.authenticated) {
				throw new Error('harvester.authenticate must succeed before any other request');
			}
			return fn(params);
		};
	};

	connection.onRequest(QueryGraphRequest, requireAuth((params): QueryGraphResult => {
		const at = params.at ?? new Date().toISOString();
		const seedNodes = resolveAnchor(ctx.dao, params.anchor, at);
		if (seedNodes.length === 0) {
			return { nodes: [], paths: [] };
		}
		const traversal = traverse(ctx.sqlite, {
			anchorIds: seedNodes.map((n) => n.id),
			scope: params.scope ?? 'all',
			max_hops: params.max_hops ?? 4,
			at,
		});
		return { nodes: traversal.nodes, paths: traversal.paths };
	}));

	// Phase 14 Plan 14-02 — graph.queryRationaleAt (DEEP-01 bitemporal rationale chain).
	//
	// Composes resolveAnchor + traverse + filter + findSuccessor (see
	// kernel/src/graph/rationale-chain.ts). The handler passes params.asOf VERBATIM with no
	// fallback — the bridge always supplies the receipt's graph_snapshot_tx_time (REC-03
	// single-snapshot invariant; Pitfall 1 asOf-drift fence). New Date().toISOString() does
	// NOT appear in this handler or in composeRationaleChainAt — caller responsibility.
	connection.onRequest(QueryRationaleAtRequest, requireAuth((params): QueryRationaleAtResult => {
		const result = composeRationaleChainAt(
			{ dao: ctx.dao, sqlite: ctx.sqlite },
			{ anchor: params.anchor, asOf: params.asOf, maxHops: params.max_hops },
		);
		return {
			chain: [...result.chain],
			has_superseded: result.has_superseded,
		};
	}));

	// Phase 15 Plan 15-02 — graph.queryGraphSnapshot (DEEP-02 bitemporal snapshot for the
	// Graph Inspector). Composes dao.queryAsOf (nodes) + dao.queryEdgesAsOf (edges, landed in
	// Plan 15-01) at the single asOf threaded verbatim from params. Pitfall 1 fence (REC-03
	// single-snapshot invariant): no new Date().toISOString() or Date.now() in this handler;
	// params.asOf is the sole timestamp source.
	//
	// Truncation: max_nodes (default 2000) caps the response so unbounded graphs don't blow
	// the wire budget. When truncated, `truncated: true` is set AND only edges whose src + dst
	// are both in the truncated node set are emitted (orphan-edge prevention via O(1) Set
	// membership). Wave 3 (Plan 15-04) renders a "Showing first N nodes (truncated)" banner.
	//
	// Label: payload.body (first 80 chars). The discriminated-union payload has body on every
	// variant (kernel/src/graph/payloads.ts:107-113), but we defensively guard via typeof so
	// any future variant without a string body falls back to empty rather than throws.
	connection.onRequest(QueryGraphSnapshotRequest, requireAuth((params): QueryGraphSnapshotResult => {
		const cap = params.max_nodes ?? 2000;
		const nodeRows = ctx.dao.queryAsOf(params.asOf);
		const truncated = nodeRows.length > cap;
		const trimmedNodeRows = truncated ? nodeRows.slice(0, cap) : nodeRows;

		const nodes: SerializedNodeSnapshot[] = trimmedNodeRows.map((r) => {
			const body = (r.payload as { body?: unknown }).body;
			const label = typeof body === 'string' ? body.slice(0, 80) : '';
			return {
				node_id: r.id,
				kind: r.kind,
				label,
				valid_from: r.valid_from,
				invalidated_at: r.invalidated_at,
				// Phase 17 Plan 17-04 DEEP-06 phase-B — Pitfall D defense. Projects repo_id from
				// NodeRow (B1 prerequisite: dao.ts materialize() now copies raw.repo_id). All
				// pre-Phase-16 rows are 'primary' via migration 0008 backfill.
				repo_id: r.repo_id,
			};
		});

		// Orphan-edge prevention: only emit edges where both endpoints are in the truncated
		// node set. The Set is built from the post-truncation node list so the predicate is
		// trivially correct when truncated === false (full set membership).
		const nodeIdSet = new Set(nodes.map((n) => n.node_id));
		const edgeRows = ctx.dao.queryEdgesAsOf(params.asOf);
		const edges: SerializedEdgeSnapshot[] = edgeRows
			.filter((e) => nodeIdSet.has(e.src_id) && nodeIdSet.has(e.dst_id))
			.map((e) => ({
				edge_id: e.id,
				kind: e.kind,
				src_id: e.src_id,
				dst_id: e.dst_id,
				valid_from: e.valid_from,
				invalidated_at: e.invalidated_at,
				// Phase 17 Plan 17-04 DEEP-06 phase-B — Pitfall D defense. Projects repo_id from
				// EdgeRow (B1 prerequisite: dao.ts queryEdgesAsOf mapper now copies r.repo_id).
				repo_id: e.repo_id,
			}));

		return { nodes, edges, truncated };
	}));

	// Phase 15 Plan 15-02 — graph.queryTimelineTransitions (DEEP-02 slider step-set).
	// Returns the full deduped + sorted ascending union of valid_from + invalidated_at across
	// nodes and edges. Pure read — no parameters, no Date-source side effect.
	connection.onRequest(QueryTimelineTransitionsRequest, requireAuth((): QueryTimelineTransitionsResult => {
		const transitions = ctx.dao.queryTimelineTransitions();
		return { transitions };
	}));

	// Phase 16 Plan 16-02 — graph.constraintLift (DEEP-03 hypothetical-impact analyzer).
	// Composes runConstraintLiftAnalysis: walkRippleEdges BFS from ConstraintNode +
	// confidence-classify + bucket-sort + score aggregate. Mirrors Phase 15 queryGraphSnapshot
	// handler shape verbatim. Pitfall 1 fence: no Date.now()/new Date() in this handler —
	// params.asOf is the sole timestamp source (threads verbatim to runConstraintLiftAnalysis).
	// Mandate B: runConstraintLiftAnalysis is read-only (refuse-deep05-write.sh gate).
	connection.onRequest(ConstraintLiftRequest, requireAuth((params): ConstraintLiftResult => {
		const result = runConstraintLiftAnalysis({
			constraintNodeId: params.constraint_node_id,
			maxHops: params.max_hops ?? 3,
			asOf: params.asOf,
			confidenceThreshold: params.confidence_threshold ?? 0.5,
			dao: ctx.dao,
			sqlite: ctx.sqlite,
		});
		// Cast: ConstraintLiftAnalysisResult has readonly ConstraintLiftRow[] buckets;
		// wire type uses ComplianceRow[] (same shape at runtime — confidence_band is additive).
		return result as unknown as ConstraintLiftResult;
	}));

	connection.onRequest(ProposeEditRequest, requireAuth((params): ProposeEditResult => {
		const asOf = params.asOf ?? new Date().toISOString();
		const receipt = buildReceipt(
			{ diff: params.diff, destructive: params.destructive, asOf },
			ctx.dao,
			ctx.receiptDao,
			ctx.sqlite,
		);
		// Plan 07-05 (DRIFT-02): when session_priority is provided, run renderReceipt with
		// IntentDrift evaluation. The rendered receipt is structurally a superset of the
		// raw ReasoningReceipt (additional cited_payload + intent_drift_badge fields per
		// citation), so the JSON wire shape stays compatible with pre-Plan-07-05 callers.
		// When session_priority is omitted the raw receipt is returned unchanged — this
		// preserves the exact Phase 4 / pre-Plan-07-05 wire shape for legacy callers.
		if (params.session_priority !== undefined) {
			const rendered = renderReceipt(receipt, ctx.dao, { sessionPriority: params.session_priority });
			return { receipt: rendered };
		}
		return { receipt };
	}));

	connection.onRequest(RecordRejectionRequest, requireAuth((params): RecordRejectionResult => {
		if (!params.note || params.note.length < 1) {
			throw new Error('graph.recordRejection: note must be >=1 char');
		}
		const receipt = ctx.receiptDao.read(params.receipt_id);
		if (!receipt) {
			throw new Error(`graph.recordRejection: receipt not found: ${params.receipt_id}`);
		}
		const firstCited = receipt.citations[0];
		const citedNode = firstCited ? ctx.dao.queryById(firstCited.node_id) : null;
		const citedAnchor = citedNode?.payload.anchor;
		const anchor = citedAnchor && Object.keys(citedAnchor).length > 0
			? citedAnchor
			: { file: 'unknown' };

		const { id: openQuestionId } = ctx.dao.seed({
			payload: {
				kind: 'OpenQuestion',
				body: params.note,
				anchor,
			},
			provenance: {
				source: 'canvas',
				actor: 'developer',
				detail: {
					receipt_id: params.receipt_id,
					rejected_change_id: params.change_id,
					action: 'reject_with_note',
				},
			},
		});

		if (firstCited) {
			ctx.dao.writeEdge({
				kind: 'references',
				src_id: openQuestionId,
				dst_id: firstCited.node_id,
			});
		}

		return { open_question_id: openQuestionId };
	}));

	// Phase 7 Plan 07-06 — graph.recordContractOverride (DRIFT-06).
	//
	// Constitutional pin against silent escape hatches: every override of a Contract lock MUST
	// funnel through this handler so the audit trail (Attempt + 'references' edge + metric
	// counter) is always populated. The bridge save-gate override flow (Plan 07-07) is the
	// sole production caller; refuse-silent-override.sh ensures no parallel path bypasses it.
	//
	// Two-tx pattern (inherits Plan 04-04 atomicAccept precedent):
	//   1. dao.seed runs its own tx for the Attempt + provenance rows.
	//   2. dao.writeEdge runs a separate tx for the 'references' edge.
	//
	// Recovery-scan deferral: a partial state where seed succeeded but writeEdge failed leaves
	// the Attempt orphaned (no edge to the ContractNode). This is survivable because the
	// Attempt is still queryable via queryByKind('Attempt')+attempt_kind='contract_override'
	// filter; a future Phase-7-iter recovery scan will assert no orphan exists. Coalescing
	// the two writes into a single tx is a future optimization (would require an
	// atomicSeedAndWriteEdge DAO surface; out-of-scope for Plan 07-06).
	//
	// Pitfall-9 shame-loop defense: the metric counter is read by `goatide-cli harvest
	// metrics` (opt-in CLI surface) ONLY. The bridge status bar / LivenessBanner do NOT
	// surface override frequency.
	connection.onRequest(RecordContractOverrideRequest, requireAuth((params): RecordContractOverrideResult => {
		if (!params.note || params.note.length < 1) {
			throw new Error('graph.recordContractOverride: note must be >=1 char');
		}
		const contractNode = ctx.dao.queryById(params.contract_node_id);
		if (!contractNode || contractNode.kind !== 'ContractNode') {
			throw new Error(`graph.recordContractOverride: invalid contract_node_id: ${params.contract_node_id}`);
		}
		const contractAnchor = contractNode.payload.anchor;
		const anchor = contractAnchor && Object.keys(contractAnchor).length > 0
			? contractAnchor
			: { file: 'unknown' };

		const { id: attemptId } = ctx.dao.seed({
			payload: {
				kind: 'Attempt',
				body: params.note,
				anchor,
				attempt_kind: 'contract_override',
			},
			provenance: {
				source: 'canvas',
				actor: 'developer',
				detail: {
					change_id: params.change_id,
					contract_node_id: params.contract_node_id,
					section_name: params.section_name,
					action: 'contract_override',
				},
			},
		});

		ctx.dao.writeEdge({
			kind: 'references',
			src_id: attemptId,
			dst_id: params.contract_node_id,
		});

		// Bump the daily metric AFTER the durable writes land. A failure here would leave the
		// audit trail intact but the counter under-reported by one — survivable for a calibration
		// signal (Pitfall 1 false-positive density indicator). Best-effort try/catch keeps the
		// RPC response from failing on a metric-side anomaly.
		if (ctx.metrics) {
			try {
				ctx.metrics.incrementContractOverride('canvas', Date.now());
			} catch {
				// Metric increment is non-fatal: the override is already persisted.
			}
		}

		return { attempt_node_id: attemptId };
	}));

	// Phase 20 Plan 20-02 — graph.createDecisionNode (AUTH-01).
	//
	// Human-authored DecisionNode write path. The bridge canvas/authoring-flow.ts (Plan 20-03)
	// is the SOLE production caller; it enforces Mandate A upstream by calling showInputBox
	// with opts.value === '' so the rationale body originates from human keystrokes.
	//
	// Mandate B fence: refuse-deep05-write.sh BANNED array includes 'createDecisionNode' since
	// Plan 20-01 — inspector/ cannot import CreateDecisionNodeRequest. The new method lives on
	// KernelClient (NOT in the ReadonlyKernelClient Pick<>) so the structural narrowing keeps
	// the read-only inspector layer ignorant of the write surface.
	//
	// Pattern reference: RecordContractOverrideRequest handler above. Differs in that no edge
	// is written (Phase 20 OQ#3 scope-cut: constraint-link picker deferred to v2.2). Single-tx
	// dao.seed call + provenance attachment, then return {node_id}.
	//
	// Boundary validation: body must be non-empty trimmed (Mandate A boundary check; upstream
	// the bridge enforces showInputBox.value === ''). Anchor: at least one of file|symbol|
	// ticket_id required so the node is queryable via resolveAnchor.
	//
	// repo_id: optional; defaults to 'primary' (Phase 21 XREPO-01 forward-compat). The
	// repo_id rides in provenance.detail, NOT in payload.anchor — payload.anchor is the
	// per-file/symbol pointer that drives anchor resolution.
	connection.onRequest(CreateDecisionNodeRequest, requireAuth((params): CreateDecisionNodeResult => {
		if (!params.body || params.body.trim().length === 0) {
			throw new Error('graph.createDecisionNode: body must be a non-empty trimmed string (Mandate A: human-authored rationale required)');
		}
		const a = params.anchor;
		if (!a || (!a.file && !a.symbol && !a.ticket_id)) {
			throw new Error('graph.createDecisionNode: anchor must include at least one of file|symbol|ticket_id');
		}

		const { id: nodeId } = ctx.dao.seed({
			payload: {
				kind: 'DecisionNode',
				body: params.body,
				anchor: params.anchor,
				derived_under_priority: params.derived_under_priority,
				cite_eligible: true,
				detail: {},
			},
			provenance: {
				source: 'canvas',
				actor: 'developer',
				detail: {
					action: 'create_decision_node',
					via: 'authoring-flow',
					repo_id: params.repo_id ?? 'primary',
				},
			},
		});

		return { node_id: nodeId };
	}));

	// Phase 7 Plan 07-07 — graph.runDriftAndLock (DRIFT-01 + DRIFT-03 bridge integration).
	//
	// Loads the contract registry once per call (per-save fresh; bridge-side caching is
	// Plan 07-07's tier-dispatch concern), then runs the pure-function detector + lock
	// detector and returns the union pair. requireAuth wrapper inherited like every other
	// graph.* method.
	connection.onRequest(RunDriftAndLockRequest, requireAuth(async (params): Promise<RunDriftAndLockResult> => {
		const registry = await loadContractRegistry(ctx.dao, params.asOf);
		const drift_findings = runDriftDetector({ diff: params.diff, contractRegistry: registry, asOf: params.asOf });
		const lock_trigger = detectsContractLock({ diff: params.diff, contractRegistry: registry });
		return { drift_findings: [...drift_findings], lock_trigger };
	}));

	// Phase 7 Plan 07-07 — graph.runRippleProgressive (DRIFT-04 + DRIFT-05 bridge integration).
	//
	// Two-phase progressive disclosure surface:
	//   Phase A: synchronous runRippleAnalysis(maxHops=1). Emits a graph.driftProgress
	//            notification with hops_complete=1 + the partial report. vscode-jsonrpc
	//            8.2.1 sendNotification flushes synchronously to the underlying transport
	//            so the bridge sees this notification BEFORE the final response arrives.
	//   Phase B: yield via setImmediate (allow notification to flush + the bridge's UI
	//            thread to render the partial), then runRippleAnalysis(maxHops=3) and
	//            return as the RPC final.
	//
	// BFS monotonicity invariant: maxHops=3 walk subsumes everything maxHops=1 reached, so
	// returning Phase B's report verbatim IS the merged final (no manual cross-phase merge
	// code to introduce bug surface).
	connection.onRequest(RunRippleProgressiveRequest, requireAuth(async (params): Promise<RunRippleProgressiveResult> => {
		const phaseA = runRippleAnalysis({
			contractNodeId: params.contract_node_id,
			maxHops: 1,
			asOf: params.asOf,
			dao: ctx.dao,
			sqlite: ctx.sqlite,
		});
		connection.sendNotification(DriftProgressNotificationType, { hops_complete: 1, partial: phaseA });
		// Yield to allow the notification to flush + the bridge's UI thread to render.
		await new Promise<void>((resolve) => setImmediate(resolve));
		const phaseB = runRippleAnalysis({
			contractNodeId: params.contract_node_id,
			maxHops: 3,
			asOf: params.asOf,
			dao: ctx.dao,
			sqlite: ctx.sqlite,
		});
		return { report: phaseB };
	}));

	connection.onRequest(AtomicAcceptRequest, requireAuth(async (params): Promise<AtomicAcceptResult> => {
		const receipt = ctx.receiptDao.read(params.receipt_id);
		const firstCited = receipt?.citations[0] ?? null;

		const { id: attemptId } = ctx.dao.seed({
			payload: {
				kind: 'Attempt',
				body: params.body,
				anchor: params.anchor,
				attempt_kind: 'accepted',
				accept_latency_ms: params.accept_latency_ms,
				tier: params.tier,
			},
			provenance: {
				source: 'canvas',
				actor: 'developer',
				detail: {
					receipt_id: params.receipt_id,
					change_id: params.change_id,
					staging_path: params.staging_path,
					target_path: params.target_path,
					action: 'atomic_accept',
				},
			},
		});

		if (firstCited) {
			ctx.dao.writeEdge({
				kind: 'references',
				src_id: attemptId,
				dst_id: firstCited.node_id,
			});
		}

		// Phase 5 Plan 05-06 PORT-05 (a): Canvas Accept on an Inferred citation flips
		// cite_eligible via supersession. Synchronous so the RPC response is returned only
		// after the promotion has landed in the graph — bridge can immediately re-render
		// with the updated node. No-op when the cited node is not Inferred or already eligible.
		try {
			await flipCiteEligibleOnAcceptedReceipt({ dao: ctx.dao, attemptId });
		} catch {
			// Promotion-gate failure is non-fatal: the Attempt is already persisted, the
			// Canvas response should still succeed. Future plan wires a metric.
		}

		return { attempt_node_id: attemptId };
	}));

	connection.onRequest(QueryAttemptByStagingPathRequest, requireAuth((params): QueryAttemptByStagingPathResult => {
		const sqlite = ctx.sqlite;
		const row = sqlite.prepare(`
			SELECT n.id AS id, json_extract(n.payload, '$.attempt_kind') AS attempt_kind,
			       json_extract(p.detail, '$.target_path') AS target_path
			FROM nodes n
			LEFT JOIN provenance p ON p.node_id = n.id
			WHERE n.kind = 'Attempt'
			  AND json_extract(p.detail, '$.staging_path') = ?
			  AND n.invalidated_at IS NULL
			ORDER BY n.recorded_at DESC
			LIMIT 1
		`).get(params.staging_path) as { id: string; attempt_kind: string | null; target_path: string | null } | undefined;

		if (!row) {
			return { attempt_node_id: null, target_path: null, attempt_kind: null };
		}
		return {
			attempt_node_id: row.id,
			target_path: row.target_path,
			attempt_kind: row.attempt_kind,
		};
	}));

	connection.onRequest(QueryNodesRequest, requireAuth((params): QueryNodesResult => {
		const out: QueryNodesResult['nodes'] = [];
		for (const id of params.node_ids) {
			const node = ctx.dao.queryById(id);
			if (!node) {
				continue;
			}
			const successor = ctx.dao.findSuccessor(id);
			const payload = node.payload as { body: string; contract_path?: string };
			out.push({
				node_id: node.id,
				kind: node.kind satisfies NodeKind,
				body: payload.body,
				contract_path: payload.contract_path,
				invalidated_at: node.invalidated_at,
				successor_id: successor?.id ?? null,
			});
		}
		return { nodes: out };
	}));

	connection.onRequest(HeartbeatRequest, requireAuth((): HeartbeatResult => ({
		ok: true,
		pid: process.pid,
		db_path: ctx.dbPath,
		uptime_ms: Date.now() - ctx.startMs,
	})));

	// Phase 10 Plan 10-02 (POLISH-02) — mcp.listProviders.
	//
	// Registered UNCONDITIONALLY (alongside the graph.* family, NOT inside the `if (mcpControl)`
	// block below). The bridge SchemaDriftBanner uses this as a precondition gate before
	// scheduling its 30s mcp.getSchemaDriftReport poll loop; when no MCP providers are
	// configured the handler returns `{providers: []}` and the bridge suppresses the poll,
	// eliminating the dominant renderer.log [error] line (Pitfall 2 mitigation — if this were
	// gated behind mcpControl, the empty-providers case would emit MethodNotFound -32601 and
	// BRIDGE-POLISH-02 would fail).
	//
	// Registered on TCP path only (mcp.* family precedent — see existing mcp.* handlers in the
	// `if (mcpControl)` gate below). Stdio path returns MethodNotFound if invoked, but no
	// current stdio caller does — the bridge talks to the daemon over TCP exclusively.
	connection.onRequest(McpListProvidersRequest, requireAuth((): McpListProvidersResult => ({
		providers: mcpControl?.listProviders() ?? [],
	})));

	// Phase 5 Plan 05-03 — harvester.submitObservation. Skipped when harvesterDeps is
	// not provided (stdio mode); daemon mode registers it. The discriminated-union dispatch
	// over RawObservationSchema branches lives here; Plan 05-04 makes APPEND-ONLY additive
	// edits inside the terminal_shell branch (no replacement of existing branches).
	if (harvesterDeps) {
		connection.onRequest(SubmitObservationRequest, requireAuth(async (params): Promise<SubmitObservationResult> => {
			const parsed = RawObservationSchema.safeParse(params);
			if (!parsed.success) {
				const idAttempt = (params as { id?: unknown } | undefined)?.id;
				const id = typeof idAttempt === 'string' ? idAttempt : '';
				const issue = parsed.error.issues[0];
				return {
					id,
					accepted: false,
					reject_reason: `schema_violation: ${issue?.message ?? 'unknown'}`,
				};
			}
			return await submitRawObservation(parsed.data, harvesterDeps as HarvesterDeps);
		}));

		// Plan 05-07 TELE-06 + Plan 06-06 MCP-06 — bridge LivenessBanner polls this every 30s.
		// Phase-5 sources (claude_jsonl/editor_save/terminal_shell/git_commit/mcp_external_signal)
		// are reported via livenessState.computeLiveness; Phase-6 mcp.<provider> sources are
		// merged via computeMcpLiveness so the same banner surface picks them up.
		connection.onRequest(GetLivenessRequest, requireAuth((): GetLivenessResult => {
			if (!harvesterDeps.livenessState) {
				return { sources: [] };
			}
			const nowMs = (harvesterDeps.now ?? Date.now)();
			const sources = computeMcpLiveness({
				state: harvesterDeps.livenessState,
				now: nowMs,
				thresholds: resolveLivenessThresholdsFromEnv() as Record<string, number>,
			});
			return { sources };
		}));

		// Plan 05-07 PORT-06 — bridge / CLI dashboard. Returns rows for the last `days`
		// days plus the sustained-zero-source list calibrated against the env-overridable
		// floor.
		connection.onRequest(GetDailyMetricsRequest, requireAuth((params): GetDailyMetricsResult => {
			if (!harvesterDeps.metrics) {
				return { rows: [], sustained_zero_sources: [] };
			}
			const nowMs = (harvesterDeps.now ?? Date.now)();
			const envParams = resolvePort06ParamsFromEnv();
			const days = params.days > 0 ? params.days : envParams.days;
			const minDailyVolumeFloor = params.min_daily_volume_floor ?? envParams.minDailyVolumeFloor;
			const rows = harvesterDeps.metrics.queryLastDays(days, nowMs);
			const sustained = harvesterDeps.metrics.sustainedZeroSources({
				days,
				minDailyVolumeFloor,
				now: nowMs,
			}) as ObservationSource[];
			return { rows, sustained_zero_sources: sustained };
		}));
	}

	// Plan 06-06 — mcp.* RPC surface backing the bridge UI. Registered when the daemon wires
	// an McpControlSurface; absent on stdio mode or when MCP startup failed (the bridge falls
	// back to hidden banners — same shape as livenessState being absent).
	if (mcpControl) {
		connection.onRequest(McpGetProviderStateRequest, requireAuth((params): McpGetProviderStateResult => ({
			provider: params.provider,
			state: mcpControl.getProviderState(params.provider),
		})));

		connection.onRequest(McpGetSchemaDriftReportRequest, requireAuth((): McpGetSchemaDriftReportResult => ({
			providers: mcpControl.getSchemaDriftReport().map(r => ({
				provider: r.provider,
				paused: r.paused,
				drift_summary: r.drift_summary,
			})),
		})));

		connection.onRequest(McpAcceptProviderSchemaDriftRequest, requireAuth(async (params): Promise<McpAcceptProviderSchemaDriftResult> => {
			const accepted = await mcpControl.acceptProviderSchemaDrift(params.provider);
			// After acceptance, reconnect so the new schema is exercised immediately.
			if (accepted) {
				try {
					await mcpControl.reconnect(params.provider);
				} catch {
					// Reconnect failure is non-fatal for the accept op — banner stays cleared,
					// supervisor will retry per its backoff policy.
				}
			}
			return { accepted };
		}));

		connection.onRequest(McpReconnectProviderRequest, requireAuth(async (params): Promise<McpReconnectProviderResult> => {
			try {
				await mcpControl.reconnect(params.provider);
				return { reconnected: true };
			} catch {
				return { reconnected: false };
			}
		}));
	}
}

/**
 * Build a vscode-jsonrpc MessageConnection wired to the given DAOs and the (default)
 * process stdin/stdout streams. Caller invokes `.listen()` to start serving.
 *
 * Stdio mode: no auth gate (the kernel's parent owns the pipe).
 *
 * Phase 16 Plan 16-02: when `args.connection` is provided (test harness scenario), binds
 * handlers directly to that connection instead of creating a new one from reader/writer.
 * Production stdio mode never passes `connection`; it uses `reader`/`writer` (or
 * process.stdin/process.stdout).
 */
export function createRpcServer(args: CreateRpcServerArgs): rpc.MessageConnection {
	const connection = args.connection ?? (() => {
		const reader = args.reader ?? new rpc.StreamMessageReader(process.stdin);
		const writer = args.writer ?? new rpc.StreamMessageWriter(process.stdout);
		return rpc.createMessageConnection(reader, writer);
	})();

	const ctx: HandlerContext = {
		dao: args.dao,
		receiptDao: args.receiptDao,
		sqlite: args.sqlite,
		dbPath: args.dbPath ?? '<unknown>',
		startMs: Date.now(),
		metrics: args.metrics,
	};
	bindHandlers(connection, ctx /* no authState — stdio is implicitly trusted */);
	return connection;
}

export interface BindHandlersForTcpArgs {
	connection: rpc.MessageConnection;
	socket: net.Socket;
	authState: SocketAuthState;
	expectedToken: string;
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	dbPath: string;
	/** Phase 5 Plan 05-03 — harvester orchestrator deps. Optional so Plan 05-02 callers
	 *  that don't yet wire the watchers can pass an empty bag and still authenticate. */
	harvesterDeps?: HarvesterDepsForRpc;
	/** Plan 06-06 — MCP control surface backing the mcp.* RPC handlers. Optional; when
	 *  absent the four mcp.* methods are NOT registered and the bridge banners stay hidden. */
	mcpControl?: McpControlSurface;
}

/**
 * Subset of HarvesterDeps used by the RPC handler. The daemon constructs a full
 * HarvesterDeps with enrichGit + (later) filter/promoter/liveness; the RPC server only
 * needs to be able to invoke submitRawObservation against it.
 */
export interface HarvesterDepsForRpc {
	enrichGit: HarvesterDeps['enrichGit'];
	dao?: HarvesterDeps['dao'];
	workspaceFolders?: HarvesterDeps['workspaceFolders'];
	now?: HarvesterDeps['now'];
	onCorroborationCandidate?: HarvesterDeps['onCorroborationCandidate'];
	rejectedLogPath?: HarvesterDeps['rejectedLogPath'];
	filter?: HarvesterDeps['filter'];
	promoter?: HarvesterDeps['promoter'];
	promoterCtx?: HarvesterDeps['promoterCtx'];
	onPromoterResult?: HarvesterDeps['onPromoterResult'];
	liveness?: HarvesterDeps['liveness'];
	livenessState?: HarvesterDeps['livenessState'];
	metrics?: HarvesterDeps['metrics'];
}

/**
 * TCP transport handler-binding. Adds the per-socket harvester.authenticate gate on top
 * of the standard kernel handler set. Wrong-token attempts dispose the connection and
 * destroy the socket so the bridge falls through to its spawn-fresh path.
 */
export function bindHandlersForTcp(args: BindHandlersForTcpArgs): void {
	const ctx: HandlerContext = {
		dao: args.dao,
		receiptDao: args.receiptDao,
		sqlite: args.sqlite,
		dbPath: args.dbPath,
		startMs: Date.now(),
		// Plan 07-06: metrics for graph.recordContractOverride. The daemon's harvesterDeps.metrics
		// flows through to ctx.metrics so the override handler can bump the daily counter.
		metrics: args.harvesterDeps?.metrics,
	};

	args.connection.onRequest(AuthenticateRequest, (params): AuthenticateResult => {
		if (!validateAuthToken(params.token, args.expectedToken)) {
			// Failed auth: dispose connection + destroy socket after the error response
			// is flushed (a few event-loop ticks; setTimeout 0 is sufficient). Bridge
			// sees a connection-closed error and falls through to spawnDetachedKernel.
			setTimeout(() => {
				try { args.connection.dispose(); } catch { /* best-effort */ }
				try { args.socket.end(); } catch { /* best-effort */ }
				try { args.socket.destroy(); } catch { /* best-effort */ }
			}, 50);
			throw new Error('harvester.authenticate: invalid token');
		}
		args.authState.authenticated = true;
		return { ok: true };
	});

	bindHandlers(args.connection, ctx, args.authState, args.harvesterDeps, args.mcpControl);
}
