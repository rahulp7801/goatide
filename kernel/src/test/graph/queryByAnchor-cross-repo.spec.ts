/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/queryByAnchor-cross-repo.spec.ts -- Phase 21 Plan 21-02 Open Decision §9.
//
// GREEN. Asserts that queryByAnchor(args, asOf, repoId=undefined) returns rows from ALL repos
// for that anchor (Path B: undefined-skips-filter). This is the cross-repo opt-in sentinel
// needed by the save-gate citation discovery path (buildReceipt) so cross-repo ConstraintNode
// citations surface for multi-root workspace saves.
//
// Two cases:
// (a) queryByAnchor(args, asOf, 'primary') returns only 'primary' rows.
// (b) queryByAnchor(args, asOf, undefined) returns rows from ALL repos (cross-repo).
//
// Grep alignment: 'queryByAnchor.*cross.repo' + 'queryByAnchor.*undefined' (21-VALIDATION.md).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';

describe('Phase 21 Open Decision §9 -- queryByAnchor cross-repo opt-in (Path B: undefined-skips-filter)', () => {
	let tmp: TempDb;

	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('queryByAnchor with repoId=undefined returns rows from ALL repos for that anchor', () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);

		// Seed a node in the 'primary' repo (default).
		dao.seed({
			payload: {
				kind: 'ConstraintNode',
				body: 'Primary repo constraint',
				anchor: { file: 'src/auth.ts' },
			},
			provenance: { source: 'cli', actor: 'cross-repo-test' },
		});

		// Seed a node in a different repo by directly inserting with repo_id.
		// Use the raw sqlite handle to bypass DAO (which always writes repo_id='primary').
		const sqlite = (handle.db as unknown as { $client: import('better-sqlite3').Database }).$client;
		const alterRepo = sqlite.prepare(`
			UPDATE nodes SET repo_id = 'abcdef012345' WHERE json_extract(payload, '$.anchor.file') = 'src/auth.ts'
			AND repo_id = 'primary'
		`);
		alterRepo.run();

		// Seed a second node explicitly in 'primary' repo to verify filtering.
		dao.seed({
			payload: {
				kind: 'ConstraintNode',
				body: 'Another primary repo constraint',
				anchor: { file: 'src/auth.ts' },
			},
			provenance: { source: 'cli', actor: 'cross-repo-test-2' },
		});

		// Capture asOf AFTER seeding so valid_from <= asOf holds for all seeded rows.
		const now = new Date().toISOString();

		// (a) queryByAnchor with repoId='primary' returns only primary-repo rows.
		const primaryRows = dao.queryByAnchor({ jsonPath: '$.anchor.file', value: 'src/auth.ts' }, now, 'primary');
		expect(primaryRows).toHaveLength(1);
		expect(primaryRows[0].payload).toMatchObject({ body: 'Another primary repo constraint' });

		// (b) queryByAnchor with repoId=undefined returns rows from ALL repos (cross-repo opt-in).
		const allRows = dao.queryByAnchor({ jsonPath: '$.anchor.file', value: 'src/auth.ts' }, now, undefined);
		expect(allRows).toHaveLength(2);

		handle.close();
	});

	it('queryByAnchor with explicit repoId filters to that repo only (back-compat)', () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);

		// Seed a node in 'primary'.
		dao.seed({
			payload: {
				kind: 'ConstraintNode',
				body: 'Primary repo constraint',
				anchor: { file: 'src/security.ts' },
			},
			provenance: { source: 'cli', actor: 'cross-repo-test' },
		});

		// Seed in different repo via raw SQL.
		const sqlite = (handle.db as unknown as { $client: import('better-sqlite3').Database }).$client;
		const insertOther = sqlite.prepare(`
			UPDATE nodes SET repo_id = 'fedcba987654' WHERE json_extract(payload, '$.anchor.file') = 'src/security.ts'
		`);
		insertOther.run();

		// Capture asOf AFTER seeding so valid_from <= asOf holds for all seeded rows.
		const now = new Date().toISOString();

		// Query for 'primary' -- should return empty (the node was moved to 'fedcba987654').
		const primaryRows = dao.queryByAnchor({ jsonPath: '$.anchor.file', value: 'src/security.ts' }, now, 'primary');
		expect(primaryRows).toHaveLength(0);

		// Query for the actual repo -- should return the node.
		const otherRows = dao.queryByAnchor({ jsonPath: '$.anchor.file', value: 'src/security.ts' }, now, 'fedcba987654');
		expect(otherRows).toHaveLength(1);

		handle.close();
	});
});
