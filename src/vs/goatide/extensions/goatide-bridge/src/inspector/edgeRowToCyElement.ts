/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/edgeRowToCyElement.ts —
// Phase 15 Plan 15-01 (Wave-0 — DEEP-02 projection utility).
//
// Pure projection: InspectorEdgeRow → CytoscapeEdgeElement. Mirrors kernelRowToCyElement.ts
// for nodes. Same Pitfall 1 fence (input never mutated).
//
// Key field rename: kernel uses `src_id`/`dst_id` (matches the SQLite edges table column
// names; see kernel/src/graph/schema/edges.ts:28-29). Cytoscape expects `source`/`target`
// on the edge data object (RESEARCH Risk 6 — Cytoscape edge data convention; see
// https://js.cytoscape.org/#notation/elements-json). This function performs the rename in
// the canonical place so the rest of the inspector can stay in Cytoscape-native vocabulary.
//
// The `kind` field stays as `string` on the bridge side (forward-compat for any future
// EdgeKind allowlist additions). Wave 3 (Plan 15-04) uses Cytoscape selectors like
// `edge[kind="supersedes"]` to apply dashed-line styles.

export interface InspectorEdgeRow {
	readonly id: string;
	readonly kind: string;
	readonly src_id: string;
	readonly dst_id: string;
	readonly valid_from: string;
	readonly invalidated_at: string | null;
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — Pitfall D defense. Threaded from kernel wire shape. Default 'primary' for all pre-Phase-16 rows. */
	readonly repo_id: string;
}

export interface CytoscapeEdgeElement {
	readonly group: 'edges';
	readonly data: {
		readonly id: string;
		readonly source: string;
		readonly target: string;
		readonly kind: string;
		readonly valid_from: string;
		readonly invalidated_at: string | null;
		/**
		 * Phase 17 Plan 17-04 DEEP-06 phase-B — true when the edge's src and dst nodes
		 * belong to different repos (src.repo_id !== dst.repo_id). False for same-repo edges
		 * (the common case in v2.0 where all nodes are repo_id='primary'). The Cytoscape
		 * stylesheet selector `edge[?crossRepo]` applies dashed-line + accent-color styling
		 * to cross-repo edges. See palette.ts GRAPHIFY_STYLE for the selector definition.
		 *
		 * Pitfall 2 avoidance: cross-repo distinction is a boolean data field, NOT a separate
		 * edge group or panel class.
		 */
		readonly crossRepo: boolean;
	};
}

import type { InspectorNodeRow } from './kernelRowToCyElement.js';

/**
 * Project a kernel `InspectorEdgeRow` into the canonical Cytoscape `{group, data}` edge
 * element shape. Pure — `row` is never mutated.
 *
 * Field rename: `src_id` → `source`, `dst_id` → `target` (Cytoscape edge convention).
 *
 * Phase 17 Plan 17-04 DEEP-06 phase-B: accepts an optional `nodesById` map to compute
 * `data.crossRepo`. When the map is provided, crossRepo is true iff the src and dst
 * nodes belong to different repos. When omitted (or if either endpoint is not in the map),
 * crossRepo defaults to false (same-repo assumption — safe degradation).
 *
 * Mandate B fence: this function imports ZERO write-RPC symbols. See
 * scripts/ci/refuse-deep05-write.sh BANNED array for the canonical token list.
 */
export function edgeRowToCyElement(
	row: InspectorEdgeRow,
	nodesById?: ReadonlyMap<string, InspectorNodeRow>,
): CytoscapeEdgeElement {
	const srcRepoId = nodesById?.get(row.src_id)?.repo_id ?? 'primary';
	const dstRepoId = nodesById?.get(row.dst_id)?.repo_id ?? 'primary';
	return {
		group: 'edges',
		data: {
			id: row.id,
			source: row.src_id,
			target: row.dst_id,
			kind: row.kind,
			valid_from: row.valid_from,
			invalidated_at: row.invalidated_at,
			crossRepo: srcRepoId !== dstRepoId,
		},
	};
}
