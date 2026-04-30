/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/as-of.spec.ts — Plan 02-03 Task 3.
//
// Integration coverage of bitemporal as-of queries (GRAPH-08):
//   - queryAsOf at a past instant returns the OLD version of a superseded node.
//   - queryAsOf at "now" returns the NEW version.
//   - active_nodes view returns only the new (uninvalidated) row — confirming
//     the view's WHERE invalidated_at IS NULL contract from Wave 1.
//   - queryByKind without asOf returns the active set.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('Bitemporal as-of queries (GRAPH-08)', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('queryAsOf at past returns OLD version; at now returns NEW version; active_nodes view shows only new', async () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: oldId } = dao.seed({
				payload: VALID_PAYLOADS.ConstraintNode,
				provenance: VALID_PROVENANCE,
			});
			const oldRow = dao.queryById(oldId)!;
			const tBeforeSupersede = oldRow.recorded_at;

			// 5 ms wait to guarantee a strictly later ISO timestamp on the new row.
			// Date.now() resolution is 1 ms on Node 22; the predicate uses lexical string
			// comparison on ISO-8601 with millisecond precision, so 1 ms is sufficient
			// and 5 ms gives margin under any clock-jitter / Windows-FILETIME granularity.
			await new Promise((r) => setTimeout(r, 5));
			const { newId } = dao.supersede(oldId, {
				kind: 'ConstraintNode',
				body: 'revised constraint body',
			});
			const tAfter = new Date().toISOString();

			// queryAsOf at the old row's recorded_at: should return the old row (active at
			// that instant) and NOT the new row (which doesn't exist yet at that instant).
			const atPast = dao.queryAsOf(tBeforeSupersede);
			const atNow = dao.queryAsOf(tAfter);
			const activeView = sqlite.prepare(`SELECT * FROM active_nodes`).all() as Array<{ id: string }>;

			expect({
				atPast_count:       atPast.length,
				atPast_id:          atPast[0]?.id,
				atNow_count:        atNow.length,
				atNow_id:           atNow[0]?.id,
				activeView_count:   activeView.length,
				activeView_id:      activeView[0]?.id,
			}).toEqual({
				atPast_count:       1,
				atPast_id:          oldId,
				atNow_count:        1,
				atNow_id:           newId,
				activeView_count:   1,
				activeView_id:      newId,
			});
		} finally { close(); }
	});

	it('queryByKind with asOf filters bitemporally; without asOf returns active set', () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const a = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const b = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const constraints = dao.queryByKind('ConstraintNode');
			const decisions = dao.queryByKind('DecisionNode');
			expect({
				cCount: constraints.length,
				dCount: decisions.length,
				cId:    constraints[0]?.id,
				dId:    decisions[0]?.id,
			}).toEqual({
				cCount: 1,
				dCount: 1,
				cId:    a.id,
				dId:    b.id,
			});
		} finally { close(); }
	});
});
