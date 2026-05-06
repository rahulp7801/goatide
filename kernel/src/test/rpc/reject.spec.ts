/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-03 — Reject-with-Note RPC.
// Plan 04-04 implements graph.recordRejection that creates an OpenQuestion node + a
// 'references' edge to the receipt's first cited node (proxy linkage per RESEARCH
// ## Pattern: Reject-with-Note + ## Pitfall 10).

import { describe, it } from 'vitest';

describe('CANV-03 — Reject-with-Note RPC', () => {
	it.skip('recordRejection creates OpenQuestion node — Plan 04-04 has not yet implemented recordRejection', () => {});
	it.skip('recordRejection writes references edge from OpenQuestion to first cited node — Plan 04-04 has not yet implemented edge wiring', () => {});
	it.skip('recordRejection persists rejected_change_id in OpenQuestion payload.detail — Plan 04-04 has not yet implemented payload threading', () => {});
	it.skip('recordRejection rejects empty note (Zod min(1)) — Plan 04-04 has not yet implemented input validation', () => {});
	it.skip('recordRejection on missing receipt_id throws clear error — Plan 04-04 has not yet implemented not-found guard', () => {});
});
