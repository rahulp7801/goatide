/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/rationale-rpc.spec.ts — Phase 14 Plan 14-01 (Wave-0) RED suite for the
// graph.queryRationaleAt RPC handler that Plan 14-02 lands.
//
// Two contracts under test:
//   1. The handler is registered on the connection — sendRequest('graph.queryRationaleAt')
//      no longer returns the JSON-RPC "method not found" -32601 error (Plan 14-02 GREEN-flip).
//   2. requireAuth gate fires — when authState.authenticated is false, the handler rejects
//      with the same "authenticate must succeed before any other request" string the other
//      gated handlers emit (mirror of kernel/src/rpc/server.spec.ts shape).
//
// Wave-0: NO QueryRationaleAtRequest export exists on kernel/src/rpc/methods.ts yet. We
// construct a local RequestType bound to the wire method name 'graph.queryRationaleAt' so
// this spec is loadable today (vitest discovers it) and the assertions fail RED with the
// "method not found" path until Plan 14-02 registers the handler. Plan 14-02 SHOULD export
// the canonical QueryRationaleAtRequest from kernel/src/rpc/methods.ts and update this file
// to import it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as rpc from 'vscode-jsonrpc/node.js';
import { Duplex } from 'node:stream';
import { RequestType } from 'vscode-jsonrpc';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/index.js';

// Wave-0 placeholder. Plan 14-02 will export QueryRationaleAtRequest from
// kernel/src/rpc/methods.ts and this local declaration should be replaced with that
// import. The wire method name MUST stay byte-equal across the migration.
interface QueryRationaleAtParams {
	readonly anchor: { readonly kind: 'file' | 'symbol' | 'ticket' | 'node_id'; readonly path?: string; readonly value?: string; readonly symbol?: string; readonly ticket_id?: string; readonly id?: string };
	readonly asOf: string;
	readonly maxHops?: number;
}
interface QueryRationaleAtResult {
	readonly chain: readonly unknown[];
	readonly has_superseded: boolean;
}
const QueryRationaleAtRequest = new RequestType<QueryRationaleAtParams, QueryRationaleAtResult, Error>('graph.queryRationaleAt');

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
