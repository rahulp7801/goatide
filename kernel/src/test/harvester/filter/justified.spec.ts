/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/justified.spec.ts — Phase 5 Wave-0 refusal stub for
// PORT-01 (predicate 5 of 5: justified — observation includes rationale, not just an event).
//
// Plan 05-05 will flip the it.skip blocks into real assertions against isJustified.

import { describe, it } from 'vitest';

describe('PORT-01: justified predicate', () => {
	it.skip('accept: observation includes rationale (e.g., commit message + diff)', () => {
		throw new Error('Plan 05-05 has not yet implemented isJustified');
	});

	it.skip('reject: editor save with no diff context, terminal command with no error output', () => {
		throw new Error('Plan 05-05 has not yet implemented isJustified (rationale absence)');
	});
});
