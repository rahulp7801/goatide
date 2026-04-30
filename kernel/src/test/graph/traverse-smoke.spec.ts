/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 3 (Plan 03-02) Task 2 RED — minimal existence + behavior smoke for traverse() and
// resolveAnchor(). The full TRAV-01..06 assertion matrix lives in traverse.spec.ts and
// anchor.spec.ts (filled in Task 3). This file just proves the public surface exists and
// behaves on the smallest possible graphs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedSimpleParentChild, seedAnchoredNodes } from '../helpers/graph-fixtures.js';
import { openDatabase, GraphDAO, traverse, resolveAnchor, type OpenDatabaseHandle } from '../../graph/index.js';

describe('Phase 3 Task 2 — traverse() + resolveAnchor() smoke', () => {
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

	it('traverse returns the anchor seed at level 0 with empty graph', () => {
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'lone node' },
			provenance: { source: 'cli', actor: 'test' },
		});
		const r = traverse(handle.sqlite, { anchorIds: [id], scope: 'all', max_hops: 4, at: now() });
		expect({
			ids: r.nodes.map((n) => n.node_id),
			levels: r.nodes.map((n) => n.level),
			pathCount: r.paths.length,
		}).toEqual({ ids: [id], levels: [0], pathCount: 1 });
	});

	it('traverse with scope=all walks parent→child once', () => {
		const { parentId, childId } = seedSimpleParentChild(dao, handle.sqlite);
		const r = traverse(handle.sqlite, {
			anchorIds: [parentId],
			scope: 'all',
			max_hops: 4,
			at: now(),
		});
		expect(r.nodes.map((n) => n.node_id).sort()).toEqual([parentId, childId].sort());
	});

	it('resolveAnchor by file path returns matching node; mismatched returns []', () => {
		const { nodeIds } = seedAnchoredNodes(dao, handle.sqlite, [{ file: 'src/x.ts' }]);
		const hit = resolveAnchor(dao, { kind: 'file', path: 'src/x.ts' }, now());
		const miss = resolveAnchor(dao, { kind: 'file', path: 'src/y.ts' }, now());
		expect({ hitIds: hit.map((n) => n.id), missLength: miss.length }).toEqual({
			hitIds: [nodeIds[0]],
			missLength: 0,
		});
	});

	it('resolveAnchor by node_id direct lookup', () => {
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'direct id lookup' },
			provenance: { source: 'cli', actor: 'test' },
		});
		const found = resolveAnchor(dao, { kind: 'node_id', id }, now());
		const notFound = resolveAnchor(dao, { kind: 'node_id', id: '00000000000000000000000000' }, now());
		expect({ foundIds: found.map((n) => n.id), notFoundLength: notFound.length }).toEqual({
			foundIds: [id],
			notFoundLength: 0,
		});
	});
});
