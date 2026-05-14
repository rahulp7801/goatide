/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/wireToInspectorRow.test.ts — Phase 15 Plan 15-04 (Wave 3) —
// New unit tests for the wire-shape ↔ InspectorRow adapter (Issue #1 fix from
// gsd-plan-checker). The adapter bridges the kernel wire shape (node_id/edge_id +
// src_id/dst_id per SerializedNodeSnapshot/SerializedEdgeSnapshot from Plan 15-02)
// to the post-projection InspectorRow shape (id field) that Graph.tsx consumes.
//
// Wave-0 ownership note: these tests are NEW this revision (Plan 15-01 didn't ship
// the adapter — it's a checker-feedback addition). They land here in Plan 15-04
// with full GREEN bodies (no Wave-0 RED stub phase).
//
// Pitfall 1 carry: mutation-invariant via structuredClone before + deepStrictEqual
// after — same discipline as kernelRowToCyElement.test.ts.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import {
	wireToInspectorNodeRow,
	wireToInspectorEdgeRow,
	type WireNodeSnapshot,
	type WireEdgeSnapshot,
} from '../../../src/inspector/webview/wireToInspectorRow.js';

describe('wireToInspectorRow adapter', () => {
	it('wireToInspectorNodeRow translates node_id → id and preserves other fields without mutating input', () => {
		const wire: WireNodeSnapshot = {
			node_id: '01JABCDEFGHIJKLMNOPQRSTUVW',
			kind: 'DecisionNode',
			label: 'Use Postgres for OLTP',
			valid_from: '2026-05-14T12:00:00.000Z',
			invalidated_at: null,
		};
		const snapshotBefore = structuredClone(wire);
		const result = wireToInspectorNodeRow(wire);
		assert.deepStrictEqual(
			result,
			{
				id: '01JABCDEFGHIJKLMNOPQRSTUVW',
				kind: 'DecisionNode',
				label: 'Use Postgres for OLTP',
				valid_from: '2026-05-14T12:00:00.000Z',
				invalidated_at: null,
			},
			'translated row must have id (not node_id) and all other fields preserved verbatim',
		);
		assert.deepStrictEqual(wire, snapshotBefore, 'input wire object MUST NOT be mutated (Pitfall 1 fence)');
	});

	it('wireToInspectorEdgeRow translates edge_id → id and preserves src_id / dst_id verbatim', () => {
		const wire: WireEdgeSnapshot = {
			edge_id: '01JEDGEXYZ12345678901234567',
			kind: 'supersedes',
			src_id: '01JSRC12345678901234567890A',
			dst_id: '01JDST12345678901234567890B',
			valid_from: '2026-05-14T13:00:00.000Z',
			invalidated_at: '2026-05-14T14:00:00.000Z',
		};
		const snapshotBefore = structuredClone(wire);
		const result = wireToInspectorEdgeRow(wire);
		assert.deepStrictEqual(
			result,
			{
				id: '01JEDGEXYZ12345678901234567',
				kind: 'supersedes',
				src_id: '01JSRC12345678901234567890A',
				dst_id: '01JDST12345678901234567890B',
				valid_from: '2026-05-14T13:00:00.000Z',
				invalidated_at: '2026-05-14T14:00:00.000Z',
			},
			'translated edge must have id (not edge_id) and src_id / dst_id preserved verbatim for the InspectorEdgeRow shape (edgeRowToCyElement renames them downstream)',
		);
		assert.deepStrictEqual(wire, snapshotBefore, 'input wire object MUST NOT be mutated (Pitfall 1 fence)');
	});
});
