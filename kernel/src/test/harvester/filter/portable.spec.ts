/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/portable.spec.ts — Phase 5 Wave-0 refusal stub for PORT-01
// (predicate 1 of 5: portability — observation generalizes beyond the developer's machine).
//
// Plan 05-05 will flip the it.skip blocks into real assertions against isPortable.

import { describe, it } from 'vitest';

describe('PORT-01: portable predicate', () => {
	it.skip('accept: language-level rule (no machine-specific paths or ephemeral IDs)', () => {
		throw new Error('Plan 05-05 has not yet implemented isPortable');
	});

	it.skip('reject: hardcoded /Users/<username>/ path in body', () => {
		throw new Error('Plan 05-05 has not yet implemented isPortable (machine-path detection)');
	});

	it.skip('reject: ephemeral session ID in body', () => {
		throw new Error('Plan 05-05 has not yet implemented isPortable (ephemeral-ID detection)');
	});
});
