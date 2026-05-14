/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/intent.spec.ts — Phase 7 (Plan 07-05) DRIFT-02 IntentDrift evaluator.
//
// IntentDrift evaluation: a citation is flagged when the cited DecisionNode's
// derived_under_priority differs from the active session priority. Mandate-C exact-equality
// (Pitfall 5: Speed-First !== Speed; Quality-First !== Quality). The evaluator is a pure
// function — no DAO calls; cited DecisionNode payloads are already attached to
// RenderedCitation by Plan 03-03's renderReceipt hydration step.

import { describe, it, expect } from 'vitest';
import { evaluateIntentDrift, type IntentDriftBadge } from '../../drift/intent.js';
import type { RenderedReceipt, RenderedCitation } from '../../receipt/render.js';
import type { NodePayload } from '../../graph/index.js';

// ----- Fixture helpers -----

function makeDecisionPayload(opts: { body?: string; derived_under_priority?: string }): NodePayload {
	return {
		kind: 'DecisionNode',
		body: opts.body ?? 'Use refresh-token rotation',
		anchor: { file: 'src/auth.ts' },
		derived_under_priority: opts.derived_under_priority,
	};
}

function makeContractPayload(): NodePayload {
	return {
		kind: 'ContractNode',
		body: 'API security contract',
		anchor: { file: 'contracts/api-security.md' },
		contract_path: 'contracts/api-security.md',
	};
}

function makeCitation(opts: { node_id: string; cited_payload: NodePayload | null }): RenderedCitation {
	return {
		node_id: opts.node_id,
		version: opts.node_id,
		confidence: 'Explicit',
		edge_path: '/references:01ABC',
		snippet: 'rule snippet',
		cited_payload: opts.cited_payload,
		cited_invalidated_at: null,
		successor_id: null,
	};
}

function makeReceipt(citations: RenderedCitation[]): RenderedReceipt {
	return {
		id: '01HZZZZZZZZZZZZZZZZZZZZZZ1',
		change_id: '01HZZZZZZZZZZZZZZZZZZZZZZ2',
		citations,
		drill_chain: [],
		destructive: false,
		graph_snapshot_tx_time: '2026-05-08T00:00:00.000Z',
	};
}

const DECISION_ID_1 = '01HZZZZZZZZZZZZZZZZZZZZZA1';
const DECISION_ID_2 = '01HZZZZZZZZZZZZZZZZZZZZZA2';
const DECISION_ID_3 = '01HZZZZZZZZZZZZZZZZZZZZZA3';
const CONTRACT_ID_1 = '01HZZZZZZZZZZZZZZZZZZZZZB1';

describe('drift/intent — Plan 07-05 (DRIFT-02)', () => {
	it('returns empty array when session priority matches all citations', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: DECISION_ID_1, cited_payload: makeDecisionPayload({ derived_under_priority: 'Quality-First' }) }),
			makeCitation({ node_id: DECISION_ID_2, cited_payload: makeDecisionPayload({ derived_under_priority: 'Quality-First' }) }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality-First' });
		expect(badges).toEqual([]);
	});

	it('flags citation when derived_under_priority differs from sessionPriority', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: DECISION_ID_1, cited_payload: makeDecisionPayload({ derived_under_priority: 'Speed-First' }) }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality-First' });
		const expected: IntentDriftBadge = {
			kind: 'priority-mismatch',
			citation_node_id: DECISION_ID_1,
			session_priority: 'Quality-First',
			cited_priority: 'Speed-First',
			explanation: `This rule was derived under 'Speed-First'; current session is 'Quality-First'. Re-evaluate before applying.`,
		};
		expect(badges).toEqual([expected]);
	});

	it('skips citations without derived_under_priority (returns no badge)', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: DECISION_ID_1, cited_payload: makeDecisionPayload({ derived_under_priority: undefined }) }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality-First' });
		expect(badges).toEqual([]);
	});

	it('Pitfall 5: exact-equality only — sessionPriority="Quality" does NOT match cited_priority="Quality-First"', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: DECISION_ID_1, cited_payload: makeDecisionPayload({ derived_under_priority: 'Quality-First' }) }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality' });
		expect(badges).toEqual([{
			kind: 'priority-mismatch',
			citation_node_id: DECISION_ID_1,
			session_priority: 'Quality',
			cited_priority: 'Quality-First',
			explanation: `This rule was derived under 'Quality-First'; current session is 'Quality'. Re-evaluate before applying.`,
		}]);
	});

	it('skips ContractNode citations (IntentDrift is DecisionNode-specific)', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: CONTRACT_ID_1, cited_payload: makeContractPayload() }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality-First' });
		expect(badges).toEqual([]);
	});

	it('mixed citations: only the mismatching DecisionNode fires (1 badge total)', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: CONTRACT_ID_1, cited_payload: makeContractPayload() }),
			makeCitation({ node_id: DECISION_ID_1, cited_payload: makeDecisionPayload({ derived_under_priority: 'Quality-First' }) }),
			makeCitation({ node_id: DECISION_ID_2, cited_payload: makeDecisionPayload({ derived_under_priority: 'Speed-First' }) }),
			makeCitation({ node_id: DECISION_ID_3, cited_payload: makeDecisionPayload({ derived_under_priority: undefined }) }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality-First' });
		expect(badges).toEqual([{
			kind: 'priority-mismatch',
			citation_node_id: DECISION_ID_2,
			session_priority: 'Quality-First',
			cited_priority: 'Speed-First',
			explanation: `This rule was derived under 'Speed-First'; current session is 'Quality-First'. Re-evaluate before applying.`,
		}]);
	});

	it('citations with null cited_payload are skipped (defensive)', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: DECISION_ID_1, cited_payload: null }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality-First' });
		expect(badges).toEqual([]);
	});
});

// Phase 14 Plan 14-03 (DEEP-04) — discriminated-union shape lock (14-W2-B in VALIDATION.md).
// The badge migration from flat interface to discriminated union must preserve the
// priority-mismatch shape verbatim (every existing field) AND add `kind: 'priority-mismatch'`
// as the first field. This describe block pins that contract independently of the toEqual
// snapshots above.
describe('discriminated-union backwards shape', () => {
	it('priority-mismatch badge carries kind: "priority-mismatch" plus all four original fields', () => {
		const receipt = makeReceipt([
			makeCitation({ node_id: DECISION_ID_1, cited_payload: makeDecisionPayload({ derived_under_priority: 'Speed-First' }) }),
		]);
		const badges = evaluateIntentDrift({ renderedReceipt: receipt, sessionPriority: 'Quality-First' });
		expect(badges).toHaveLength(1);
		const badge = badges[0];
		expect(badge.kind).toBe('priority-mismatch');
		// Narrowing — TypeScript discriminated-union guard.
		if (badge.kind === 'priority-mismatch') {
			expect(badge.citation_node_id).toBe(DECISION_ID_1);
			expect(badge.session_priority).toBe('Quality-First');
			expect(badge.cited_priority).toBe('Speed-First');
			expect(typeof badge.explanation).toBe('string');
		}
	});
});
