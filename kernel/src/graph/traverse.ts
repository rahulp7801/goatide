/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/traverse.ts — Phase 3 (Plan 03-02) recursive-CTE traversal.
//
// Per 03-RESEARCH.md ## Pattern: Single Recursive CTE with Scope Filter.
//
// One prepared SQL statement, parameterized by anchor IDs + scope kinds + max_hops + at.
// Bitemporal at-filter on EVERY join (anchor seed AND recursive step AND final SELECT) —
// per Pitfall 5, post-filtering walks through invalid edges and returns ghost-nodes.
// Visited-set guard via INSTR on a delimited string — per Pitfall 2, UNION + INSTR is
// belt-and-suspenders for cycle safety.
//
// Scope semantics:
//   parents    -> walk parent_of edges
//   siblings   -> walk parent_of edges (bidirectional walk handles up-then-down naturally;
//                 callers cap depth at 2 to enforce sibling distance)
//   references -> walk references + derived_from
//   all        -> walk parent_of + references + derived_from (NOT supersedes; supersession
//                 chains are for the renderer's "superseded by ->" badge, not retrieval)

import type Database from 'better-sqlite3';
import type { NodePayload } from './payloads.js';
import type { NodeKind, Confidence } from './schema/nodes.js';
import type { EdgeKind } from './schema/edges.js';

export type Scope = 'parents' | 'siblings' | 'references' | 'all';

const SCOPE_KINDS: Record<Scope, ReadonlyArray<EdgeKind>> = {
	parents: ['parent_of'],
	siblings: ['parent_of'],
	references: ['references', 'derived_from'],
	all: ['parent_of', 'references', 'derived_from'],
};

export interface TraverseInput {
	anchorIds: ReadonlyArray<string>;
	scope: Scope;
	max_hops: number;       // default 4 (TRAV-02)
	at: string;             // ISO-8601 (TRAV-03)
}

export interface TraverseRow {
	node_id: string;
	level: number;
	edge_path: string;
	kind: NodeKind;
	payload: NodePayload;
	confidence: Confidence;
	valid_from: string;
	invalidated_at: string | null;
	recorded_at: string;
	superseded_by: string | null;
}

export interface TraverseResult {
	nodes: TraverseRow[];
	paths: string[];        // edge_path strings, parallel to nodes by index
}

/**
 * Walk the graph from `anchorIds` using a single SQLite recursive CTE.
 *
 * @returns nodes + edge_paths sorted by level ASC, node_id ASC. The anchor seed is
 *          included at level 0. The result is deduplicated by node_id (UNION + visited
 *          set in CTE).
 */
export function traverse(sqlite: Database.Database, input: TraverseInput): TraverseResult {
	if (input.anchorIds.length === 0) {
		// TRAV-06: empty anchor -> empty result. No fallback.
		return { nodes: [], paths: [] };
	}
	const seedPlaceholders = input.anchorIds.map(() => '?').join(',');
	const kinds = SCOPE_KINDS[input.scope];
	const kindPlaceholders = kinds.map(() => '?').join(',');

	// The CTE walk may visit the same node_id at different levels via distinct paths
	// (e.g., a cycle ring traversed clockwise vs counter-clockwise). UNION dedups whole
	// rows, but rows differ in (level, edge_path) — so duplicates by node_id are still
	// possible. The outer SELECT collapses to one row per node_id by picking the
	// minimum level (shortest path) and a representative edge_path at that level.
	// "no duplicates by node_id" is a Plan-03-02 must-have for TRAV-02.
	const stmt = sqlite.prepare(`
		WITH RECURSIVE walk(node_id, level, edge_path, visited) AS (
			SELECT n.id, 0, '', '|' || n.id || '|'
			FROM nodes n
			WHERE n.id IN (${seedPlaceholders})
			  AND n.valid_from <= @at
			  AND (n.invalidated_at IS NULL OR n.invalidated_at > @at)
			  AND n.recorded_at <= @at
			UNION
			SELECT
				CASE WHEN e.src_id = w.node_id THEN e.dst_id ELSE e.src_id END,
				w.level + 1,
				w.edge_path || '/' || e.kind || ':' || e.id,
				w.visited || (CASE WHEN e.src_id = w.node_id THEN e.dst_id ELSE e.src_id END) || '|'
			FROM walk w
			JOIN edges e
				ON (e.src_id = w.node_id OR e.dst_id = w.node_id)
			   AND e.kind IN (${kindPlaceholders})
			   AND e.valid_from <= @at
			   AND (e.invalidated_at IS NULL OR e.invalidated_at > @at)
			   AND e.recorded_at <= @at
			   AND w.level < @max_hops
			   AND INSTR(w.visited, '|' || (CASE WHEN e.src_id = w.node_id THEN e.dst_id ELSE e.src_id END) || '|') = 0
		),
		walk_dedup AS (
			-- Collapse multi-path duplicates: pick the (min level, then lex-min edge_path)
			-- per node_id. SQLite's MIN(level), MIN(edge_path) over GROUP BY node_id is
			-- deterministic on text/integer columns.
			SELECT node_id, MIN(level) AS level, MIN(edge_path) AS edge_path
			FROM walk
			GROUP BY node_id
		)
		SELECT walk_dedup.node_id, walk_dedup.level, walk_dedup.edge_path,
		       n.kind, n.payload, n.confidence, n.valid_from, n.invalidated_at, n.recorded_at, n.superseded_by
		FROM walk_dedup
		JOIN nodes n ON n.id = walk_dedup.node_id
		WHERE n.valid_from <= @at
		  AND (n.invalidated_at IS NULL OR n.invalidated_at > @at)
		  AND n.recorded_at <= @at
		ORDER BY walk_dedup.level ASC, walk_dedup.node_id ASC
	`);

	// better-sqlite3: positional ? args first (anchor IDs + edge kinds), then named @-args object.
	const positional: string[] = [...input.anchorIds, ...kinds];
	const named = { at: input.at, max_hops: input.max_hops };

	const rows = stmt.all(...positional, named) as Array<{
		node_id: string;
		level: number;
		edge_path: string;
		kind: string;
		payload: string;
		confidence: string;
		valid_from: string;
		invalidated_at: string | null;
		recorded_at: string;
		superseded_by: string | null;
	}>;

	const nodes: TraverseRow[] = rows.map((r) => ({
		node_id: r.node_id,
		level: r.level,
		edge_path: r.edge_path,
		kind: r.kind as NodeKind,
		payload: JSON.parse(r.payload) as NodePayload,
		confidence: r.confidence as Confidence,
		valid_from: r.valid_from,
		invalidated_at: r.invalidated_at,
		recorded_at: r.recorded_at,
		superseded_by: r.superseded_by,
	}));

	return {
		nodes,
		paths: nodes.map((n) => n.edge_path),
	};
}
