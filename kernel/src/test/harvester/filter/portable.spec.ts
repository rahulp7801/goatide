/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/portable.spec.ts — Phase 5 Plan 05-05 PORT-01 predicate 1
// (portability — observation generalizes beyond the developer's machine).

import { describe, it, expect } from 'vitest';
import { isPortable } from '../../../harvester/filter/portable.js';
import type { FilterContext } from '../../../harvester/filter/index.js';
import type { RawObservation } from '../../../harvester/observations.js';

const ctx = {} as FilterContext;

function makeClaude(body: string, file_path = 'src/x.ts'): RawObservation {
	return { id: 'a', ts: 't', body, source: 'claude_jsonl', file_path };
}

describe('PORT-01: portable predicate', () => {
	it('classifies portable vs non-portable bodies (3-branch snapshot)', () => {
		const accept = isPortable(makeClaude('Discount must use BigDecimal arithmetic to avoid float precision drift.'), ctx);
		const rejectUsersPath = isPortable(makeClaude('Set DATABASE_URL to /Users/alice/dev/myproj/data.db'), ctx);
		const rejectEphemeralUuid = isPortable(makeClaude('8f3c2a91-0b1e-4d2a-9c0f-aaaaaaaaaaaa'), ctx);

		expect({
			acceptOk: accept.ok,
			rejectUsers: rejectUsersPath.ok,
			rejectUuid: rejectEphemeralUuid.ok,
		}).toEqual({
			acceptOk: true,
			rejectUsers: false,
			rejectUuid: false,
		});
	});
});
