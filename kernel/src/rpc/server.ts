/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/rpc/server.ts — Phase 3 (Plan 03-04) JSON-RPC stdio server.
//
// Per 03-RESEARCH.md ## Pattern: JSON-RPC Server. vscode-jsonrpc 8.2.1. StreamMessageReader/
// Writer over process.stdin/stdout (LSP wire format). Pitfall 3 — STDOUT IS RESERVED.
// All log output MUST go to stderr.
//
// Plan 03-04 only registers two methods (queryGraph + proposeEdit). Phase 6 (MCP) extends
// with graph.cite, graph.proposeNode, graph.subscribe; that landing is OUT OF SCOPE here.

import * as rpc from 'vscode-jsonrpc/node.js';
import type Database from 'better-sqlite3';
import { resolveAnchor, traverse, type GraphDAO } from '../graph/index.js';
import { buildReceipt, type ReceiptDAO } from '../receipt/index.js';
import {
	QueryGraphRequest,
	ProposeEditRequest,
	type QueryGraphResult,
	type ProposeEditResult,
} from './methods.js';

export interface CreateRpcServerArgs {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	/** Override stdin/stdout for tests (defaults to process.stdin/process.stdout). */
	reader?: rpc.MessageReader;
	writer?: rpc.MessageWriter;
}

/**
 * Build a vscode-jsonrpc MessageConnection wired to the given DAOs and the (default)
 * process stdin/stdout streams. Caller invokes `.listen()` to start serving.
 *
 * Both handlers run synchronously over the shared GraphDAO + ReceiptDAO + sqlite handle.
 * vscode-jsonrpc auto-marshals thrown Errors into JSON-RPC error responses, so a
 * ReceiptRefusalError from buildReceipt surfaces to the client as a typed error response
 * (the error.message preserves the REC-04 violation context).
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

	return connection;
}
