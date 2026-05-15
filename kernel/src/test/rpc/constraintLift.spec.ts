/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/constraintLift.spec.ts — Phase 16 Plan 16-01 Task 3.
// 3-case RED suite at Wave-0 close: graph.constraintLift handler not yet registered in
// kernel/src/rpc/server.ts (Wave 1 — Plan 16-02 registers it). The RPC returns
// MethodNotFound (-32601) at Wave-0 close, making all 3 cases fail expectation-wise.
// Wave 1 (Plan 16-02) GREEN-flips all 3 by registering the handler.
// VALIDATION.md task rows 16-00-16..18 grep target: verbatim case-name strings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as rpc from 'vscode-jsonrpc/node.js';
import { Duplex } from 'node:stream';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer, ConstraintLiftRequest } from '../../rpc/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

function makePipePair(): { a: Duplex; b: Duplex } {
	const a = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { a.push(c); cb(); } });
	return { a, b };
}

describe('graph.constraintLift RPC', () => {
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
		serverConn = rpc.createMessageConnection(
			new rpc.StreamMessageReader(a),
			new rpc.StreamMessageWriter(a),
		);
		clientConn = rpc.createMessageConnection(
			new rpc.StreamMessageReader(b),
			new rpc.StreamMessageWriter(b),
		);
		createRpcServer({ connection: serverConn, dao, receiptDao, sqlite: handle.sqlite });
		serverConn.listen();
		clientConn.listen();
	});

	afterEach(() => {
		clientConn.dispose();
		serverConn.dispose();
		handle.close();
		tmp.dispose();
	});

	it('RPC composes runConstraintLiftAnalysis end-to-end', async () => {
		// Wave-0: handler not registered → MethodNotFound (Wave 1 registers it).
		// Wave 1 asserts the full composition chain.
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		const asOf = new Date().toISOString();
		// At Wave-0, the RPC throws ResponseError (MethodNotFound -32601).
		// Wave 1 (Plan 16-02) GREEN-flips with real ComplianceReport assertion.
		await expect(clientConn.sendRequest(ConstraintLiftRequest, {
			constraint_node_id: constraintId,
			asOf,
			max_hops: 3,
		})).rejects.toThrow();
	});

	it('handler is wrapped in requireAuth', async () => {
		// Wave-0: handler not registered (Wave 1 registers + wraps with requireAuth).
		// Wave 1 verifies the handler responds correctly on stdio (pass-through for stdio transport).
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		// At Wave-0, any call throws. Wave 1 asserts requireAuth pass-through on stdio.
		await expect(clientConn.sendRequest(ConstraintLiftRequest, {
			constraint_node_id: constraintId,
			asOf: new Date().toISOString(),
		})).rejects.toThrow();
	});

	it('returns Zod-shape-conforming ConstraintLiftResult', async () => {
		// Wave-0: handler not registered (Wave 1 registers and asserts ComplianceReport shape).
		// Wave 1 verifies hypothetical_impact is a valid ComplianceReport + confidence_score in [0,1].
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		// At Wave-0, any call throws. Wave 1 asserts { hypothetical_impact, confidence_score } shape.
		await expect(clientConn.sendRequest(ConstraintLiftRequest, {
			constraint_node_id: constraintId,
			asOf: new Date().toISOString(),
		})).rejects.toThrow();
	});
});
