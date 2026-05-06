/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/traverse.ts — Phase 3 (Plan 03-02) recursive traversal,
// rewritten Phase 4 (Plan 04-08) for the W12 latency gap (.planning/phases/
// 04-verification-canvas-per-save-tiered/04-VERIFICATION.md ## W12 Latency Gap).
//
// Per 03-RESEARCH.md ## Pattern: Single Recursive CTE with Scope Filter (original),
// then 04-RESEARCH.md ## Risk 2 (the rewrite below).
//
// ============================================================================================
// PHASE-4 GAP-CLOSURE (Plan 04-08, 2026-05-06): walk-dedup pushdown
// ============================================================================================
// The Plan 03-02 implementation used a single SQLite recursive CTE with `UNION` (whole-row
// dedup) + INSTR-based visited-set guard. At depth=4 with branching factor 5 the `walk` CTE
// materialised ~5^4 = 625 path-rows per anchor seed BEFORE the outer `walk_dedup` collapsed
// duplicates by node_id. resolveAnchor returns ~10 candidates per file path in the high-fanout
// fixture, giving ~6250 walk rows per traverse() call. SQLite's recursive-CTE row materialisation
// scales linearly with `walk` size, not `walk_dedup` size — measured p99 was 12 168 ms at 1K
// nodes (24x over 500ms target) and 115 348 ms at 10K nodes (230x over).
//
// The "obvious" fix — push the per-(node_id, level) MIN-pre-aggregation into the recursive step
// via a NOT-EXISTS self-reference correlating against the recursive `walk` CTE — is impossible:
// SQLite explicitly forbids referencing a recursive CTE more than once inside its own recursive
// step (verified empirically: "multiple recursive references: w"). The "documented fallback"
// of keeping `UNION` + visited-set doesn't actually move the needle on cold-path perf.
//
// CHOSEN STRATEGY (Plan 04-08): iterative BFS in JavaScript, one SQL query per level.
//   - Maintain a visited Set<node_id> in JS — true O(reachable_nodes) walk row count.
//   - Each level's SQL prepares a parameterised IN clause via `json_each` against the frontier
//     (avoids re-prepare per level despite the variable frontier size).
//   - Bitemporal at-filter applied on every per-level query (Pitfall 5 preserved).
//   - Final result deterministically sorted by (level ASC, node_id ASC) — same as before.
//   - Cycle safety: visited Set guard replaces the INSTR-on-delimited-string guard 1:1.
//   - The 0004 partial indexes (idx_edges_active_src + idx_edges_active_dst + idx_nodes_active_kind)
//     cover the per-level edge query when invalidated_at IS NULL.
// ============================================================================================
//
// Scope semantics (unchanged from Phase 3):
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
 * Walk the graph from `anchorIds` using iterative BFS — one SQL query per level — to
 * keep walk-row materialisation at O(reachable_nodes) instead of O(branching_factor^depth).
 *
 * @returns nodes + edge_paths sorted by level ASC, node_id ASC. The anchor seed is included
 *          at level 0. The result is deduplicated by node_id (visited Set guard); every
 *          node appears at its minimum reachable level with the lexically-minimum edge_path
 *          discovered at that level.
 *
 * Cycle safety: the JS-level `visited` Set replaces the SQL-level INSTR-on-delimited-string
 *               guard from the Phase-3 implementation. A node already in `visited` is never
 *               revisited regardless of the path taken to reach it.
 *
 * Determinism: per-level results are deterministically ordered before insertion into the
 *              accumulator (ORDER BY node_id ASC, edge_path ASC). The first edge_path seen
 *              for a node is the one retained — equivalent to the old query's
 *              MIN(edge_path) GROUP BY node_id semantics.
 */
export function traverse(sqlite: Database.Database, input: TraverseInput): TraverseResult {
	if (input.anchorIds.length === 0) {
		// TRAV-06: empty anchor -> empty result. No fallback.
		return { nodes: [], paths: [] };
	}
	const kinds = SCOPE_KINDS[input.scope];

	// 1) Seed query — bitemporal-filtered fetch of the anchor rows at level 0.
	// Mirrors the original CTE base-case exactly (n.valid_from <= @at, invalidated_at gate,
	// recorded_at gate). Different from the original: edge_path = '' and we only fetch the
	// anchor's own attributes here; per-level queries below carry forward the edge_path.
	const seedPlaceholders = input.anchorIds.map(() => '?').join(',');
	const seedStmt = sqlite.prepare(`
		SELECT n.id AS node_id,
		       n.kind, n.payload, n.confidence,
		       n.valid_from, n.invalidated_at, n.recorded_at, n.superseded_by
		FROM nodes n
		WHERE n.id IN (${seedPlaceholders})
		  AND n.valid_from <= @at
		  AND (n.invalidated_at IS NULL OR n.invalidated_at > @at)
		  AND n.recorded_at <= @at
	`);

	const seedRows = seedStmt.all(...input.anchorIds, { at: input.at }) as Array<{
		node_id: string;
		kind: string;
		payload: string;
		confidence: string;
		valid_from: string;
		invalidated_at: string | null;
		recorded_at: string;
		superseded_by: string | null;
	}>;

	// Accumulator: one entry per unique node_id, holding the shallowest reachable level
	// and the lexically-minimum edge_path at that level. Final ordering is applied at the end.
	interface AccumEntry {
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
	}
	const accum = new Map<string, AccumEntry>();
	const visited = new Set<string>();
	for (const r of seedRows) {
		accum.set(r.node_id, { ...r, level: 0, edge_path: '' });
		visited.add(r.node_id);
	}

	if (input.max_hops <= 0 || kinds.length === 0) {
		return finalize(accum);
	}

	// 2) Per-level expansion query — prepared once, reused for each BFS level.
	// `json_each(@frontier_json)` materialises the variable-size frontier without re-preparing
	// the statement (avoids the per-level prepare overhead). The frontier carries (node_id,
	// edge_path) pairs because we need each node's accumulated edge_path to extend in the
	// recursive step.
	const kindPlaceholders = kinds.map(() => '?').join(',');
	const stepStmt = sqlite.prepare(`
		SELECT
			f.node_id           AS prev_id,
			f.edge_path         AS prev_path,
			CASE WHEN e.src_id = f.node_id THEN e.dst_id ELSE e.src_id END AS next_id,
			e.kind              AS edge_kind,
			e.id                AS edge_id,
			n.kind              AS node_kind,
			n.payload           AS payload,
			n.confidence        AS confidence,
			n.valid_from        AS valid_from,
			n.invalidated_at    AS invalidated_at,
			n.recorded_at       AS recorded_at,
			n.superseded_by     AS superseded_by
		FROM (
			SELECT
				json_extract(value, '$.id')   AS node_id,
				json_extract(value, '$.path') AS edge_path
			FROM json_each(@frontier_json)
		) f
		JOIN edges e
			ON (e.src_id = f.node_id OR e.dst_id = f.node_id)
		   AND e.kind IN (${kindPlaceholders})
		   AND e.valid_from <= @at
		   AND (e.invalidated_at IS NULL OR e.invalidated_at > @at)
		   AND e.recorded_at <= @at
		JOIN nodes n
			ON n.id = (CASE WHEN e.src_id = f.node_id THEN e.dst_id ELSE e.src_id END)
		   AND n.valid_from <= @at
		   AND (n.invalidated_at IS NULL OR n.invalidated_at > @at)
		   AND n.recorded_at <= @at
		ORDER BY next_id ASC, e.kind ASC, e.id ASC
	`);

	// BFS loop. At each level we expand the current frontier (level L nodes) into next
	// frontier (level L+1 nodes), filtering out anything already visited. Stops when the
	// frontier is empty or max_hops is reached.
	let frontier: Array<{ id: string; path: string }> = seedRows.map((r) => ({ id: r.node_id, path: '' }));
	for (let level = 0; level < input.max_hops && frontier.length > 0; level++) {
		const frontierJson = JSON.stringify(frontier);
		const rows = stepStmt.all(...kinds, { at: input.at, frontier_json: frontierJson }) as Array<{
			prev_id: string;
			prev_path: string;
			next_id: string;
			edge_kind: string;
			edge_id: string;
			node_kind: string;
			payload: string;
			confidence: string;
			valid_from: string;
			invalidated_at: string | null;
			recorded_at: string;
			superseded_by: string | null;
		}>;

		const nextFrontier: Array<{ id: string; path: string }> = [];
		for (const r of rows) {
			if (visited.has(r.next_id)) {
				continue;
			}
			const newPath = `${r.prev_path}/${r.edge_kind}:${r.edge_id}`;
			// MIN-edge_path semantics: the SQL ORDER BY (next_id ASC, edge_kind ASC, edge_id ASC)
			// gives us the lexically-minimum candidate first for each next_id; the visited-set
			// guard ensures we keep only the first occurrence per node_id. This matches the
			// original `walk_dedup AS (SELECT MIN(edge_path) ... GROUP BY node_id)` semantics
			// because edge_paths at the same level share the same prev_path prefix; ordering
			// by (edge_kind, edge_id) deterministically picks the smallest extension.
			visited.add(r.next_id);
			accum.set(r.next_id, {
				node_id: r.next_id,
				level: level + 1,
				edge_path: newPath,
				kind: r.node_kind,
				payload: r.payload,
				confidence: r.confidence,
				valid_from: r.valid_from,
				invalidated_at: r.invalidated_at,
				recorded_at: r.recorded_at,
				superseded_by: r.superseded_by,
			});
			nextFrontier.push({ id: r.next_id, path: newPath });
		}
		frontier = nextFrontier;
	}

	return finalize(accum);
}

interface AccumEntryShape {
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
}

function finalize(accum: Map<string, AccumEntryShape>): TraverseResult {
	const sorted = Array.from(accum.values()).sort((a, b) => {
		if (a.level !== b.level) {
			return a.level - b.level;
		}
		if (a.node_id < b.node_id) {
			return -1;
		}
		if (a.node_id > b.node_id) {
			return 1;
		}
		return 0;
	});
	const nodes: TraverseRow[] = sorted.map((r) => ({
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
