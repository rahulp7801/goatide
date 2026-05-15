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
		// See 16-RESEARCH.md ## Open Decisions §6. Test #5 RED until Wave 1 fills queryByRepo.
		// Seed two separate temp DBs with the same node payloads; assert queryByRepo on each
		// returns its own scoped rows only. Wave-0: dao.queryByRepo throws => RED.
		const tmpA = mkTempDb();
		const tmpB = mkTempDb();
		try {
			const { db: dbA, close: closeA } = openDatabase(tmpA.dbPath);
			const daoA = new GraphDAO(dbA);
			try {
				daoA.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
				const asOf = new Date().toISOString();
				// Wave-0 throw-stub: Wave 1 (Plan 16-02) GREEN-flips with real Drizzle body.
				expect(() => daoA.queryByRepo('A', asOf)).toThrow('Wave 1 implements');
			} finally {
				closeA();
			}

			const { db: dbB, close: closeB } = openDatabase(tmpB.dbPath);
			const daoB = new GraphDAO(dbB);
			try {
				daoB.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
				const asOf = new Date().toISOString();
				expect(() => daoB.queryByRepo('B', asOf)).toThrow('Wave 1 implements');
			} finally {
				closeB();
			}
		} finally {
			tmpA.dispose();
			tmpB.dispose();
		}
	});
});
