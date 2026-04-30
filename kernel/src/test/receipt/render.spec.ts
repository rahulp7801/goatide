/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plan 03-03 Task 3: REC-06 — explainCitation drills back to the provenance row for a
// given citation, returning source/actor/recorded_at/detail. The dao.seed test fixture
// does NOT auto-inject a CLI invocation field (that's CLI-side in seed.ts); detail
// matches the literal map passed to dao.seed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { explainCitation, type Citation } from '../../receipt/index.js';

describe('REC-06 — Why was this done? (provenance drill-down)', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
	});

	afterEach(() => {
		handle.close();
		tmp.dispose();
	});

	it('explainCitation returns provenance row matching what was seeded', () => {
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'rule body' },
			provenance: { source: 'cli', actor: 'rahul', detail: { ticket: 'GOAT-1' } },
		});
		const stub: Citation = {
			node_id: id,
			version: id,
			confidence: 'Explicit',
			edge_path: '',
			snippet: 'rule body',
		};
		const trail = explainCitation(stub, dao);
		expect({
			source: trail?.source,
			actor: trail?.actor,
			detail: trail?.detail,
			node_id: trail?.node_id,
			recordedAtPresent: !!trail?.recorded_at,
		}).toEqual({
			source: 'cli',
			actor: 'rahul',
			detail: { ticket: 'GOAT-1' },
			node_id: id,
			recordedAtPresent: true,
		});
	});

	it('explainCitation returns null for a node with no provenance row (defensive)', () => {
		// Defensive case: a citation whose node_id is fabricated (no row in nodes or provenance).
		const stub: Citation = {
			node_id: '00000000000000000000000000',
			version: '00000000000000000000000000',
			confidence: 'Explicit',
			edge_path: '',
			snippet: 'x',
		};
		const trail = explainCitation(stub, dao);
		expect(trail).toBeNull();
	});
});
