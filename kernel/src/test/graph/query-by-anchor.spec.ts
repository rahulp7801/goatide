/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 3 (Plan 03-02) Task 1 RED — focused tests for the GraphDAO.queryByAnchor surface
// and the Anchor.ticket_id schema extension. Sibling specs in src/test/graph/anchor.spec.ts
// exercise the higher-level resolveAnchor dispatcher.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, NodePayloadSchema, type OpenDatabaseHandle } from '../../graph/index.js';

describe('Phase 3 Task 1 — Anchor.ticket_id + GraphDAO.queryByAnchor', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	const now = () => new Date().toISOString();

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
	});

	afterEach(() => {
		handle.close();
		tmp.dispose();
	});

	it('Anchor schema accepts optional ticket_id (Phase-3 extension)', () => {
		const parsed = NodePayloadSchema.parse({
			kind: 'ConstraintNode',
			body: 'ticket-anchored',
			anchor: { ticket_id: 'GOAT-42' },
		});
		const tid = (parsed.anchor as { ticket_id?: string } | undefined)?.ticket_id;
		expect(tid).toBe('GOAT-42');
	});

	it('Phase-2-seeded payloads (no ticket_id) still parse — backward-compatible', () => {
		const parsed = NodePayloadSchema.parse({
			kind: 'ConstraintNode',
			body: 'legacy node',
			anchor: { file: 'src/x.ts', symbol: 'foo' },
		});
		expect((parsed.anchor as { file?: string }).file).toBe('src/x.ts');
	});

	it('queryByAnchor returns matching node by file path; mismatched path returns []', () => {
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'auth rule', anchor: { file: 'src/auth.ts' } },
			provenance: { source: 'cli', actor: 'test' },
		});
		const matches = dao.queryByAnchor({ jsonPath: '$.anchor.file', value: 'src/auth.ts' }, now());
		const misses = dao.queryByAnchor({ jsonPath: '$.anchor.file', value: 'SRC/AUTH.TS' }, now());
		expect({ matchIds: matches.map((n) => n.id), miss: misses.length }).toEqual({
			matchIds: [id],
			miss: 0,
		});
	});

	it('queryByAnchor honors bitemporal filter — past asOf returns empty', () => {
		const beforeSeed = new Date(Date.now() - 60_000).toISOString();
		dao.seed({
			payload: { kind: 'ConstraintNode', body: 'rule', anchor: { ticket_id: 'GOAT-7' } },
			provenance: { source: 'cli', actor: 'test' },
		});
		const past = dao.queryByAnchor({ jsonPath: '$.anchor.ticket_id', value: 'GOAT-7' }, beforeSeed);
		const present = dao.queryByAnchor({ jsonPath: '$.anchor.ticket_id', value: 'GOAT-7' }, now());
		expect({ past: past.length, present: present.length }).toEqual({ past: 0, present: 1 });
	});
});
