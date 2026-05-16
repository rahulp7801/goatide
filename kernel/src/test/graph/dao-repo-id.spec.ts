/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/dao-repo-id.spec.ts — Phase 17 Plan 17-04 DEEP-06 phase-B.
//
// B1 prerequisite regression sentry: asserts dao.queryAsOf() rows carry repo_id='primary'
// and dao.queryEdgesAsOf() rows carry repo_id='primary' on a default-seeded fixture.
//
// This spec GREEN-flips BEFORE the wire-schema extension (dao.ts must be correct for the
// rpc handler to project repo_id to the wire). Any future regression in materialize()
// that drops repo_id would be caught here INDEPENDENTLY of the rpc-level queryGraphSnapshot
// spec, providing defense-in-depth at the dao boundary (Pitfall D defense).
//
// Pattern: follows queryByRepo.spec.ts seed + asOf + assertion structure verbatim.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('dao.queryAsOf + dao.queryEdgesAsOf repo_id projection (Phase 17 DEEP-06 phase-B B1)', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('queryAsOf rows carry repo_id="primary" on a default-seeded fixture', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed 2 nodes at default repo_id='primary' (migration 0008 backfill)
			dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });

			// Write one edge between them
			const { id: decId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: cnId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			dao.writeEdge({ kind: 'references', src_id: decId, dst_id: cnId });

			// asOf after all writes land
			const lastRow = sqlite.prepare(`SELECT valid_from FROM nodes ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastRow.valid_from) + 1).toISOString();

			const nodeRows = dao.queryAsOf(asOf);
			expect(nodeRows.length).toBeGreaterThan(0);
			// Every row must carry repo_id='primary' (all seeded rows land with the default)
			expect(nodeRows.every(r => r.repo_id === 'primary')).toBe(true);

			const edgeRows = dao.queryEdgesAsOf(asOf);
			expect(edgeRows.length).toBeGreaterThan(0);
			// Symmetric assertion for edges
			expect(edgeRows.every(e => e.repo_id === 'primary')).toBe(true);
		} finally {
			close();
		}
	});
});
