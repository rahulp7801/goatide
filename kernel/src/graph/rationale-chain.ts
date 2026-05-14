/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/rationale-chain.ts — Phase 14 Plan 14-02 (Wave-1) DEEP-01 composition.
//
// DEEP-01 composes the existing graph primitives into a single "Why does this exist?"
// query: resolveAnchor(seed) -> traverse({scope:'all', max_hops:4, at:asOf}) -> filter
// rows where kind ∈ {ConstraintNode, DecisionNode} -> enrich each row with its successor
// via dao.findSuccessor (only when invalidated_at is non-null — saves the lookup on the
// majority active-row path). No new DAO calls; no schema changes.
//
// Pitfall 1 (asOf drift): callers MUST capture a single asOf timestamp and thread it
// through both resolveAnchor and traverse. This module receives it verbatim from the
// caller and never re-derives it. The bridge captures asOf from the receipt's
// graph_snapshot_tx_time (REC-03 single-snapshot invariant) so the chain reflects the
// state of the world AT receipt-build time, not at click time.
//
// Pitfall 6 (null successor): DecisionNodes with invalidated_at !== null AND
// successor_id === null appear in the chain unchanged — the "has_superseded" flag fires
// off invalidated_at, not successor_id.

import type { GraphDAO } from './dao.js';
import type { AnchorRequest } from './anchor.js';
import { resolveAnchor } from './anchor.js';
import { traverse } from './traverse.js';

/**
 * One row in the composed rationale chain. Mirrors the columns DEEP-01's "Why does this
 * exist?" header element renders.
 */
export interface RationaleChainEntry {
	readonly node_id: string;
	readonly kind: 'ConstraintNode' | 'DecisionNode';
	readonly body: string;
	readonly valid_from: string;
	readonly invalidated_at: string | null;
	readonly successor_id: string | null;
	readonly confidence: 'Explicit' | 'Inferred';
	readonly edge_path: string;
	readonly derived_under_priority?: string;
}

/**
 * Composition dependencies: a `GraphDAO` (high-level row access) and the underlying
 * better-sqlite3 handle (needed by `traverse` which speaks raw SQL).
 */
export interface RationaleChainDeps {
	readonly dao: GraphDAO;
	readonly sqlite: import('better-sqlite3').Database;
}

export interface RationaleChainParams {
	readonly anchor: AnchorRequest;
	readonly asOf: string;
	readonly maxHops?: number;
}

export interface RationaleChainResult {
	readonly chain: readonly RationaleChainEntry[];
	readonly has_superseded: boolean;
}

/**
 * Compose the rationale chain at `asOf` for the requested anchor.
 *
 * Steps:
 *   1. resolveAnchor(dao, anchor, asOf) — get the seed NodeRows. If empty, return
 *      {chain: [], has_superseded: false} (mirrors QueryGraphRequest handler shape).
 *   2. traverse(sqlite, {anchorIds, scope:'all', max_hops:params.maxHops ?? 4, at:asOf})
 *      — BFS walk parent_of + references + derived_from edges.
 *   3. Filter the traversal nodes to {ConstraintNode, DecisionNode} only.
 *   4. For each remaining row, enrich with successor_id (only call findSuccessor when
 *      invalidated_at is non-null — saves the lookup on the majority active-row path).
 *   5. has_superseded fires off invalidated_at !== null on any chain entry (Pitfall 6).
 *
 * No `new Date().toISOString()` / `Date.now()` calls anywhere — the asOf invariant
 * REQUIRES the caller to supply a captured timestamp (the receipt's graph_snapshot_tx_time).
 */
export function composeRationaleChainAt(
	deps: RationaleChainDeps,
	params: RationaleChainParams,
): RationaleChainResult {
	// Step 1 — resolve anchor seed nodes at the captured asOf.
	const seedNodes = resolveAnchor(deps.dao, params.anchor, params.asOf);
	if (seedNodes.length === 0) {
		return { chain: [], has_superseded: false };
	}

	// Step 2 — BFS walk over parent_of + references + derived_from edges.
	const traversal = traverse(deps.sqlite, {
		anchorIds: seedNodes.map((n) => n.id),
		scope: 'all',
		max_hops: params.maxHops ?? 4,
		at: params.asOf,
	});

	// Steps 3 + 4 — filter to ConstraintNode + DecisionNode, enrich each with successor_id.
	const chain: RationaleChainEntry[] = [];
	for (const row of traversal.nodes) {
		if (row.kind !== 'ConstraintNode' && row.kind !== 'DecisionNode') {
			continue;
		}
		// Pitfall 6: only call findSuccessor when invalidated_at is non-null. Active rows
		// have no successor by construction — skipping the lookup is both a perf win and a
		// correctness guard (findSuccessor can return null for invalidated-without-supersession
		// rows; that null lands here unchanged, and has_superseded still fires off
		// invalidated_at below).
		let successor_id: string | null = null;
		if (row.invalidated_at !== null) {
			const successor = deps.dao.findSuccessor(row.node_id);
			successor_id = successor?.id ?? null;
		}

		// Extract the body + optional derived_under_priority from the node payload. The
		// payload union for ConstraintNode + DecisionNode both carry `body`; DecisionNode
		// optionally carries `derived_under_priority` (Phase 7 Plan 07-05).
		const payload = row.payload as {
			body?: string;
			derived_under_priority?: string;
		};
		const body = typeof payload.body === 'string' ? payload.body : '';
		const entry: RationaleChainEntry = {
			node_id: row.node_id,
			kind: row.kind,
			body,
			valid_from: row.valid_from,
			invalidated_at: row.invalidated_at,
			successor_id,
			confidence: row.confidence,
			edge_path: row.edge_path,
			...(payload.derived_under_priority !== undefined
				? { derived_under_priority: payload.derived_under_priority }
				: {}),
		};
		chain.push(entry);
	}

	return {
		chain,
		has_superseded: chain.some((e) => e.invalidated_at !== null),
	};
}
