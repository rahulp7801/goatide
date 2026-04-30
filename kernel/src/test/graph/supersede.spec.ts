/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/supersede.spec.ts — Plan 02-03 Task 3.
//
// Integration coverage of GraphDAO.supersede (GRAPH-07):
//   - Atomicity: UPDATE old + INSERT new + INSERT supersedes edge in ONE transaction.
//   - Pitfall 7: a single captured ts is reused for old.invalidated_at, new.valid_from,
//     and edge.valid_from — observable via the equality assertion below.
//   - Idempotency guard: superseding an already-superseded id throws (UPDATE row
//     count guard).
//   - Rollback: superseding a non-existent id throws and leaves the DB unchanged
//     (the transaction-throwing pattern verified end-to-end).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('GraphDAO.supersede (GRAPH-07)', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('atomically: invalidates old, inserts new with same instant, writes supersedes edge', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: oldId } = dao.seed({
				payload: VALID_PAYLOADS.ConstraintNode,
				provenance: VALID_PROVENANCE,
			});
			const newPayload = {
				kind: 'ConstraintNode' as const,
				body: 'Revised: FK columns ALSO accept whitespace-only strings as NULL',
			};
			const { newId } = dao.supersede(oldId, newPayload);

			const oldRow = dao.queryById(oldId);
			const newRow = dao.queryById(newId);
			const edgeRow = sqlite.prepare(
				`SELECT * FROM edges WHERE kind = 'supersedes' AND src_id = ? AND dst_id = ?`
			).get(newId, oldId) as { valid_from: string; recorded_at: string } | undefined;
			const allEdges = sqlite.prepare(`SELECT count(*) as n FROM edges`).get() as { n: number };
			const allNodes = sqlite.prepare(`SELECT count(*) as n FROM nodes`).get() as { n: number };

			// Pitfall 7 assertion: invalidated_at, new.valid_from, edge.valid_from all equal.
			expect({
				oldInvalidated:     oldRow?.invalidated_at !== null,
				oldSupersededBy:    oldRow?.superseded_by === newId,
				newActive:          newRow?.invalidated_at === null,
				newKindMatches:     newRow?.kind === 'ConstraintNode',
				edgeExists:         !!edgeRow,
				timestampsAlign:    oldRow?.invalidated_at === newRow?.valid_from && newRow?.valid_from === edgeRow?.valid_from,
				nodeCount:          allNodes.n,
				edgeCount:          allEdges.n,
			}).toEqual({
				oldInvalidated:     true,
				oldSupersededBy:    true,
				newActive:          true,
				newKindMatches:     true,
				edgeExists:         true,
				timestampsAlign:    true,
				nodeCount:          2,
				edgeCount:          1,
			});
		} finally { close(); }
	});

	it('throws when superseding an already-superseded id (idempotency guard)', () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: a } = dao.seed({
				payload: VALID_PAYLOADS.ConstraintNode,
				provenance: VALID_PROVENANCE,
			});
			dao.supersede(a, { kind: 'ConstraintNode', body: 'first revision' });

			let caught: unknown;
			try {
				dao.supersede(a, {
					kind: 'ConstraintNode',
					body: 'second revision attempted on a (already superseded)',
				});
			} catch (e) {
				caught = e;
			}
			expect((caught as Error).message).toMatch(/not found or already superseded/);
		} finally { close(); }
	});

	it('rolls back the entire supersession if the target id is missing (DB unchanged)', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: a } = dao.seed({
				payload: VALID_PAYLOADS.ConstraintNode,
				provenance: VALID_PROVENANCE,
			});
			let caught: unknown;
			try {
				dao.supersede('01HZNEVERINSERTEDAAAAAAAAA', {
					kind: 'ConstraintNode',
					body: 'whatever',
				});
			} catch (e) {
				caught = e;
			}
			const counts = {
				nodes: (sqlite.prepare(`SELECT count(*) as n FROM nodes`).get() as { n: number }).n,
				edges: (sqlite.prepare(`SELECT count(*) as n FROM edges`).get() as { n: number }).n,
			};
			expect({ threw: !!caught, counts, seededIdStillActive: dao.queryById(a)?.invalidated_at === null }).toEqual({
				threw: true,
				counts: { nodes: 1, edges: 0 },
				seededIdStillActive: true,
			});
		} finally { close(); }
	});
});
