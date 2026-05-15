/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/queryByRepo.spec.ts — Phase 16 Plan 16-02 Task 1.
// 3-case GREEN suite: dao.queryByRepo real body (Drizzle eq(repo_id) + bitemporal clauses).
// Wave-0 throw-stub replaced by Wave 1 real body; all 3 cases flip GREEN.
// VALIDATION.md task rows 16-00-07..09 grep target: verbatim case-name strings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('dao.queryByRepo', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('returns only primary-repo nodes for repoId="primary"', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed 3 nodes — all default to repo_id='primary' via migration 0008.
			dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			dao.seed({ payload: VALID_PAYLOADS.ContractNode, provenance: VALID_PROVENANCE });
			// Read asOf after all writes to guarantee bitemporal coverage.
			const lastRow = sqlite.prepare(`SELECT valid_from FROM nodes ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastRow.valid_from) + 1).toISOString();

			const rows = dao.queryByRepo('primary', asOf);
			expect(rows.length).toBe(3);
		} finally {
			close();
		}
	});

	it('honors bitemporal asOf for repo-scoped reads', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed d1 at t1, then supersede with d2 at t2 > t1.
			const { id: d1Id } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const d1Row = sqlite.prepare(`SELECT valid_from FROM nodes WHERE id = ?`).get(d1Id) as { valid_from: string };
			const t1Plus = new Date(Date.parse(d1Row.valid_from) + 1).toISOString();

			// Small sleep to ensure t2 > t1 on Windows (Date.now granularity).
			const SPIN = Date.now() + 5;
			while (Date.now() < SPIN) { /* busy wait */ }

			const { newId: d2Id } = dao.supersede(d1Id, { kind: 'DecisionNode', body: 'Revised after superseding' });
			const d2Row = sqlite.prepare(`SELECT valid_from FROM nodes WHERE id = ?`).get(d2Id) as { valid_from: string };
			const t2Plus = new Date(Date.parse(d2Row.valid_from) + 1).toISOString();

			// At t1+ε: only d1 visible (d2 not yet "recorded").
			const atT1 = dao.queryByRepo('primary', t1Plus);
			expect(atT1.some(r => r.id === d1Id)).toBe(true);
			expect(atT1.some(r => r.id === d2Id)).toBe(false);

			// At t2+ε: d1 invalidated (invisible), d2 active.
			const atT2 = dao.queryByRepo('primary', t2Plus);
			expect(atT2.some(r => r.id === d1Id)).toBe(false);
			expect(atT2.some(r => r.id === d2Id)).toBe(true);
		} finally {
			close();
		}
	});

	it('returns [] for an empty repo', () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed some nodes (all repo_id='primary') and query a nonexistent repo.
			dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const asOf = new Date().toISOString();
			const rows = dao.queryByRepo('nonexistent-repo', asOf);
			expect(rows).toEqual([]);
		} finally {
			close();
		}
	});
});
