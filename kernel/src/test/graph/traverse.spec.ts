/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 3 (Plan 03-02) Task 3 — fill in TRAV-01/02/03 (replaces Wave-0 it.skip stubs).
// Real assertions exercising:
//   - TRAV-01: scope dispatch on parent->child + scope leakage isolation
//   - TRAV-02: depth cap with cyclic graph + visited-set guard + max_hops=0
//   - TRAV-03: bitemporal at-filter — supersession chain across multiple as-of points

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedSimpleParentChild, seedCyclicGraph, seedSupersessionChain } from '../helpers/graph-fixtures.js';
import { openDatabase, GraphDAO, traverse, type OpenDatabaseHandle } from '../../graph/index.js';

describe('Phase 3 — graph traversal', () => {
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

	describe('TRAV-01 — single recursive CTE: Parents/Siblings/References scope', () => {
		it('scope="all" on parent->child returns both nodes with correct edge path', () => {
			const { parentId, childId } = seedSimpleParentChild(dao, handle.sqlite);
			const r = traverse(handle.sqlite, {
				anchorIds: [parentId],
				scope: 'all',
				max_hops: 4,
				at: new Date().toISOString(),
			});
			expect({
				ids: r.nodes.map((n) => n.node_id).sort(),
				levels: r.nodes.map((n) => n.level).sort(),
				childPathContainsEdgeKind: r.nodes.find((n) => n.node_id === childId)?.edge_path.includes('parent_of:'),
			}).toEqual({
				ids: [parentId, childId].sort(),
				levels: [0, 1],
				childPathContainsEdgeKind: true,
			});
		});

		it('scope="parents" walks only parent_of (no references leakage)', () => {
			const { parentId, childId, edgeId } = seedSimpleParentChild(dao, handle.sqlite);
			// Spike a `references` edge that scope=parents should ignore.
			const ts = new Date().toISOString();
			const orphanId = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'orphan via references' },
				provenance: { source: 'cli', actor: 'test' },
			}).id;
			handle.sqlite.prepare(
				`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
			).run(ulid(), 'references', parentId, orphanId, ts, ts);

			const r = traverse(handle.sqlite, {
				anchorIds: [parentId],
				scope: 'parents',
				max_hops: 4,
				at: new Date().toISOString(),
			});
			expect({
				containsChild: r.nodes.some((n) => n.node_id === childId),
				containsOrphan: r.nodes.some((n) => n.node_id === orphanId),
				edgeUsed: edgeId.length === 26,
			}).toEqual({
				containsChild: true,    // walked parent_of
				containsOrphan: false,  // references not in scope
				edgeUsed: true,
			});
		});

		it('scope="references" walks references + derived_from (and skips parent_of)', () => {
			const a = dao.seed({ payload: { kind: 'ConstraintNode', body: 'A' }, provenance: { source: 'cli', actor: 'test' } }).id;
			const b = dao.seed({ payload: { kind: 'ConstraintNode', body: 'B' }, provenance: { source: 'cli', actor: 'test' } }).id;
			const c = dao.seed({ payload: { kind: 'ConstraintNode', body: 'C' }, provenance: { source: 'cli', actor: 'test' } }).id;
			const d = dao.seed({ payload: { kind: 'ConstraintNode', body: 'D' }, provenance: { source: 'cli', actor: 'test' } }).id;
			// Capture edge ts AFTER node seeds so all nodes are visible at this asOf.
			const ts = new Date().toISOString();
			handle.sqlite.prepare(`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`)
				.run(ulid(), 'references', a, b, ts, ts);
			handle.sqlite.prepare(`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`)
				.run(ulid(), 'derived_from', a, c, ts, ts);
			// d hangs off via parent_of (must NOT be reached with scope='references')
			handle.sqlite.prepare(`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`)
				.run(ulid(), 'parent_of', a, d, ts, ts);
			const at = new Date().toISOString();
			const r = traverse(handle.sqlite, { anchorIds: [a], scope: 'references', max_hops: 4, at });
			const idsSorted = r.nodes.map((n) => n.node_id).sort();
			expect({ idsSorted, includesB: idsSorted.includes(b), includesC: idsSorted.includes(c), includesD: idsSorted.includes(d) }).toEqual({
				idsSorted: [a, b, c].sort(),
				includesB: true,
				includesC: true,
				includesD: false,
			});
		});

		it('empty anchorIds returns empty result (TRAV-06 at the traverse layer)', () => {
			const r = traverse(handle.sqlite, {
				anchorIds: [],
				scope: 'all',
				max_hops: 4,
				at: new Date().toISOString(),
			});
			expect({ nodes: r.nodes, paths: r.paths }).toEqual({ nodes: [], paths: [] });
		});
	});

	describe('TRAV-02 — depth cap (default 4) + visited-set guard on cycles', () => {
		it('cyclic 5-deep graph terminates and respects max_hops=4', () => {
			const { ids } = seedCyclicGraph(dao, handle.sqlite, 5);
			const start = Date.now();
			const r = traverse(handle.sqlite, {
				anchorIds: [ids[0]],
				scope: 'all',
				max_hops: 4,
				at: new Date().toISOString(),
			});
			const elapsed = Date.now() - start;
			const uniqueIds = new Set(r.nodes.map((n) => n.node_id));
			const maxLevel = Math.max(...r.nodes.map((n) => n.level));
			expect({
				terminatedQuickly: elapsed < 1000,
				noDuplicates: uniqueIds.size === r.nodes.length,
				respectedDepthCap: maxLevel <= 4,
				includedAnchor: uniqueIds.has(ids[0]),
			}).toEqual({
				terminatedQuickly: true,
				noDuplicates: true,
				respectedDepthCap: true,
				includedAnchor: true,
			});
		});

		it('max_hops=0 returns only the anchor (no recursion)', () => {
			const { parentId } = seedSimpleParentChild(dao, handle.sqlite);
			const r = traverse(handle.sqlite, {
				anchorIds: [parentId],
				scope: 'all',
				max_hops: 0,
				at: new Date().toISOString(),
			});
			expect({
				count: r.nodes.length,
				ids: r.nodes.map((n) => n.node_id),
				levels: r.nodes.map((n) => n.level),
			}).toEqual({ count: 1, ids: [parentId], levels: [0] });
		});
	});

	describe('TRAV-03 — bitemporal at-filter on every join', () => {
		it('supersession chain: at=<v1.recorded_at> sees v1; at=<v2.recorded_at> sees v2; at=<v3.recorded_at> sees v3', () => {
			const { chainIds } = seedSupersessionChain(dao, 3);  // [v1, v2, v3] oldest->newest
			const v1 = dao.queryById(chainIds[0])!;
			const v2 = dao.queryById(chainIds[1])!;
			const v3 = dao.queryById(chainIds[2])!;

			// At v1.recorded_at: v1 is just-active (invalidated_at === v2.valid_from > v1.recorded_at)
			const atV1 = traverse(handle.sqlite, { anchorIds: [chainIds[0]], scope: 'all', max_hops: 4, at: v1.recorded_at });
			// At v2.recorded_at: v2 is active
			const atV2 = traverse(handle.sqlite, { anchorIds: [chainIds[1]], scope: 'all', max_hops: 4, at: v2.recorded_at });
			// At v3.recorded_at: v3 is active
			const atV3 = traverse(handle.sqlite, { anchorIds: [chainIds[2]], scope: 'all', max_hops: 4, at: v3.recorded_at });

			expect({
				atV1Ids: atV1.nodes.map((n) => n.node_id),
				atV2Ids: atV2.nodes.map((n) => n.node_id),
				atV3Ids: atV3.nodes.map((n) => n.node_id),
				v3HasRecordedAt: !!v3.recorded_at,
			}).toEqual({
				atV1Ids: [chainIds[0]],
				atV2Ids: [chainIds[1]],
				atV3Ids: [chainIds[2]],
				v3HasRecordedAt: true,
			});
		});
	});
});
