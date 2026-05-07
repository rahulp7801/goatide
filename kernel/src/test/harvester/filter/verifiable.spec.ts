/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/verifiable.spec.ts — Phase 5 Wave-0 refusal stub for
// PORT-01 (predicate 4 of 5: verifiable — claim has structural anchor or falsifiable shape).
//
// Plan 05-05 will flip the it.skip blocks into real assertions against isVerifiable.

import { describe, it } from 'vitest';

describe('PORT-01: verifiable predicate', () => {
	it.skip('accept: claim with structural anchor (file path + symbol)', () => {
		throw new Error('Plan 05-05 has not yet implemented isVerifiable');
	});

	it.skip('reject: unfalsifiable opinion (e.g., "this code is beautiful")', () => {
		throw new Error('Plan 05-05 has not yet implemented isVerifiable (opinion detection)');
	});
});
