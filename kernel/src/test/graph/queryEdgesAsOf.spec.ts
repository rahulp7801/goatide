/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/queryEdgesAsOf.spec.ts — Phase 15 Plan 15-01 (Wave-0).
//
// Bitemporal-correctness suite for the new edges read API. Same predicate as
// GraphDAO.queryAsOf for nodes (valid_from <= asOf AND (invalidated_at IS NULL OR
// invalidated_at > asOf) AND recorded_at <= asOf), applied to the edges table.
//
// Wave-0 GREEN at close: the DAO method body ships in this plan; the 4 it() cases below
// fail iff the predicate composition has drifted.
//
// Determinism: each case reads valid_from / recorded_at BACK from SQLite after the write
// lands, then constructs the asOf boundary FROM those read values. This mirrors Phase 14
// rationale-chain.spec.ts asOf-determinism pattern — Date.now() granularity on Windows can
// otherwise let multiple seed writes land at the same millisecond, breaking strict ordering.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('queryEdgesAsOf', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('returns edges valid at asOf and excludes edges not yet visible', async () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: a } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: b } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: e1 } = dao.writeEdge({ kind: 'references', src_id: a, dst_id: b });
			// Capture asOf AFTER e1 lands but BEFORE e2 lands (read back from SQLite for
			// determinism — see file header comment).
			const e1Row = sqlite.prepare(`SELECT valid_from FROM edges WHERE id = ?`).get(e1) as { valid_from: string };
			await new Promise((r) => setTimeout(r, 5));
			const { id: e2 } = dao.writeEdge({ kind: 'parent_of', src_id: b, dst_id: a });
			const e2Row = sqlite.prepare(`SELECT valid_from FROM edges WHERE id = ?`).get(e2) as { valid_from: string };

			// Sanity: e2 strictly after e1.
			expect(e1Row.valid_from < e2Row.valid_from).toBe(true);

			// At e1's valid_from, only e1 should be visible (e2 isn't valid yet).
			const atE1 = dao.queryEdgesAsOf(e1Row.valid_from);
			const ids = atE1.map((r) => r.id).sort();
			expect(ids).toEqual([e1]);
		} finally { close(); }
	});

	it('excludes edges invalidated at or before asOf', async () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: a } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: b } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: e1 } = dao.writeEdge({ kind: 'references', src_id: a, dst_id: b });

			// Manually invalidate e1 via raw SQL (the DAO has no `invalidateEdge` surface;
			// supersession-on-edges is reserved for future work). The bitemporal predicate
			// applies regardless of how the row reached its invalidated state.
			const invalidatedAt = new Date(Date.now() + 5).toISOString();
			sqlite.prepare(`UPDATE edges SET invalidated_at = ? WHERE id = ?`).run(invalidatedAt, e1);

			// asOf strictly after the invalidation point — e1 must be excluded.
			const future = new Date(Date.parse(invalidatedAt) + 5).toISOString();
			const atFuture = dao.queryEdgesAsOf(future);
			expect(atFuture.map((r) => r.id)).toEqual([]);
		} finally { close(); }
	});

	it('includes edges with invalidated_at === null at any future asOf', () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: a } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: b } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: e1 } = dao.writeEdge({ kind: 'references', src_id: a, dst_id: b });

			// Far-future asOf — active edges (invalidated_at IS NULL) stay visible indefinitely.
			const far = '9999-12-31T23:59:59.999Z';
			const rows = dao.queryEdgesAsOf(far);
			expect(rows.map((r) => r.id)).toEqual([e1]);
			expect(rows[0]?.invalidated_at).toBeNull();
		} finally { close(); }
	});

	it('respects recorded_at <= asOf (excludes edges whose write had not yet landed)', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: a } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: b } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });

			// Insert an edge with explicit valid_from in the past + recorded_at in the future
			// via raw SQL. recorded_at is immutable post-insert (Mandate B trigger), so set it
			// at insert time. This simulates an edge whose effective validity began in the past
			// but whose write hadn't been observed at the query asOf — exercising the
			// `recorded_at <= asOf` predicate clause independent of `valid_from <= asOf`.
			const edgeId = '01JE' + 'F'.repeat(22);
			const pastValidFrom = '2026-01-01T00:00:00.000Z';
			const futureRecordedAt = '9999-01-01T00:00:00.000Z';
			sqlite.prepare(`
				INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`).run(edgeId, 'references', a, b, pastValidFrom, futureRecordedAt);

			// asOf at a moment AFTER valid_from but BEFORE recorded_at — should NOT see this
			// edge because the write hadn't been recorded yet at that asOf.
			const middleAsOf = '2026-06-01T00:00:00.000Z';
			const atMiddle = dao.queryEdgesAsOf(middleAsOf);
			expect(atMiddle.map((r) => r.id)).toEqual([]);
		} finally { close(); }
	});
});
