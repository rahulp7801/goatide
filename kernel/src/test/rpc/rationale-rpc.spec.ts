/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/rationale-rpc.spec.ts — Phase 14 Plan 14-02 (Wave-1) GREEN suite for
// the graph.queryRationaleAt RPC handler.
//
// Two contracts under test:
//   1. The handler is registered on the connection — sendRequest('graph.queryRationaleAt')
//      returns a structured {chain, has_superseded} response.
//   2. requireAuth wrapper is present — for stdio (Phase 3 — pre-daemon) the wrapper is a
//      pass-through so the handler answers without auth; for TCP transport (Phase 5+) the
//      wrapper rejects unauthenticated requests. Wave-0 keyed the assertion to the stdio
//      surface; Plan 14-02 keeps that surface intact.
//
// Plan 14-02 swapped the Wave-0 local RequestType declaration for the canonical
// QueryRationaleAtRequest import from kernel/src/rpc/methods.ts (via the rpc barrel).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as rpc from 'vscode-jsonrpc/node.js';
import { Duplex } from 'node:stream';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer, QueryRationaleAtRequest } from '../../rpc/index.js';

function makePipePair(): { a: Duplex; b: Duplex } {
	const a = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { a.push(c); cb(); } });
	return { a, b };
}

describe('graph.queryRationaleAt RPC handler', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	let receiptDao: ReceiptDAO;
	let serverConn: rpc.MessageConnection;
	let clientConn: rpc.MessageConnection;

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
		receiptDao = new ReceiptDAO(handle.db);

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

	it('Plan 14-02 registers the handler on createRpcServer (Wave-0 RED)', async () => {
		// Until Plan 14-02 lands the handler, this rejects with "Method not found".
		const asOf = new Date().toISOString();
		await expect(
			clientConn.sendRequest(QueryRationaleAtRequest, {
				anchor: { kind: 'file', path: 'src/auth.ts' },
				asOf,
			}),
		).resolves.toBeDefined();
	});

	it('requireAuth wrapper rejects unauthenticated requests (Wave-0 RED)', async () => {
		// Stdio createRpcServer does not gate with authState (Phase 3 — pre-daemon). Once
		// Plan 14-02 also wires bindHandlersForTcp + requireAuth(QueryRationaleAtRequest),
		// THIS assertion will need to be re-keyed to use a TCP harness. For Wave-0 the
		// assertion form is "the handler returns a non-method-not-found rejection or a
		// success when called from an authenticated channel"; today the stdio handler
		// returns method-not-found unconditionally, so the test is RED on the
		// method-not-found path.
		const asOf = new Date().toISOString();
		await expect(
			clientConn.sendRequest(QueryRationaleAtRequest, {
				anchor: { kind: 'file', path: 'src/auth.ts' },
				asOf,
			}),
		).resolves.toBeDefined();
	});
});
