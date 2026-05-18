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
import type { InspectorNodeRow } from '../../../src/inspector/kernelRowToCyElement.js';

describe('edgeRowToCyElement', () => {
	it('does not mutate the input row (Pitfall 1 fence)', () => {
		const row: InspectorEdgeRow = {
			id: '01JE' + 'A'.repeat(22),
			kind: 'parent_of',
			src_id: '01JN' + 'A'.repeat(22),
			dst_id: '01JN' + 'B'.repeat(22),
			valid_from: '2026-05-14T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'primary', // Phase 17 Plan 17-04 DEEP-06 phase-B Risk §5 fixture extension
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
			repo_id: 'primary', // Phase 17 Plan 17-04 DEEP-06 phase-B Risk §5 fixture extension
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
				crossRepo: false, // Phase 17 Plan 17-04 DEEP-06 phase-B — same-repo edge (primary === primary)
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
			repo_id: 'primary', // Phase 17 Plan 17-04 DEEP-06 phase-B Risk §5 fixture extension
		};
		const el = edgeRowToCyElement(row);
		assert.strictEqual(el.data.kind, 'supersedes');
	});

	it('edgeRowToCyElement crossRepo true: src.repo_id !== dst.repo_id sets data.crossRepo === true', () => {
		// Phase 21 XREPO-03a -- proves Phase 17 endpoint-based cross-repo detection at edgeRowToCyElement.ts:87
		// fires correctly when src and dst nodes have different repo_ids.
		const srcNode: InspectorNodeRow = {
			id: 'src-attempt-1',
			kind: 'Attempt',
			label: 'Attempt src',
			valid_from: '2026-05-18T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'repoA12345abc',
		};
		const dstNode: InspectorNodeRow = {
			id: 'dst-constraint-1',
			kind: 'ConstraintNode',
			label: 'Constraint dst',
			valid_from: '2026-05-18T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'repoB98765def',
		};
		const edgeRow: InspectorEdgeRow = {
			id: 'edge-cross-repo-1',
			kind: 'references',
			src_id: 'src-attempt-1',
			dst_id: 'dst-constraint-1',
			valid_from: '2026-05-18T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'repoA12345abc',
		};
		const nodesById = new Map<string, InspectorNodeRow>([[srcNode.id, srcNode], [dstNode.id, dstNode]]);
		const cyEdge = edgeRowToCyElement(edgeRow, nodesById);
		assert.strictEqual(cyEdge.data.crossRepo, true, 'Cross-repo edge must set data.crossRepo === true when src.repo_id !== dst.repo_id');
	});

	it('edgeRowToCyElement crossRepo false: src.repo_id === dst.repo_id keeps data.crossRepo === false (negative control)', () => {
		// Phase 21 XREPO-03a negative control -- same-repo edge must NOT set crossRepo.
		const srcNode: InspectorNodeRow = {
			id: 'src-attempt-same',
			kind: 'Attempt',
			label: 'Attempt src',
			valid_from: '2026-05-18T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'repoA12345abc',
		};
		const dstNode: InspectorNodeRow = {
			id: 'dst-constraint-same',
			kind: 'ConstraintNode',
			label: 'Constraint dst',
			valid_from: '2026-05-18T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'repoA12345abc', // same repo as src
		};
		const edgeRow: InspectorEdgeRow = {
			id: 'edge-same-repo-1',
			kind: 'references',
			src_id: 'src-attempt-same',
			dst_id: 'dst-constraint-same',
			valid_from: '2026-05-18T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'repoA12345abc',
		};
		const nodesById = new Map<string, InspectorNodeRow>([[srcNode.id, srcNode], [dstNode.id, dstNode]]);
		const cyEdge = edgeRowToCyElement(edgeRow, nodesById);
		assert.strictEqual(cyEdge.data.crossRepo, false, 'Same-repo edge must keep data.crossRepo === false');
	});
});
