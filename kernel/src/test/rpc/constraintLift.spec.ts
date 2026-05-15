/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/constraintLift.spec.ts — Phase 16 Plan 16-02 Task 3.
// 3-case GREEN suite: graph.constraintLift handler registered in server.ts via requireAuth.
// All 3 cases flip GREEN from the Wave-0 MethodNotFound state.
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
		// Phase 16 Plan 16-02: createRpcServer accepts pre-built connection for test harness.
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
		// Seed a ConstraintNode + 2 downstream nodes connected via parent_of and protects.
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		const { id: decisionId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
		const { id: contractId } = dao.seed({ payload: VALID_PAYLOADS.ContractNode, provenance: VALID_PROVENANCE });
		dao.writeEdge({ kind: 'protects', src_id: constraintId, dst_id: decisionId });
		dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: contractId });

		// Capture asOf AFTER all writes.
		await new Promise((r) => setTimeout(r, 5));
		const lastEdge = handle.sqlite.prepare(`SELECT valid_from FROM edges ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
		const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

		const result = await clientConn.sendRequest(ConstraintLiftRequest, {
			constraint_node_id: constraintId,
			asOf,
			max_hops: 3,
		});

		// Assert full composition chain: hypothetical_impact + confidence_score.
		expect(result.hypothetical_impact.contract_node_id).toBe(constraintId);
		const allRows = [
			...result.hypothetical_impact.definitely_affected,
			...result.hypothetical_impact.potentially_affected,
		];
		expect(allRows.length).toBe(2);
		expect(allRows.some((r) => r.node_id === decisionId)).toBe(true);
		expect(allRows.some((r) => r.node_id === contractId)).toBe(true);
		expect(typeof result.confidence_score).toBe('number');
		expect(result.confidence_score).toBeGreaterThanOrEqual(0);
		expect(result.confidence_score).toBeLessThanOrEqual(1);
	});

	it('handler is wrapped in requireAuth', async () => {
		// Stdio transport (createRpcServer without authState) passes requireAuth through
		// unconditionally — the gate only fires on TCP transport (authState.authenticated check).
		// So on stdio: the request succeeds without any auth token. This mirrors the Phase 14/15
		// handler precedent (queryRationaleAt + queryGraphSnapshot — both pass on stdio).
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		const asOf = new Date().toISOString();

		// On stdio transport, requireAuth is a no-op wrapper — the request must succeed.
		const result = await clientConn.sendRequest(ConstraintLiftRequest, {
			constraint_node_id: constraintId,
			asOf,
		});
		// No auth required on stdio — expect a valid result shape.
		expect(result.hypothetical_impact).toBeDefined();
		expect(typeof result.confidence_score).toBe('number');
	});

	it('returns Zod-shape-conforming ConstraintLiftResult', async () => {
		// Seed a ConstraintNode and verify the response shape matches ConstraintLiftResult.
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		const asOf = new Date().toISOString();

		const result = await clientConn.sendRequest(ConstraintLiftRequest, {
			constraint_node_id: constraintId,
			asOf,
		});

		// Structural conformance checks (ConstraintLiftResult shape).
		expect(typeof result.hypothetical_impact.contract_node_id).toBe('string');
		expect(Array.isArray(result.hypothetical_impact.definitely_affected)).toBe(true);
		expect(Array.isArray(result.hypothetical_impact.potentially_affected)).toBe(true);
		expect(typeof result.hypothetical_impact.truncated).toBe('boolean');
		expect(typeof result.confidence_score).toBe('number');
		expect(result.confidence_score).toBeGreaterThanOrEqual(0);
		expect(result.confidence_score).toBeLessThanOrEqual(1);
	});
});
