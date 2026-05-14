/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/rationale-chain.ts — Phase 14 Plan 14-01 (Wave-0) DEEP-01 stub.
//
// DEEP-01 composes the existing graph primitives into a single "Why does this exist?"
// query: resolveAnchor(seed) -> traverse({scope:'all', max_hops:4, at:asOf}) -> filter
// rows where kind ∈ {ConstraintNode, DecisionNode} -> enrich each row with its successor
// via dao.findSuccessor (or equivalent supersession lookup). No new DAO calls; no schema
// changes. Plan 14-02 lands the composition body + the QueryRationaleAtRequest handler.
//
// Wave-0: the function throws. The corresponding RED specs are at
// kernel/src/test/graph/rationale-chain.spec.ts (chain shape + bitemporal) and
// kernel/src/test/rpc/rationale-rpc.spec.ts (handler registration + requireAuth).
//
// Pitfall 1 (asOf drift): callers MUST capture a single asOf timestamp and thread it
// through both resolveAnchor and traverse. Plan 14-02's implementation will pin this.
// Pitfall 6 (null successor): DecisionNodes with invalidated_at !== null AND
// successor_id === null appear in the chain unchanged — the "has_superseded" flag fires
// off invalidated_at, not successor_id.

import type { GraphDAO } from './dao.js';
import type { AnchorRequest } from './anchor.js';

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
 * Wave-0 stub: throws. Plan 14-02 lands the implementation.
 */
export function composeRationaleChainAt(
	_deps: RationaleChainDeps,
	_params: RationaleChainParams,
): RationaleChainResult {
	throw new Error('DEEP-01 not yet implemented — Plan 14-02 must implement composeRationaleChainAt');
}
