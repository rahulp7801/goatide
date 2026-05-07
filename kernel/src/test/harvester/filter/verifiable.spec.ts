/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/verifiable.spec.ts — Phase 5 Plan 05-05 PORT-01 predicate 4
// (verifiable — claim has structural anchor or falsifiable shape).

import { describe, it, expect } from 'vitest';
import { isVerifiable } from '../../../harvester/filter/verifiable.js';
import type { FilterContext } from '../../../harvester/filter/index.js';
import type { RawObservation } from '../../../harvester/observations.js';

const ctx = {} as FilterContext;

function makeClaude(body: string): RawObservation {
	return { id: 'a', ts: 't', body, source: 'claude_jsonl', file_path: 'src/x.ts' };
}

describe('PORT-01: verifiable predicate', () => {
	it('accepts structural claims, rejects single-clause unfalsifiable opinions', () => {
		const structural = isVerifiable(
			makeClaude('Discount must use BigDecimal arithmetic to avoid float drift in cart subtotal.'),
			ctx,
		);
		const opinion = isVerifiable(makeClaude('this code is beautiful'), ctx);
		const opinion2 = isVerifiable(makeClaude('  The class is messy.  '), ctx);

		expect({
			structural: structural.ok,
			opinion: opinion.ok,
			opinion2: opinion2.ok,
		}).toEqual({
			structural: true,
			opinion: false,
			opinion2: false,
		});
	});
});
