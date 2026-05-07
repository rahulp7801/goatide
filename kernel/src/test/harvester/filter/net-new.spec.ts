/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/net-new.spec.ts — Phase 5 Wave-0 refusal stub for PORT-01
// (predicate 2 of 5: net-new — exact body-hash + anchor tuple does not already exist).
//
// Plan 05-05 will flip the it.skip blocks into real assertions against isNetNew. Mandate-C
// (Scope-Constrained Retrieval): EXACT-tuple match only — duplicate observations
// corroborate the existing node, not seed a new one.

import { describe, it } from 'vitest';

describe('PORT-01: net-new predicate', () => {
	it.skip('accept: no matching node in graph (body-hash + anchor tuple is novel)', () => {
		throw new Error('Plan 05-05 has not yet implemented isNetNew');
	});

	it.skip('reject: exact body-hash + anchor tuple already exists', () => {
		throw new Error('Plan 05-05 has not yet implemented isNetNew (exact-tuple duplicate detection)');
	});

	it.skip('rejection ALSO triggers corroboration counter increment on existing node (Mandate-C)', () => {
		throw new Error('Plan 05-05 has not yet implemented isNetNew (corroboration side-effect)');
	});
});
