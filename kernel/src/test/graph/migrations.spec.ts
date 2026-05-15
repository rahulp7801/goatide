/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/migrations.spec.ts — Plan 02-02 Task 3.
// Asserts that openDatabase against a fresh temp DB materializes the expected
// sqlite_master objects (3 tables + 1 view + 6 triggers + N indexes) and that
// re-running openDatabase against the same DB is a no-op (idempotency,
// per the drizzle-kit __drizzle_migrations tracking-table contract).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase } from '../../graph/db.js';

describe('migrations', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('creates nodes, edges, provenance tables + active_nodes view + six triggers', () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const objects = sqlite.prepare(
				`SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY type, name`
			).all() as Array<{ type: string; name: string }>;

			expect(objects).toEqual(expect.arrayContaining([
				{ type: 'table', name: 'nodes' },
				{ type: 'table', name: 'edges' },
				{ type: 'table', name: 'provenance' },
				{ type: 'view', name: 'active_nodes' },
				{ type: 'trigger', name: 'nodes_recorded_at_immutable' },
				{ type: 'trigger', name: 'nodes_no_delete' },
				{ type: 'trigger', name: 'edges_recorded_at_immutable' },
				{ type: 'trigger', name: 'edges_no_delete' },
				{ type: 'trigger', name: 'provenance_immutable' },
				{ type: 'trigger', name: 'provenance_no_delete' },
				{ type: 'index', name: 'nodes_kind_active' },
				{ type: 'index', name: 'nodes_invalidated_at' },
				{ type: 'index', name: 'edges_active_src' },
				{ type: 'index', name: 'edges_active_dst' },
				// Phase 16 Plan 16-01 DEEP-06 phase-A — cross-repo identity indexes.
				{ type: 'index', name: 'nodes_repo_id' },
				{ type: 'index', name: 'edges_repo_id' },
			]));
		} finally {
			close();
		}
	});

	it('is idempotent: calling openDatabase a second time runs no migrations', () => {
		// Capture the migrator-row count after the first open, then assert the second open
		// adds nothing. Phase 3+ may legitimately introduce more migrations; this test
		// guards the invariant ("re-open is a no-op for the migrator") not a fixed count.
		let before: number;
		{
			const { sqlite, close } = openDatabase(tmp.dbPath);
			try {
				before = (sqlite.prepare(`SELECT count(*) as n FROM __drizzle_migrations`).get() as { n: number }).n;
			} finally {
				close();
			}
		}
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const after = (sqlite.prepare(`SELECT count(*) as n FROM __drizzle_migrations`).get() as { n: number }).n;
			expect(after).toBe(before);
		} finally {
			close();
		}
	});
});
