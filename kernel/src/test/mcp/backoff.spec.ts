/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/backoff.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06.
// Plan 06-04 (OAuth + keychain + drift) flips these. Helper is also used by Plan 06-03.

import { describe, it } from 'vitest';

describe('MCP-06: runWithBackoff — exponential full-jitter retry helper', () => {
	it.skip('MCP-06: runWithBackoff with maxAttempts=5 and full jitter: delay = random(0, base * 2^attempt)', () => {
		throw new Error('Plan 06-04 has not yet implemented runWithBackoff (full-jitter formula: delayMs = Math.random() * baseMs * 2**attempt; maxAttempts default 5)');
	});

	it.skip('MCP-06: returns successfully on first attempt without delay', () => {
		throw new Error('Plan 06-04 has not yet implemented runWithBackoff fast-path (first-attempt success skips the sleep helper entirely)');
	});

	it.skip('MCP-06: throws lastErr after maxAttempts exhausted', () => {
		throw new Error('Plan 06-04 has not yet implemented runWithBackoff exhaustion semantics (rethrows lastErr after maxAttempts)');
	});

	it.skip('MCP-06: cooldownMs sleep applied after final failure before throwing', () => {
		throw new Error('Plan 06-04 has not yet implemented runWithBackoff cooldown (cooldownMs sleep before rethrow; lets caller breathe before restart)');
	});
});
