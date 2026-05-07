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
import { buildReceipt, type ReceiptDAO } from '../receipt/index.js';
import { validateAuthToken } from '../daemon/auth-token.js';
import { submitRawObservation, type HarvesterDeps } from '../harvester/index.js';
import { RawObservationSchema } from '../harvester/observations.js';
import {
	QueryGraphRequest,
	ProposeEditRequest,
	RecordRejectionRequest,
	AtomicAcceptRequest,
	QueryAttemptByStagingPathRequest,
	QueryNodesRequest,
	HeartbeatRequest,
	AuthenticateRequest,
	type QueryGraphResult,
	type ProposeEditResult,
	type RecordRejectionResult,
	type AtomicAcceptResult,
	type QueryAttemptByStagingPathResult,
	type QueryNodesResult,
	type HeartbeatResult,
	type AuthenticateResult,
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
 * Per-socket trust state for the TCP transport. The first request on any TCP socket MUST
 * be harvester.authenticate; until that round-trips with the correct token,
 * authenticated=false and every other handler returns an "Unauthenticated" error.
 */
export interface SocketAuthState {
	authenticated: boolean;
}

interface HandlerContext {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	dbPath: string;
	startMs: number;
}

/**
 * Bind every kernel RPC handler to the given connection. When authState is provided, the
 * handlers are gated: any request other than harvester.authenticate returns an
 * "Unauthenticated" error until authState.authenticated flips true.
 */
function bindHandlers(connection: rpc.MessageConnection, ctx: HandlerContext, authState?: SocketAuthState): void {
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

	connection.onRequest(ProposeEditRequest, requireAuth((params): ProposeEditResult => {
		const asOf = params.asOf ?? new Date().toISOString();
		const receipt = buildReceipt(
			{ diff: params.diff, destructive: params.destructive, asOf },
			ctx.dao,
			ctx.receiptDao,
			ctx.sqlite,
		);
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

	connection.onRequest(AtomicAcceptRequest, requireAuth((params): AtomicAcceptResult => {
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
}

/**
 * Build a vscode-jsonrpc MessageConnection wired to the given DAOs and the (default)
 * process stdin/stdout streams. Caller invokes `.listen()` to start serving.
 *
 * Stdio mode: no auth gate (the kernel's parent owns the pipe).
 */
export function createRpcServer(args: CreateRpcServerArgs): rpc.MessageConnection {
	const reader = args.reader ?? new rpc.StreamMessageReader(process.stdin);
	const writer = args.writer ?? new rpc.StreamMessageWriter(process.stdout);
	const connection = rpc.createMessageConnection(reader, writer);

	const ctx: HandlerContext = {
		dao: args.dao,
		receiptDao: args.receiptDao,
		sqlite: args.sqlite,
		dbPath: args.dbPath ?? '<unknown>',
		startMs: Date.now(),
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
}

/**
 * Subset of HarvesterDeps used by the RPC handler. The daemon constructs a full
 * HarvesterDeps with enrichGit + (later) filter/promoter/liveness; the RPC server only
 * needs to be able to invoke submitRawObservation against it.
 */
export interface HarvesterDepsForRpc {
	enrichGit: HarvesterDeps['enrichGit'];
	filter?: HarvesterDeps['filter'];
	promoter?: HarvesterDeps['promoter'];
	liveness?: HarvesterDeps['liveness'];
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

	bindHandlers(args.connection, ctx, args.authState);
}
