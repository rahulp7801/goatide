/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/queryGraphSnapshot.spec.ts — Phase 15 Plan 15-02 (Wave-1 GREEN).
//
// Plan 15-01 (Wave-0) shipped 3 it.skip placeholders with LOCKED case-name strings; this
// plan flips .skip -> live and fills the bodies. The case-name strings remain byte-identical
// per Plan 15-01 Task 5's contract (Nyquist Dim 8d inheritance):
//   1. 'returns nodes + edges + truncated=false at given asOf'
//   2. 'truncates to max_nodes when nodeRows exceeds the cap'
//   3. 'bitemporal — superseded at past asOf visible, at future asOf invisible'
//
// Determinism (Pitfall 1 carry from Phase 14): asOf captured by reading valid_from BACK from
// SQLite after each seed lands rather than via Date.now()+N math. Windows Date.now() has
// ~15ms granularity which can let multiple seed writes share a millisecond and break strict
// ordering.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as rpc from 'vscode-jsonrpc/node.js';
import { Duplex } from 'node:stream';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer, QueryGraphSnapshotRequest } from '../../rpc/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

function makePipePair(): { a: Duplex; b: Duplex } {
	const a = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { a.push(c); cb(); } });
	return { a, b };
}

describe('graph.queryGraphSnapshot RPC', () => {
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

	it('returns nodes + edges + truncated=false at given asOf', async () => {
		// Seed: 3 nodes (DecisionNode + ConstraintNode + OpenQuestion), 2 edges
		// (references DecisionNode->ConstraintNode, references DecisionNode->OpenQuestion).
		const { id: decisionId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		const { id: openQId } = dao.seed({ payload: VALID_PAYLOADS.OpenQuestion, provenance: VALID_PROVENANCE });
		dao.writeEdge({ kind: 'references', src_id: decisionId, dst_id: constraintId });
		const { id: e2Id } = dao.writeEdge({ kind: 'references', src_id: decisionId, dst_id: openQId });

		// Pitfall 1 (REC-03): capture asOf AFTER all writes (nodes AND edges) land. Reading
		// the LAST written edge's valid_from back from SQLite ensures the asOf boundary
		// covers the entire seed sequence — without this, sub-millisecond write ordering on
		// fast machines can leave the latest edge written at the same instant as openQId's
		// valid_from, producing valid_from > asOf for the last edge (Phase 14 W3 fix carry).
		await new Promise((r) => setTimeout(r, 5));
		const lastEdge = handle.sqlite.prepare(`SELECT valid_from FROM edges WHERE id = ?`).get(e2Id) as { valid_from: string };
		const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

		const result = await clientConn.sendRequest(QueryGraphSnapshotRequest, { asOf });
		expect(result.truncated).toBe(false);
		expect(result.nodes.length).toBe(3);
		expect(result.edges.length).toBe(2);

		// Spot-check serialization: each node carries label + valid_from string. Label is
		// truncated to 80 chars (the seed bodies are all well under, so equality with the
		// source body is the canonical assertion).
		const decision = result.nodes.find((n) => n.kind === 'DecisionNode');
		expect(decision).toBeDefined();
		expect(decision!.label.length).toBeLessThanOrEqual(80);
		expect(typeof decision!.valid_from).toBe('string');
		expect(decision!.invalidated_at).toBeNull();
	});

	it('truncates to max_nodes when nodeRows exceeds the cap', async () => {
		// Seed 10 DecisionNodes; capture an edge from #0 -> #5 + an edge from #0 -> #9
		// to test orphan-edge prevention: with max_nodes=5, only the first 5 nodes are
		// returned. The edge to #9 must NOT appear in the result; the edge to #5 might
		// or might not appear depending on the slice boundary (#5 is at index 5, slice(0,5)
		// excludes it, so that edge is also orphan-pruned).
		const ids: string[] = [];
		for (let i = 0; i < 10; i++) {
			const { id } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			ids.push(id);
		}
		dao.writeEdge({ kind: 'references', src_id: ids[0]!, dst_id: ids[5]! });
		const { id: lastEdgeId } = dao.writeEdge({ kind: 'references', src_id: ids[0]!, dst_id: ids[9]! });

		// asOf AFTER last edge lands — covers all 10 nodes + both edges (Phase 14 W3 carry).
		await new Promise((r) => setTimeout(r, 5));
		const lastEdge = handle.sqlite.prepare(`SELECT valid_from FROM edges WHERE id = ?`).get(lastEdgeId) as { valid_from: string };
		const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

		const result = await clientConn.sendRequest(QueryGraphSnapshotRequest, { asOf, max_nodes: 5 });
		expect(result.truncated).toBe(true);
		expect(result.nodes.length).toBe(5);

		// Orphan-edge prevention: any edge whose endpoint is outside the 5-node truncated
		// set must NOT appear. (Both seeded edges have dst outside the slice — the result's
		// edges array should contain neither.)
		const nodeIdSet = new Set(result.nodes.map((n) => n.node_id));
		for (const e of result.edges) {
			expect(nodeIdSet.has(e.src_id)).toBe(true);
			expect(nodeIdSet.has(e.dst_id)).toBe(true);
		}
	});

	it('bitemporal — superseded at past asOf visible, at future asOf invisible', async () => {
		// Seed DecisionNode d1; supersede with DecisionNode d2 (different body).
		const { id: d1Id } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
		// asOf at d1's valid_from + epsilon — d1 visible, d2 not yet seeded.
		const d1Row = handle.sqlite.prepare(`SELECT valid_from FROM nodes WHERE id = ?`).get(d1Id) as { valid_from: string };
		const t1Plus = new Date(Date.parse(d1Row.valid_from) + 1).toISOString();

		await new Promise((r) => setTimeout(r, 5));
		const { newId: d2Id } = dao.supersede(d1Id, { kind: 'DecisionNode', body: 'Revised decision after superseding event' });
		const d2Row = handle.sqlite.prepare(`SELECT valid_from FROM nodes WHERE id = ?`).get(d2Id) as { valid_from: string };
		const t2Plus = new Date(Date.parse(d2Row.valid_from) + 1).toISOString();

		// At t1+ε: d1 active, d2 not yet seeded.
		const past = await clientConn.sendRequest(QueryGraphSnapshotRequest, { asOf: t1Plus });
		expect(past.nodes.some((n) => n.node_id === d1Id)).toBe(true);
		expect(past.nodes.some((n) => n.node_id === d2Id)).toBe(false);

		// At t2+ε: d1 invalidated (invisible), d2 active.
		const future = await clientConn.sendRequest(QueryGraphSnapshotRequest, { asOf: t2Plus });
		expect(future.nodes.some((n) => n.node_id === d1Id)).toBe(false);
		expect(future.nodes.some((n) => n.node_id === d2Id)).toBe(true);
	});
});
