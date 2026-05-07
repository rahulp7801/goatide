/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/promoter/promoter.spec.ts — Phase 5 Wave-0 refusal stub for
// PORT-04 (Promoter LLM with @anthropic-ai/sdk + tool_choice forced selection).
//
// Plan 05-06 will flip the it.skip blocks. The recorded-fixture mode replays canned
// Anthropic.MessagesResponse JSON (one per NodeKind + each promoter failure mode) so
// kernel tests don't make live API calls.

import { describe, it } from 'vitest';

describe('PORT-04: Promoter (Anthropic tool-use)', () => {
	it.skip('recorded-fixture mode replays without live API call', () => {
		throw new Error('Plan 05-06 has not yet implemented runPromoter (recorded-fixture mode)');
	});

	it.skip('tool_use response -> NodePayloadSchema parse -> dao.seed Inferred', () => {
		throw new Error('Plan 05-06 has not yet implemented runPromoter (tool_use happy path)');
	});

	it.skip('schema violation in tool_use -> no graph write + metrics increment', () => {
		throw new Error('Plan 05-06 has not yet implemented runPromoter (Zod violation handling)');
	});

	it.skip('API key resolved from keytar before LLM call', () => {
		throw new Error('Plan 05-06 has not yet implemented runPromoter (keytar resolution)');
	});
});
