/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/promotion-gate/canvas-decision.spec.ts — Phase 5 Wave-0 refusal
// stub for PORT-05 (a) — Canvas Accept Attempt promotes Inferred -> cite_eligible.
//
// Plan 05-06 will flip these. Mandate-B compliance: the promotion is a NEW row + supersedes
// edge (NOT in-place UPDATE), so the bitemporal history of cite_eligible flips is preserved.

import { describe, it } from 'vitest';

describe('PORT-05 (a): Canvas Attempt(accepted) flips cite_eligible via supersede', () => {
	it.skip('Phase-4 Attempt(attempt_kind=accepted) referencing Inferred node flips cite_eligible via dao.supersede (Mandate-B compliance)', () => {
		throw new Error('Plan 05-06 has not yet implemented promoteOnCanvasAccept');
	});

	it.skip('Reject Attempt does NOT flip cite_eligible', () => {
		throw new Error('Plan 05-06 has not yet implemented promoteOnCanvasAccept (reject path)');
	});
});
