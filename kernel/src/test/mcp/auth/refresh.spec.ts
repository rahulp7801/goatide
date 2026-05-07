/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/auth/refresh.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-06: TokenRefreshScheduler — pre-emptive OAuth refresh with mutex coordination', () => {
	it.skip('MCP-06: TokenRefreshScheduler fires at expiry-5min via injected clock', () => {
		throw new Error('Plan 06-04 has not yet implemented TokenRefreshScheduler (setTimeout-driven via injected makeStaleClock; refreshes at expiresAtMs - 5*60_000)');
	});

	it.skip('MCP-06: refresh failure schedules retry with exponential backoff', () => {
		throw new Error('Plan 06-04 has not yet implemented refresh-failure retry path (runWithBackoff full-jitter; preserves existing token until next attempt)');
	});

	it.skip('MCP-06: in-flight call coordination: refresh holds mutex; new calls wait for drain (Pitfall 6)', () => {
		throw new Error('Plan 06-04 has not yet implemented refresh mutex (Pitfall 6 — in-flight tool calls drain before refresh; new calls block until refresh completes)');
	});
});
