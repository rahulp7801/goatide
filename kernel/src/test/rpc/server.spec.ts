/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/server.spec.ts — Phase 3 (Plan 03-04 Task 1) in-process RPC harness.
//
// Verifies createRpcServer wires both queryGraph + proposeEdit handlers correctly when given
// in-memory MessageReader/MessageWriter halves (no child process, no stdio). The full
// stdio + dist round-trip lives in e2e.spec.ts (Task 3).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as rpc from 'vscode-jsonrpc/node.js';
import { Duplex } from 'node:stream';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedSimpleParentChild } from '../helpers/graph-fixtures.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer, QueryGraphRequest, ProposeEditRequest } from '../../rpc/index.js';

/** A pair of duplex streams stitched into a bidirectional in-memory pipe. */
function makePipePair(): { a: Duplex; b: Duplex } {
	const a = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { a.push(c); cb(); } });
	return { a, b };
}

describe('Plan 03-04 Task 1 — createRpcServer in-process round-trip', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	let receiptDao: ReceiptDAO;
	let serverConn: rpc.MessageConnection;
	let clientConn: rpc.MessageConnection;
	let parentId: string;
	let childId: string;

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
		receiptDao = new ReceiptDAO(handle.db);

		const seeded = seedSimpleParentChild(dao, handle.sqlite, { anchorFile: 'src/auth.ts' });
		parentId = seeded.parentId;
		childId = seeded.childId;

		// Wire two duplex streams as a bidirectional pipe between client and server.
		const { a, b } = makePipePair();
		const serverReader = new rpc.StreamMessageReader(a);
		const serverWriter = new rpc.StreamMessageWriter(a);
		const clientReader = new rpc.StreamMessageReader(b);
		const clientWriter = new rpc.StreamMessageWriter(b);

		serverConn = createRpcServer({
			dao,
			receiptDao,
			sqlite: handle.sqlite,
			reader: serverReader,
			writer: serverWriter,
		});
		serverConn.listen();

		clientConn = rpc.createMessageConnection(clientReader, clientWriter);
		clientConn.listen();
	});

	afterEach(() => {
		clientConn.dispose();
		serverConn.dispose();
		handle.close();
		tmp.dispose();
	});

	it('queryGraph: anchor file → returns parent + child rows (success criterion #1, in-process)', async () => {
		const result = await clientConn.sendRequest(QueryGraphRequest, {
			anchor: { kind: 'file', path: 'src/auth.ts' },
			scope: 'all',
			max_hops: 4,
		});
		const ids = result.nodes.map((n) => n.node_id).sort();
		const childRow = result.nodes.find((n) => n.node_id === childId);
		expect({
			ids,
			levels: result.nodes.map((n) => n.level).sort(),
			childPathHasParentOf: childRow?.edge_path.includes('parent_of:') ?? false,
		}).toEqual({
			ids: [parentId, childId].sort(),
			levels: [0, 1],
			childPathHasParentOf: true,
		});
	});

	it('queryGraph: unresolvable anchor → empty nodes/paths (TRAV-06, no fallback)', async () => {
		const result = await clientConn.sendRequest(QueryGraphRequest, {
			anchor: { kind: 'file', path: 'no/such/file.ts' },
		});
		expect(result).toEqual({ nodes: [], paths: [] });
	});

	it('proposeEdit: non-destructive change with empty diff returns a receipt (no refusal)', async () => {
		const result = await clientConn.sendRequest(ProposeEditRequest, {
			diff: '',
			destructive: false,
		});
		expect({
			hasId: typeof result.receipt.id === 'string' && result.receipt.id.length === 26,
			hasChangeId: typeof result.receipt.change_id === 'string' && result.receipt.change_id.length === 26,
			destructive: result.receipt.destructive,
			citationCount: result.receipt.citations.length,
		}).toEqual({ hasId: true, hasChangeId: true, destructive: false, citationCount: 0 });
	});
});
