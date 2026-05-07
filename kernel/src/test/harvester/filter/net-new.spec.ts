/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/net-new.spec.ts — Phase 5 Plan 05-05 PORT-01 predicate 2
// (net-new — exact body-hash + anchor tuple does not already exist). Mandate-C: EXACT-tuple
// match only.

import { describe, it, expect, vi } from 'vitest';
import { isNetNew } from '../../../harvester/filter/net-new.js';
import { computeAnchorTuple } from '../../../harvester/filter/anchor-tuple.js';
import type { FilterContext } from '../../../harvester/filter/index.js';
import type { ClaudeJsonlObservation } from '../../../harvester/observations.js';
import type { GraphDAO, NodeRow } from '../../../graph/dao.js';

function makeClaude(body: string, file_path: string): ClaudeJsonlObservation {
	return { id: 'a', ts: 't', body, source: 'claude_jsonl', file_path };
}

function makeStubDao(matches: NodeRow[]): GraphDAO {
	return {
		queryByAnchor: vi.fn().mockReturnValue(matches),
	} as unknown as GraphDAO;
}

describe('PORT-01: net-new predicate', () => {
	it('accepts when no matching node, rejects on exact body-hash + anchor match, fires corroboration callback', async () => {
		const obs = makeClaude('Discount must use BigDecimal arithmetic.', 'src/x.ts');
		const tuple = computeAnchorTuple(obs);

		// Path 1: empty graph → accept.
		const emptyCtx: FilterContext = {
			dao: makeStubDao([]),
			workspaceFolders: [],
			now: () => 1234,
		};
		const acceptDecision = await isNetNew(obs, emptyCtx);

		// Path 2: graph already has a node with the same body-hash + same anchor file → reject.
		const matchingNode: NodeRow = {
			id: 'n-existing',
			kind: 'Constraint',
			payload: {
				kind: 'Constraint',
				body: obs.body,
				anchor: { file: obs.file_path },
			},
			confidence: 'Inferred',
			valid_from: 't0',
			invalidated_at: null,
			recorded_at: 't0',
			superseded_by: null,
		} as unknown as NodeRow;
		const corroborate = vi.fn(async () => undefined);
		const matchCtx: FilterContext = {
			dao: makeStubDao([matchingNode]),
			workspaceFolders: [],
			now: () => 1234,
			onCorroborationCandidate: corroborate,
		};
		const rejectDecision = await isNetNew(obs, matchCtx);

		expect({
			acceptOk: acceptDecision.ok,
			rejectOk: rejectDecision.ok,
			corroborateCalls: corroborate.mock.calls.length,
			corroborateArgs: corroborate.mock.calls[0],
			tupleHashLen: tuple.body_hash.length,
		}).toEqual({
			acceptOk: true,
			rejectOk: false,
			corroborateCalls: 1,
			corroborateArgs: ['n-existing', 'claude_jsonl'],
			tupleHashLen: 64,
		});
	});
});
