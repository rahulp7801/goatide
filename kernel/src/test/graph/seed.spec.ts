/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/seed.spec.ts — Plan 02-03 Task 3.
//
// Integration coverage of GraphDAO.seed (GRAPH-01, GRAPH-02, GRAPH-05):
//   - atomic insert of node + provenance with all four bitemporal columns populated
//     and confidence='Explicit' (Phase 2 only writes Explicit per RESEARCH user_constraints)
//   - Zod boundary refusal for INVALID_KIND fixture (no DB write)
//   - Zod boundary refusal for every GHOSTING_VIOLATIONS fixture (no DB write)
//
// All three sub-tests use one snapshot-style toEqual to keep them under the
// CLAUDE.md ## Learnings rule (minimize assertions).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type SeedInput } from '../../graph/index.js';
import { VALID_PAYLOADS, GHOSTING_VIOLATIONS, INVALID_KIND, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('GraphDAO.seed (GRAPH-01, GRAPH-02, GRAPH-05)', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('inserts node + provenance atomically with all four bitemporal columns and Explicit confidence', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id } = dao.seed({
				payload: VALID_PAYLOADS.ConstraintNode,
				provenance: { ...VALID_PROVENANCE },
			});
			const node = dao.queryById(id);
			const provRow = sqlite.prepare(`SELECT * FROM provenance WHERE node_id = ?`).get(id) as
				| { node_id: string; source: string; actor: string }
				| undefined;

			expect({
				nodeExists:             !!node,
				kind:                   node?.kind,
				confidence:             node?.confidence,
				hasValidFrom:           !!node?.valid_from,
				hasRecordedAt:          !!node?.recorded_at,
				invalidatedAtIsNull:    node?.invalidated_at === null,
				supersededByIsNull:     node?.superseded_by === null,
				provExists:             !!provRow,
				provSource:             provRow?.source,
				idIsUlid:               typeof id === 'string' && id.length === 26,
			}).toEqual({
				nodeExists:             true,
				kind:                   'ConstraintNode',
				confidence:             'Explicit',
				hasValidFrom:           true,
				hasRecordedAt:          true,
				invalidatedAtIsNull:    true,
				supersededByIsNull:     true,
				provExists:             true,
				provSource:             'cli',
				idIsUlid:               true,
			});
		} finally { close(); }
	});

	it('rejects an invalid kind at the Zod boundary (no DB write)', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			let caught: unknown;
			try {
				dao.seed({
					payload: INVALID_KIND as unknown as SeedInput['payload'],
					provenance: VALID_PROVENANCE,
				});
			} catch (e) {
				caught = e;
			}
			const count = sqlite.prepare(`SELECT count(*) as n FROM nodes`).get() as { n: number };
			expect({
				caughtZodError: !!caught && (caught as Error).name.includes('Zod'),
				dbStillEmpty: count.n === 0,
			}).toEqual({
				caughtZodError: true,
				dbStillEmpty: true,
			});
		} finally { close(); }
	});

	it('rejects all ghosting fixtures at the Zod boundary (no DB write for any)', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const failures: boolean[] = [];
			for (const [, payload] of Object.entries(GHOSTING_VIOLATIONS)) {
				try {
					dao.seed({
						payload: payload as unknown as SeedInput['payload'],
						provenance: VALID_PROVENANCE,
					});
					failures.push(false);
				} catch {
					failures.push(true);
				}
			}
			const count = sqlite.prepare(`SELECT count(*) as n FROM nodes`).get() as { n: number };
			expect({
				allFailed: failures.every(Boolean),
				dbStillEmpty: count.n === 0,
			}).toEqual({
				allFailed: true,
				dbStillEmpty: true,
			});
		} finally { close(); }
	});
});
