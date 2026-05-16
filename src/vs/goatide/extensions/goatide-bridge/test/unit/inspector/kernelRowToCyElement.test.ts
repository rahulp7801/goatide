/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/kernelRowToCyElement.test.ts — Phase 15 Plan 15-01 (Wave-0).
//
// RED → GREEN at Wave-0 close: kernelRowToCyElement is a PURE projection utility, so the
// 3 cases below land GREEN as soon as the function body ships (no Wave-1+ dependency).
//
// Tests assert three invariants:
//   1. Mutation invariant (Pitfall 1 fence) — `structuredClone(row)` before + `deepStrictEqual`
//      after the call. Cytoscape must never be allowed to mutate the source kernel row in-place;
//      if it did, the timeline-slider re-render path would observe a moving asOf.
//   2. Canonical Cytoscape `{group: 'nodes', data: {...}}` shape — exact `deepStrictEqual` over
//      the full output object. No extra fields, no missing fields.
//   3. `invalidated_at: null` passthrough — Wave 3 (Plan 15-04) styles desaturated nodes when
//      `invalidated_at !== null`; the projection must preserve `null` for active nodes.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import {
	kernelRowToCyElement,
	type InspectorNodeRow,
} from '../../../src/inspector/kernelRowToCyElement.js';

describe('kernelRowToCyElement', () => {
	it('does not mutate the input row (Pitfall 1 fence)', () => {
		const row: InspectorNodeRow = {
			id: '01JN' + 'A'.repeat(22),
			kind: 'DecisionNode',
			label: 'D1',
			valid_from: '2026-05-14T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'primary', // Phase 17 Plan 17-04 DEEP-06 phase-B Risk §5 fixture extension
		};
		const snapshot = structuredClone(row);
		kernelRowToCyElement(row);
		assert.deepStrictEqual(row, snapshot, 'Pitfall 1: projection must not mutate input');
	});

	it('produces the canonical {group:"nodes", data:{...}} Cytoscape shape', () => {
		const row: InspectorNodeRow = {
			id: '01JN' + 'B'.repeat(22),
			kind: 'ConstraintNode',
			label: 'C1',
			valid_from: '2026-05-14T00:00:00.000Z',
			invalidated_at: '2026-05-14T01:00:00.000Z',
			repo_id: 'primary', // Phase 17 Plan 17-04 DEEP-06 phase-B Risk §5 fixture extension
		};
		const el = kernelRowToCyElement(row);
		assert.deepStrictEqual(el, {
			group: 'nodes',
			data: {
				id: row.id,
				kind: row.kind,
				label: row.label,
				valid_from: row.valid_from,
				invalidated_at: row.invalidated_at,
			},
		});
	});

	it('preserves invalidated_at === null for active-node rendering', () => {
		const row: InspectorNodeRow = {
			id: '01JN' + 'C'.repeat(22),
			kind: 'Attempt',
			label: 'A1',
			valid_from: '2026-05-14T00:00:00.000Z',
			invalidated_at: null,
			repo_id: 'primary', // Phase 17 Plan 17-04 DEEP-06 phase-B Risk §5 fixture extension
		};
		const el = kernelRowToCyElement(row);
		assert.strictEqual(el.data.invalidated_at, null);
	});
});
