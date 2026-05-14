/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/historical-conflict.spec.ts — Phase 14 Plan 14-01 (Wave-0) RED suite
// for DEEP-04 evaluateHistoricalConflict.
//
// Four contracts under test (mirrors kernel/src/test/drift/intent.spec.ts structure):
//   1. emits badge ONLY when cited_invalidated_at !== null AND successor_id !== null
//      AND cited_invalidated_at <= asOf
//   2. skips ConstraintNode citations (DecisionNode-only per open question #1 default)
//   3. skips when cited_invalidated_at > asOf (bitemporal asOf edge — Pitfall 6)
//   4. skips when successor_id === null (defensive — Pitfall 6)
//
// Wave-0: evaluateHistoricalConflict is NOT yet exported from kernel/src/drift/intent.ts.
// Plan 14-03 lands the function. To keep this spec loadable today (vitest discovers it),
// we dynamic-import the module inside each `it()` and assert the export exists. The
// import will RESOLVE (intent.ts already exists) but the named symbol is missing — so the
// assertion fails RED on the "named export is not a function" branch. Plan 14-03 flips
// the assertions to use the real function.

import { describe, it, expect } from 'vitest';

const HISTORICAL_CONFLICT_EXPLANATION_PREFIX = 'The DecisionNode you cited has been superseded';

async function loadEvaluator(): Promise<(args: unknown) => readonly unknown[]> {
	const mod = await import('../../drift/intent.js') as Record<string, unknown>;
	const fn = mod.evaluateHistoricalConflict;
	if (typeof fn !== 'function') {
		throw new Error('DEEP-04 not yet implemented — Plan 14-03 must export evaluateHistoricalConflict from kernel/src/drift/intent.ts');
	}
	return fn as (args: unknown) => readonly unknown[];
}

function makeDecisionPayload(opts: { invalidated_at?: string | null; successor_id?: string | null }): Record<string, unknown> {
	return {
		kind: 'DecisionNode',
		body: 'Use cookie session storage',
		anchor: { file: 'src/auth.ts' },
		cited_invalidated_at: opts.invalidated_at ?? null,
		successor_id: opts.successor_id ?? null,
	};
}

function makeContractPayload(opts: { invalidated_at?: string | null; successor_id?: string | null }): Record<string, unknown> {
	return {
		kind: 'ContractNode',
		body: 'API security contract',
		anchor: { file: 'contracts/api-security.md' },
		contract_path: 'contracts/api-security.md',
		cited_invalidated_at: opts.invalidated_at ?? null,
		successor_id: opts.successor_id ?? null,
	};
}

function makeReceipt(citations: readonly Record<string, unknown>[], asOf: string): Record<string, unknown> {
	return {
		id: '01HZZZZZZZZZZZZZZZZZZZZZZ1',
		change_id: '01HZZZZZZZZZZZZZZZZZZZZZZ2',
		citations: citations.map((c, i) => ({
			node_id: `01HZZZZZZZZZZZZZZZZZZZZZA${i}`,
			version: `01HZZZZZZZZZZZZZZZZZZZZZA${i}`,
			confidence: 'Explicit',
			edge_path: 'parent_of:0',
			snippet: 'snippet',
			cited_payload: c,
			cited_invalidated_at: c.cited_invalidated_at,
			successor_id: c.successor_id,
		})),
		drill_chain: [],
		destructive: false,
		graph_snapshot_tx_time: asOf,
	};
}

describe('evaluateHistoricalConflict', () => {
	it('emits badge when cited_invalidated_at <= asOf AND successor_id !== null', async () => {
		const fn = await loadEvaluator();
		const cited_invalidated_at = '2026-05-01T00:00:00.000Z';
		const asOf = '2026-05-13T00:00:00.000Z';
		const receipt = makeReceipt([makeDecisionPayload({ invalidated_at: cited_invalidated_at, successor_id: '01HZZZZZZZZZZZZZZZZZZZZZS1' })], asOf);
		const badges = fn({ renderedReceipt: receipt, asOf }) as ReadonlyArray<{ explanation: string }>;
		expect(badges).toHaveLength(1);
		expect(badges[0].explanation.startsWith(HISTORICAL_CONFLICT_EXPLANATION_PREFIX)).toBe(true);
	});

	it('skips ConstraintNode citations (DecisionNode-only)', async () => {
		const fn = await loadEvaluator();
		const cited_invalidated_at = '2026-05-01T00:00:00.000Z';
		const asOf = '2026-05-13T00:00:00.000Z';
		const receipt = makeReceipt([makeContractPayload({ invalidated_at: cited_invalidated_at, successor_id: '01HZZZZZZZZZZZZZZZZZZZZZS1' })], asOf);
		const badges = fn({ renderedReceipt: receipt, asOf }) as readonly unknown[];
		expect(badges).toEqual([]);
	});

	it('skips when cited_invalidated_at > asOf (asOf is BEFORE supersession)', async () => {
		const fn = await loadEvaluator();
		const asOf = '2026-04-01T00:00:00.000Z';
		const cited_invalidated_at = '2026-05-01T00:00:00.000Z'; // later than asOf
		const receipt = makeReceipt([makeDecisionPayload({ invalidated_at: cited_invalidated_at, successor_id: '01HZZZZZZZZZZZZZZZZZZZZZS1' })], asOf);
		const badges = fn({ renderedReceipt: receipt, asOf }) as readonly unknown[];
		expect(badges).toEqual([]);
	});

	it('skips when successor_id === null (defensive — Pitfall 6)', async () => {
		const fn = await loadEvaluator();
		const cited_invalidated_at = '2026-05-01T00:00:00.000Z';
		const asOf = '2026-05-13T00:00:00.000Z';
		const receipt = makeReceipt([makeDecisionPayload({ invalidated_at: cited_invalidated_at, successor_id: null })], asOf);
		const badges = fn({ renderedReceipt: receipt, asOf }) as readonly unknown[];
		expect(badges).toEqual([]);
	});
});
