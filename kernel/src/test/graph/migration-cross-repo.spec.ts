/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/migration-cross-repo.spec.ts — Phase 16 Plan 16-01 Task 3.
//
// 5-case suite for 0008_cross_repo_identity.sql.
// Tests #1-#4 GREEN at Wave-0 close (migration body landed in Task 1).
// Test #5 (collision-namespacing) RED at Wave-0 close — dao.queryByRepo is a throw-stub
// until Wave 1 (Plan 16-02) fills the body.
//
// VALIDATION.md task rows 16-00-01..05 grep target: verbatim case-name strings.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('migration 0008_cross_repo_identity', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('migration adds repo_id column with NOT NULL DEFAULT primary to nodes', () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const cols = sqlite.prepare(`PRAGMA table_info(nodes)`).all() as Array<{
				cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number;
			}>;
			const repoIdCol = cols.find(c => c.name === 'repo_id');
			expect(repoIdCol).toBeDefined();
			expect(repoIdCol!.type).toBe('TEXT');
			expect(repoIdCol!.notnull).toBe(1);
			expect(repoIdCol!.dflt_value).toBe("'primary'");
		} finally {
			close();
		}
	});

	it('migration adds repo_id column with NOT NULL DEFAULT primary to edges', () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const cols = sqlite.prepare(`PRAGMA table_info(edges)`).all() as Array<{
				cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number;
			}>;
			const repoIdCol = cols.find(c => c.name === 'repo_id');
			expect(repoIdCol).toBeDefined();
			expect(repoIdCol!.type).toBe('TEXT');
			expect(repoIdCol!.notnull).toBe(1);
			expect(repoIdCol!.dflt_value).toBe("'primary'");
		} finally {
			close();
		}
	});

	it('migration backfills existing rows to repo_id = primary', () => {
		// Open DB, seed one node, verify repo_id is 'primary' (backfill via DEFAULT).
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const rows = sqlite.prepare(`SELECT repo_id FROM nodes`).all() as Array<{ repo_id: string }>;
			expect(rows.length).toBeGreaterThan(0);
			for (const row of rows) {
				expect(row.repo_id).toBe('primary');
			}
		} finally {
			close();
		}
	});

	it('migration creates nodes_repo_id index', () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const objects = sqlite.prepare(
				`SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`
			).all() as Array<{ type: string; name: string }>;
			expect(objects).toEqual(expect.arrayContaining([
				{ type: 'index', name: 'nodes_repo_id' },
				{ type: 'index', name: 'edges_repo_id' },
			]));
		} finally {
			close();
		}
	});

	it('two repos with identical ULID sequences are namespaced by repo_id', () => {
		// Phase 16 deployment model: one DB per repo + bridge-side query-layer stitching.
		// See 16-RESEARCH.md ## Open Decisions §6.
		// Seed two separate temp DBs with the same node payloads; assert queryByRepo('primary', asOf)
		// on each DB returns that DB's rows ONLY (semantic (a): each repo carries its own SQLite DB;
		// repo_id distinguishes at query-layer; no PRIMARY KEY conflict because no single DB holds
		// both repos' rows).
		const tmpA = mkTempDb();
		const tmpB = mkTempDb();
		try {
			const { db: dbA, sqlite: sqliteA, close: closeA } = openDatabase(tmpA.dbPath);
			const daoA = new GraphDAO(dbA);
			let rowsA: ReturnType<typeof daoA.queryByRepo>;
			try {
				daoA.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
				daoA.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
				// Capture asOf after all writes in DB-A.
				const lastA = sqliteA.prepare(`SELECT valid_from FROM nodes ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
				const asOfA = new Date(Date.parse(lastA.valid_from) + 1).toISOString();
				// queryByRepo('primary', asOf) on DB-A returns only DB-A's rows.
				rowsA = daoA.queryByRepo('primary', asOfA);
				expect(rowsA.length).toBe(2);
			} finally {
				closeA();
			}

			const { db: dbB, sqlite: sqliteB, close: closeB } = openDatabase(tmpB.dbPath);
			const daoB = new GraphDAO(dbB);
			try {
				daoB.seed({ payload: VALID_PAYLOADS.ContractNode, provenance: VALID_PROVENANCE });
				// Capture asOf after all writes in DB-B.
				const lastB = sqliteB.prepare(`SELECT valid_from FROM nodes ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
				const asOfB = new Date(Date.parse(lastB.valid_from) + 1).toISOString();
				// queryByRepo('primary', asOf) on DB-B returns only DB-B's rows.
				const rowsB = daoB.queryByRepo('primary', asOfB);
				expect(rowsB.length).toBe(1);
				// DB-A's node IDs must NOT appear in DB-B's result (different DBs, no shared state).
				const rowAIds = rowsA.map(r => r.id);
				for (const row of rowsB) {
					expect(rowAIds).not.toContain(row.id);
				}
			} finally {
				closeB();
			}
		} finally {
			tmpA.dispose();
			tmpB.dispose();
		}
	});
});
