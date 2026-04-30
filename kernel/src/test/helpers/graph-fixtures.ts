/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/helpers/graph-fixtures.ts — Phase 3 (Plan 03-01) shared fixtures.
//
// Plan 03-02 (traverse + anchor specs) and Plan 03-03 (receipt builder + render specs) all
// need the same shapes: a parent → child edge graph, a cyclic graph for depth-cap proof, a
// supersession chain for snapshot-stability proof, and anchor-bearing nodes (file/symbol/
// ticket_id payloads) for the deterministic resolver.
//
// All fixtures take a (dao, sqlite) pair: dao for canonical seed/supersede, sqlite for raw
// edge inserts (the Phase-2 DAO does NOT expose generic edge writers — only the supersedes
// edge auto-emitted by supersede(); parent_of / references / derived_from edges are inserted
// via raw SQL since Phase 3 is the first consumer that needs them).
//
// Plan 03-02: ticket_id is now in the Anchor Zod schema (payloads.ts) — seedAnchoredNodes
// passes it through without any cast.

import { ulid } from 'ulid';
import type Database from 'better-sqlite3';
import type { GraphDAO } from '../../graph/dao.js';
import type { EdgeKind } from '../../graph/schema/edges.js';

/** Parent → child via parent_of edge. Both nodes are ConstraintNodes with optional anchors. */
export function seedSimpleParentChild(
	dao: GraphDAO,
	sqlite: Database.Database,
	opts: { parentBody?: string; childBody?: string; anchorFile?: string } = {},
): { parentId: string; childId: string; edgeId: string; anchorIds: string[] } {
	const { id: parentId } = dao.seed({
		payload: {
			kind: 'ConstraintNode',
			body: opts.parentBody ?? 'parent constraint',
			anchor: opts.anchorFile ? { file: opts.anchorFile } : undefined,
		},
		provenance: { source: 'cli', actor: 'test-fixture' },
	});
	const { id: childId } = dao.seed({
		payload: {
			kind: 'ConstraintNode',
			body: opts.childBody ?? 'child constraint',
			anchor: opts.anchorFile ? { file: opts.anchorFile } : undefined,
		},
		provenance: { source: 'cli', actor: 'test-fixture' },
	});
	const edgeId = insertEdge(sqlite, 'parent_of', parentId, childId);
	return { parentId, childId, edgeId, anchorIds: [parentId] };
}

/**
 * Build a cyclic edge graph of `depth` nodes with parent_of edges forming a ring:
 *   N1 → N2 → N3 → ... → N{depth} → N1
 * Used to verify TRAV-02 (cycle terminates, no duplicates, depth cap respected).
 */
export function seedCyclicGraph(
	dao: GraphDAO,
	sqlite: Database.Database,
	depth: number,
): { ids: string[]; edgeIds: string[] } {
	if (depth < 2) {
		throw new Error('seedCyclicGraph requires depth >= 2');
	}
	const ids: string[] = [];
	for (let i = 0; i < depth; i++) {
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: `node ${i}` },
			provenance: { source: 'cli', actor: 'test-fixture' },
		});
		ids.push(id);
	}
	const edgeIds: string[] = [];
	for (let i = 0; i < depth; i++) {
		const next = (i + 1) % depth;
		edgeIds.push(insertEdge(sqlite, 'parent_of', ids[i], ids[next]));
	}
	return { ids, edgeIds };
}

/**
 * Seed a chain of `depth` supersession steps: oldest → ... → newest.
 * Each call to `dao.supersede` creates a new node row + a `supersedes` edge.
 * Returned `chainIds` is ordered oldest-first.
 */
export function seedSupersessionChain(
	dao: GraphDAO,
	depth: number,
): { chainIds: string[] } {
	if (depth < 2) {
		throw new Error('seedSupersessionChain requires depth >= 2');
	}
	const { id: firstId } = dao.seed({
		payload: { kind: 'ConstraintNode', body: 'v1' },
		provenance: { source: 'cli', actor: 'test-fixture' },
	});
	const chainIds = [firstId];
	let currentId = firstId;
	for (let i = 2; i <= depth; i++) {
		const { newId } = dao.supersede(currentId, { kind: 'ConstraintNode', body: `v${i}` });
		chainIds.push(newId);
		currentId = newId;
	}
	return { chainIds };
}

/**
 * Seed nodes whose payloads carry a deterministic anchor (file / symbol / ticket_id).
 * Used by anchor.spec.ts (TRAV-04, TRAV-06). Plan 03-02 added ticket_id to the Anchor
 * Zod schema; this fixture passes it through unchanged.
 */
export function seedAnchoredNodes(
	dao: GraphDAO,
	_sqlite: Database.Database,
	anchors: Array<{ file?: string; symbol?: string; ticket_id?: string }>,
): { nodeIds: string[] } {
	const nodeIds: string[] = [];
	for (let i = 0; i < anchors.length; i++) {
		const a = anchors[i];
		const { id } = dao.seed({
			payload: {
				kind: 'ConstraintNode',
				body: `anchored node ${i}`,
				// Plan 03-02 extended payloads.ts Anchor with optional ticket_id — no cast needed.
				anchor: { file: a.file, symbol: a.symbol, ticket_id: a.ticket_id },
			},
			provenance: { source: 'cli', actor: 'test-fixture' },
		});
		nodeIds.push(id);
	}
	return { nodeIds };
}

// -------- internal: raw edge insert (Phase 2 DAO has no parent_of/references writer) --------

function insertEdge(
	sqlite: Database.Database,
	kind: EdgeKind,
	srcId: string,
	dstId: string,
): string {
	const edgeId = ulid();
	const ts = new Date().toISOString();
	sqlite.prepare(`
		INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`).run(edgeId, kind, srcId, dstId, ts, ts);
	return edgeId;
}
