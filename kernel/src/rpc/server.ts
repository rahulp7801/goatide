/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/rpc/server.ts — Phase 3 (Plan 03-04) + Phase 4 (Plan 04-04) JSON-RPC stdio
// server.
//
// Per 03-RESEARCH.md ## Pattern: JSON-RPC Server. vscode-jsonrpc 8.2.1. StreamMessageReader/
// Writer over process.stdin/stdout (LSP wire format). Pitfall 3 — STDOUT IS RESERVED.
// All log output MUST go to stderr.
//
// Phase-3 surface: queryGraph + proposeEdit.
// Plan 04-04 adds: graph.recordRejection (CANV-03), graph.atomicAccept (CANV-07),
// graph.queryAttemptByStagingPath (recovery scan), graph.queryNodes (citation hydration).
// Phase 6 (MCP) extends with graph.cite, graph.proposeNode, graph.subscribe.

import * as rpc from 'vscode-jsonrpc/node.js';
import type Database from 'better-sqlite3';
import { resolveAnchor, traverse, type GraphDAO, type NodeKind } from '../graph/index.js';
import { buildReceipt, type ReceiptDAO } from '../receipt/index.js';
import {
	QueryGraphRequest,
	ProposeEditRequest,
	RecordRejectionRequest,
	AtomicAcceptRequest,
	QueryAttemptByStagingPathRequest,
	QueryNodesRequest,
	HeartbeatRequest,
	type QueryGraphResult,
	type ProposeEditResult,
	type RecordRejectionResult,
	type AtomicAcceptResult,
	type QueryAttemptByStagingPathResult,
	type QueryNodesResult,
	type HeartbeatResult,
} from './methods.js';

export interface CreateRpcServerArgs {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	/** DB path for heartbeat reporting (Plan 04-06). Defaults to '<unknown>' if not provided. */
	dbPath?: string;
	/** Override stdin/stdout for tests (defaults to process.stdin/process.stdout). */
	reader?: rpc.MessageReader;
	writer?: rpc.MessageWriter;
}

/**
 * Build a vscode-jsonrpc MessageConnection wired to the given DAOs and the (default)
 * process stdin/stdout streams. Caller invokes `.listen()` to start serving.
 *
 * Both Phase-3 handlers (queryGraph, proposeEdit) run synchronously over the shared
 * GraphDAO + ReceiptDAO + sqlite handle. The four Plan-04-04 handlers do the same.
 * vscode-jsonrpc auto-marshals thrown Errors into JSON-RPC error responses, so a
 * ReceiptRefusalError from buildReceipt — or a "receipt not found" / "note must be
 * >=1 char" / Zod refusal from the new handlers — surfaces to the client as a typed
 * error response (the error.message preserves the violation context).
 */
export function createRpcServer(args: CreateRpcServerArgs): rpc.MessageConnection {
	const reader = args.reader ?? new rpc.StreamMessageReader(process.stdin);
	const writer = args.writer ?? new rpc.StreamMessageWriter(process.stdout);
	const connection = rpc.createMessageConnection(reader, writer);

	connection.onRequest(QueryGraphRequest, (params): QueryGraphResult => {
		const at = params.at ?? new Date().toISOString();
		const seedNodes = resolveAnchor(args.dao, params.anchor, at);
		if (seedNodes.length === 0) {
			// TRAV-06: empty result, no fallback.
			return { nodes: [], paths: [] };
		}
		const traversal = traverse(args.sqlite, {
			anchorIds: seedNodes.map((n) => n.id),
			scope: params.scope ?? 'all',
			max_hops: params.max_hops ?? 4,
			at,
		});
		return { nodes: traversal.nodes, paths: traversal.paths };
	});

	connection.onRequest(ProposeEditRequest, (params): ProposeEditResult => {
		const asOf = params.asOf ?? new Date().toISOString();
		// vscode-jsonrpc auto-marshals thrown Errors. ReceiptRefusalError preserves the
		// REC-04 message ("destructive change cited only by Inferred nodes; promote ...");
		// the client sees error.message intact.
		const receipt = buildReceipt(
			{ diff: params.diff, destructive: params.destructive, asOf },
			args.dao,
			args.receiptDao,
			args.sqlite,
		);
		return { receipt };
	});

	// -------- graph.recordRejection (CANV-03) --------
	//
	// Creates an OpenQuestion node + 'references' edge to the receipt's first cited
	// node. The receipt's change_id is NOT a node — link OpenQuestion to first cited
	// node via 'references' edge as v1 proxy + store rejected_change_id on
	// provenance.detail (RESEARCH ## Pattern: Reject-with-Note + ## Pitfall 10).
	//
	// Two-tx pattern (seed-own-tx + writeEdge-own-tx) accepted: a partial state would
	// just orphan the OpenQuestion (survivable). dao.writeEdge accepts an enclosing tx
	// if a future plan needs single-tx atomicity here.

	connection.onRequest(RecordRejectionRequest, (params): RecordRejectionResult => {
		if (!params.note || params.note.length < 1) {
			throw new Error('graph.recordRejection: note must be >=1 char');
		}
		const receipt = args.receiptDao.read(params.receipt_id);
		if (!receipt) {
			throw new Error(`graph.recordRejection: receipt not found: ${params.receipt_id}`);
		}
		const firstCited = receipt.citations[0];

		// Best-effort anchor: derive from the first citation's cited node if possible.
		// On absence, fall back to a synthetic anchor — the OpenQuestion still records
		// the developer's reasoning even when no anchor row remains active.
		const citedNode = firstCited ? args.dao.queryById(firstCited.node_id) : null;
		const citedAnchor = citedNode?.payload.anchor;
		const anchor = citedAnchor && Object.keys(citedAnchor).length > 0
			? citedAnchor
			: { file: 'unknown' };

		const { id: openQuestionId } = args.dao.seed({
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
			args.dao.writeEdge({
				kind: 'references',
				src_id: openQuestionId,
				dst_id: firstCited.node_id,
			});
		}

		return { open_question_id: openQuestionId };
	});

	// -------- graph.atomicAccept (CANV-07) --------
	//
	// Persists an Attempt node (kind='Attempt', attempt_kind='accepted',
	// tier+accept_latency_ms in payload) + a 'references' edge to the receipt's first
	// cited node. Receipt may be null in degraded paths; we tolerate it (no edge is
	// written when there's no first citation).
	//
	// Atomicity: dao.seed runs its own tx; dao.writeEdge runs another. If seed throws
	// (Zod / Ghosting / SQLite CHECK), no edge is written. The edge insert is harmless
	// on its own — the just-seeded Attempt is the FK target, so the foreign-key check
	// can't trip.

	connection.onRequest(AtomicAcceptRequest, (params): AtomicAcceptResult => {
		const receipt = args.receiptDao.read(params.receipt_id);
		const firstCited = receipt?.citations[0] ?? null;

		const { id: attemptId } = args.dao.seed({
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
			args.dao.writeEdge({
				kind: 'references',
				src_id: attemptId,
				dst_id: firstCited.node_id,
			});
		}

		return { attempt_node_id: attemptId };
	});

	// -------- graph.queryAttemptByStagingPath (CANV-07 recovery scan support) --------
	//
	// Looks up the most-recently-recorded active Attempt whose provenance.detail
	// references the given staging_path. Returns all-null on miss.
	//
	// Plan-04-04 v1 reads target_path from provenance.detail (NOT payload). The 04-04
	// SUMMARY documents this; if Plan 04-05 / 04-06 prefer target_path on payload, a
	// post-v1 schema migration in Phase-4-iter is the path.

	connection.onRequest(QueryAttemptByStagingPathRequest, (params): QueryAttemptByStagingPathResult => {
		const sqlite = args.sqlite;
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
	});

	// -------- graph.queryNodes (citation hydration for Plan 04-05 save gate) --------
	//
	// Returns the slim shape needed by classifyTier's contractAllowlist signal: kind +
	// body + contract_path? + invalidated_at + successor_id. Bounded scan (one
	// queryById per id), no traversal. Plan 04-05 hydrates citationDetails before
	// invoking classifyTier.

	connection.onRequest(QueryNodesRequest, (params): QueryNodesResult => {
		const out: QueryNodesResult['nodes'] = [];
		for (const id of params.node_ids) {
			const node = args.dao.queryById(id);
			if (!node) {
				continue;
			}
			const successor = args.dao.findSuccessor(id);
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
	});

	// -------- graph.heartbeat (CANV-10) --------
	//
	// Lightweight liveness probe — capture startMs at handler-registration time. The
	// returned db_path is whatever createRpcServer was passed (defaults to '<unknown>'
	// if not threaded through main.ts). Pid + uptime_ms are derived at-call time so a
	// stale probe response from a long-restarted kernel can still be detected.
	const startMs = Date.now();
	const reportedDbPath = args.dbPath ?? '<unknown>';
	connection.onRequest(HeartbeatRequest, (): HeartbeatResult => ({
		ok: true,
		pid: process.pid,
		db_path: reportedDbPath,
		uptime_ms: Date.now() - startMs,
	}));

	return connection;
}
