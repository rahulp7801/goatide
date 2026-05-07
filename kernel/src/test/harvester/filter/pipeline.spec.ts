/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/pipeline.spec.ts — Phase 5 Wave-0 refusal stub for
// PORT-01 (AND-chain short-circuit) + PORT-02 (silent rejection — no UI surface).
//
// Plan 05-05 will flip the it.skip blocks into real assertions; the third it.skip iterates
// the hand-crafted golden corpus in golden-corpus.json (one tuple per (observation,
// expected_decision) row).

import { describe, it } from 'vitest';

describe('PORT-01 / PORT-02: filter pipeline AND-chain short-circuit + silent rejection', () => {
	it.skip('PORT-01: AND-chains five predicates and short-circuits on first false', () => {
		throw new Error('Plan 05-05 has not yet implemented runFilterPipeline');
	});

	it.skip('PORT-02: rejected observation does NOT call dao.seed and does NOT post bridge events', () => {
		throw new Error('Plan 05-05 has not yet implemented runFilterPipeline (PORT-02 silent rejection)');
	});

	it.skip('PORT-01: replays golden-corpus.json and asserts every entry matches its expected decision', () => {
		throw new Error('Plan 05-05 has not yet implemented runFilterPipeline (golden corpus replay)');
	});
});
