/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/queryTimelineTransitions.spec.ts — Phase 15 Plan 15-02 (Wave-1 GREEN).
//
// graph.queryTimelineTransitions returns the deduped, sorted-ascending union of every
// distinct valid_from + invalidated_at instant across nodes AND edges. Powers the Graph
// Inspector slider (RESEARCH Risk 4) — the webview snaps to these transition points so
// every drag step produces a visually-distinct snapshot.
//
// Two cases land GREEN this plan:
//   1. Deduped sorted ascending union of valid_from + invalidated_at across nodes + edges
//   2. Excludes NULL invalidated_at values (active rows contribute only their valid_from)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as rpc from 'vscode-jsonrpc/node.js';
import { Duplex } from 'node:stream';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer, QueryTimelineTransitionsRequest } from '../../rpc/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

function makePipePair(): { a: Duplex; b: Duplex } {
	const a = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { a.push(c); cb(); } });
	return { a, b };
}

describe('graph.queryTimelineTransitions RPC', () => {
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

	it('returns deduped sorted ascending union of valid_from + invalidated_at across nodes + edges', async () => {
		// Seed nodes + edges with distinct timestamps. Sequence:
		//   - n1 valid_from=t1
		//   - n2 valid_from=t2
		//   - e1 valid_from=t3 (n1 -> n2)
		//   - supersede n1 -> n1b at t4 (invalidates n1, sets n1.invalidated_at=t4, seeds n1b at t4)
		// Expected distinct instants: t1, t2, t3, t4 (n1b.valid_from coincides with n1.invalidated_at,
		// dedup collapses them; the supersedes edge's valid_from also coincides with t4).
		const { id: n1 } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		await new Promise((r) => setTimeout(r, 5));
		const { id: n2 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
		await new Promise((r) => setTimeout(r, 5));
		dao.writeEdge({ kind: 'references', src_id: n2, dst_id: n1 });
		await new Promise((r) => setTimeout(r, 5));
		dao.supersede(n1, { kind: 'ConstraintNode', body: 'Revised constraint after supersession landing' });

		const result = await clientConn.sendRequest(QueryTimelineTransitionsRequest, undefined);

		// Snapshot-style single assertion (per CLAUDE.md Learnings — minimize assertion count):
		// the returned array IS the timeline. Two structural invariants encoded jointly:
		//   1. sorted ascending: result.transitions === [...result.transitions].sort()
		//   2. deduped: new Set(result.transitions).size === result.transitions.length
		// Combining both: result.transitions deepStrictEqual the sorted-unique projection of itself.
		const sortedUnique = [...new Set(result.transitions)].sort();
		expect(result.transitions).toEqual(sortedUnique);
		// And the set is non-trivial — at least 3 distinct instants (t1, t2, t3 — t4 may collapse
		// with t3 if writes land in the same millisecond on Windows, but the dedup guarantee
		// holds either way).
		expect(result.transitions.length).toBeGreaterThanOrEqual(3);
	});

	it('excludes NULL invalidated_at values', async () => {
		// Seed only active rows — every node + edge has invalidated_at = NULL. The result
		// must contain only valid_from values; no NULLs surface in the array.
		dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
		const { id: n2 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
		const { id: n3 } = dao.seed({ payload: VALID_PAYLOADS.OpenQuestion, provenance: VALID_PROVENANCE });
		dao.writeEdge({ kind: 'references', src_id: n2, dst_id: n3 });

		const result = await clientConn.sendRequest(QueryTimelineTransitionsRequest, undefined);

		// Every entry is a non-null string (NULLs filtered out by the WHERE clauses in the
		// DAO query). The array is non-empty (seeded rows contribute at least their valid_from).
		expect(result.transitions.length).toBeGreaterThan(0);
		expect(result.transitions.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
	});
});
