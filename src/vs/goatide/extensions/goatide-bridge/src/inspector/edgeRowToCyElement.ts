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
	};
}

/**
 * Project a kernel `InspectorEdgeRow` into the canonical Cytoscape `{group, data}` edge
 * element shape. Pure — `row` is never mutated.
 *
 * Field rename: `src_id` → `source`, `dst_id` → `target` (Cytoscape edge convention).
 */
export function edgeRowToCyElement(row: InspectorEdgeRow): CytoscapeEdgeElement {
	return {
		group: 'edges',
		data: {
			id: row.id,
			source: row.src_id,
			target: row.dst_id,
			kind: row.kind,
			valid_from: row.valid_from,
			invalidated_at: row.invalidated_at,
		},
	};
}
