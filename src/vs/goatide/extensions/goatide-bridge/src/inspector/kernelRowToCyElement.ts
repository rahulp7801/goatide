/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/kernelRowToCyElement.ts —
// Phase 15 Plan 15-01 (Wave-0 — DEEP-02 projection utility).
//
// Pure projection: InspectorNodeRow (bitemporal kernel row shape) → CytoscapeNodeElement
// (Cytoscape.js canonical `{group, data}` element shape). Input is NEVER mutated; the unit
// test asserts this with `structuredClone` before + `assert.deepStrictEqual` after (Pitfall 1
// fence — Cytoscape must not be allowed to mutate the source row's bitemporal timestamps
// in-place; if it did, downstream timeline-slider re-renders would observe a moving asOf).
//
// The `kind` field drives the Graphify palette through Cytoscape selectors like
// `node[kind="DecisionNode"]` (RESEARCH Risk 6 — selector-based styling per node kind). The
// `invalidated_at: null` passthrough is the visual modifier for active vs superseded nodes
// (Wave 3 / Plan 15-04 renders superseded nodes desaturated when invalidated_at !== null).
//
// Wave-0 discipline (Plan 15-01): this file ships with the function body + 3 RED tests
// (mutation invariant + canonical shape + invalidated_at passthrough). All 3 are GREEN at
// Wave-0 close because the function is pure and has no Wave-1+ dependency.

export interface InspectorNodeRow {
	readonly id: string;
	readonly kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	readonly label: string;
	readonly valid_from: string;
	readonly invalidated_at: string | null;
}

export interface CytoscapeNodeElement {
	readonly group: 'nodes';
	readonly data: {
		readonly id: string;
		readonly kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
		readonly label: string;
		readonly valid_from: string;
		readonly invalidated_at: string | null;
	};
}

/**
 * Project a kernel `InspectorNodeRow` into the canonical Cytoscape `{group, data}` element
 * shape. Pure — `row` is never mutated.
 *
 * Pitfall 1 fence: NO object spread, NO Object.assign, NO property assignment on `row`.
 * Explicit per-field copy keeps the type narrow + the mutation invariant trivial to read.
 */
export function kernelRowToCyElement(row: InspectorNodeRow): CytoscapeNodeElement {
	return {
		group: 'nodes',
		data: {
			id: row.id,
			kind: row.kind,
			label: row.label,
			valid_from: row.valid_from,
			invalidated_at: row.invalidated_at,
		},
	};
}
