/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/session-priority-lens.test.ts — Phase 14 Plan 14-01 (Wave-0) RED suite
// for DEEP-05 session-priority lens rerank semantics + Mandate-B no-mutation invariant.
//
// All 5 it() cases are RED at Wave-0 close (the stub throws). Plan 14-04 flips them GREEN
// by landing the v1 implementation. The `describe('session-priority-lens rerank', ...)`
// string matches the VALIDATION.md `--grep "session-priority-lens rerank"` query verbatim.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { rerankBySessionPriority } from '../../../src/inspector/session-priority-lens.js';
import type { RenderedCitationForCanvas, DriftFindingForCanvas, IntentDriftBadgeForCanvas } from '../../../src/canvas/messages.js';

const ID = (suffix: string): string => '01J' + suffix.repeat(23);

function makeCitation(opts: {
	node_id: string;
	badge?: IntentDriftBadgeForCanvas | null;
}): RenderedCitationForCanvas {
	return {
		node_id: opts.node_id,
		version: opts.node_id,
		confidence: 'Explicit',
		edge_path: 'parent_of:0',
		snippet: 'snippet',
		body_preview: 'body',
		successor_id: null,
		intent_drift_badge: opts.badge ?? null,
	};
}

describe('session-priority-lens rerank', () => {
	const c1 = makeCitation({ node_id: ID('A') });
	const c2 = makeCitation({
		node_id: ID('B'),
		badge: {
			kind: 'priority-mismatch',
			citation_node_id: ID('B'),
			session_priority: 'X',
			cited_priority: 'Y',
			explanation: 'priority-mismatch',
		},
	});
	const c3 = makeCitation({ node_id: ID('C') });
	// Phase 14 Plan 14-03 — historical-conflict variant of the discriminated union. The
	// rerank lens (Plan 14-04) should treat both variants as drift-bearing for ordering
	// purposes. Wave-0 stub remains RED until 14-04 lands the implementation.
	const c4 = makeCitation({
		node_id: ID('D'),
		badge: {
			kind: 'historical-conflict',
			citation_node_id: ID('D'),
			superseded_at: '2026-05-01T00:00:00.000Z',
			successor_id: ID('S'),
			explanation: 'historical-conflict',
		},
	});

	it('reorders drift-bearing citations to the front, tie-stable', () => {
		const result = rerankBySessionPriority({
			citations: [c1, c2, c3, c4],
			findings: [],
			sessionPriority: 'X',
		});
		assert.deepStrictEqual(
			result.citations.map((c) => c.node_id),
			[c2.node_id, c4.node_id, c1.node_id, c3.node_id],
			'priority-mismatch first, historical-conflict next, then non-drift in original order',
		);
	});

	it('emits header indicator string keyed on session priority', () => {
		const result = rerankBySessionPriority({
			citations: [c1],
			findings: [],
			sessionPriority: 'X',
		});
		assert.equal(result.indicator, 'Filtered by session priority: X');
	});

	it('passes findings array through untouched', () => {
		const findings: DriftFindingForCanvas[] = [{
			contract_node_id: 'contract-1',
			contract_anchor_file: 'contracts/api.md',
			pattern_index: 0,
			pattern_kind: 'regex',
			file: 'src/api.ts',
			hunk_line: 1,
			message: 'pattern violation',
		}];
		const result = rerankBySessionPriority({
			citations: [c1],
			findings,
			sessionPriority: 'X',
		});
		assert.deepStrictEqual(result.findings, findings);
	});

	it('Mandate B — input citations array is not mutated', () => {
		const citations = [c1, c2, c3, c4];
		const snapshot = structuredClone(citations);
		rerankBySessionPriority({ citations, findings: [], sessionPriority: 'X' });
		assert.deepStrictEqual(citations, snapshot, 'input citations must be byte-identical after rerank');
	});

	it('returns a new citations array (not the same reference)', () => {
		const citations = [c1, c2];
		const result = rerankBySessionPriority({ citations, findings: [], sessionPriority: 'X' });
		assert.notStrictEqual(result.citations, citations, 'lens must return a new array');
	});
});
