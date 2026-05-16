/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/queryGraphSnapshot-repo-id.spec.ts — Phase 17 Plan 17-04 DEEP-06 phase-B.
//
// Wire-schema sentry: queryGraphSnapshot response carries repo_id on every node and edge.
// Defense against Pitfall D (handler projection drops the field even though SQLite column
// exists since migration 0008).
//
// 1-case GREEN spec: seed 2 nodes + 1 edge at default repo_id='primary' (migration 0008
// backfill), call queryGraphSnapshot, assert every node and edge has repo_id='primary'.
//
// Back-compat invariant: Phase 15's existing queryGraphSnapshot.spec.ts Cases 1-3 continue
// to pass — the new repo_id field is additive (existing consumers ignoring it are unaffected).
//
// Pattern: mirrors queryGraphSnapshot.spec.ts harness setup verbatim (pipe pair +
// createRpcServer + clientConn.sendRequest).

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

describe('queryGraphSnapshot repo_id wire projection (Phase 17 DEEP-06 phase-B)', () => {
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

	it('returns repo_id on every node and every edge of a primary-repo seed', async () => {
		// Seed 2 nodes + 1 edge at default repo_id='primary' (migration 0008 backfill).
		const { id: decisionId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
		const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		const { id: edgeId } = dao.writeEdge({ kind: 'references', src_id: decisionId, dst_id: constraintId });

		// Pitfall 1 (REC-03): capture asOf AFTER all writes land — mirrors queryGraphSnapshot.spec.ts pattern.
		await new Promise((r) => setTimeout(r, 5));
		const lastEdge = handle.sqlite.prepare(`SELECT valid_from FROM edges WHERE id = ?`).get(edgeId) as { valid_from: string };
		const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

		const result = await clientConn.sendRequest(QueryGraphSnapshotRequest, { asOf });

		expect(result.nodes.length).toBeGreaterThan(0);
		expect(result.edges.length).toBeGreaterThan(0);

		// Pitfall D defense: every node must carry repo_id='primary' (not undefined, not dropped).
		expect(result.nodes.every(n => n.repo_id === 'primary')).toBe(true);
		// Edge variant — symmetric assertion.
		expect(result.edges.every(e => e.repo_id === 'primary')).toBe(true);
	});
});
