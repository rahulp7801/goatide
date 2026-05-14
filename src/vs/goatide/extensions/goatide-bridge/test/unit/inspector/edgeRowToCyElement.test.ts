/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/edgeRowToCyElement.test.ts — Phase 15 Plan 15-01 (Wave-0).
//
// Mirror of kernelRowToCyElement.test.ts for the edge variant. Same three invariants:
// mutation, canonical shape, and key-passthrough — but the third case here asserts the
// `kind` field passes through (selector prerequisite for Wave-3 `edge[kind="supersedes"]`
// dashed-line styles).

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import {
	edgeRowToCyElement,
	type InspectorEdgeRow,
} from '../../../src/inspector/edgeRowToCyElement.js';

describe('edgeRowToCyElement', () => {
	it('does not mutate the input row (Pitfall 1 fence)', () => {
		const row: InspectorEdgeRow = {
			id: '01JE' + 'A'.repeat(22),
			kind: 'parent_of',
			src_id: '01JN' + 'A'.repeat(22),
			dst_id: '01JN' + 'B'.repeat(22),
			valid_from: '2026-05-14T00:00:00.000Z',
			invalidated_at: null,
		};
		const snapshot = structuredClone(row);
		edgeRowToCyElement(row);
		assert.deepStrictEqual(row, snapshot, 'Pitfall 1: projection must not mutate input');
	});

	it('produces the canonical {group:"edges", data:{source,target,...}} Cytoscape shape', () => {
		const row: InspectorEdgeRow = {
			id: '01JE' + 'B'.repeat(22),
			kind: 'references',
			src_id: '01JN' + 'C'.repeat(22),
			dst_id: '01JN' + 'D'.repeat(22),
			valid_from: '2026-05-14T00:00:00.000Z',
			invalidated_at: '2026-05-14T01:00:00.000Z',
		};
		const el = edgeRowToCyElement(row);
		assert.deepStrictEqual(el, {
			group: 'edges',
			data: {
				id: row.id,
				source: row.src_id,
				target: row.dst_id,
				kind: row.kind,
				valid_from: row.valid_from,
				invalidated_at: row.invalidated_at,
			},
		});
	});

	it('passes through kind === "supersedes" for dashed-edge selector prerequisite', () => {
		const row: InspectorEdgeRow = {
			id: '01JE' + 'C'.repeat(22),
			kind: 'supersedes',
			src_id: '01JN' + 'E'.repeat(22),
			dst_id: '01JN' + 'F'.repeat(22),
			valid_from: '2026-05-14T00:00:00.000Z',
			invalidated_at: null,
		};
		const el = edgeRowToCyElement(row);
		assert.strictEqual(el.data.kind, 'supersedes');
	});
});
