/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/backoff.spec.ts — Phase 6 (Plan 06-03) MCP-06 runWithBackoff.
//
// Implementation: full-jitter exponential backoff. delay = random(0, baseMs * 2^(attempt-1)).
// Default maxAttempts=5, baseMs=1000, cooldownMs=5*60_000. After exhaustion, sleep cooldownMs
// THEN throw lastErr — gives the caller breathing room before the next outer-loop restart.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithBackoff } from '../../mcp/backoff.js';

describe('MCP-06: runWithBackoff — exponential full-jitter retry helper', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('MCP-06: returns successfully on first attempt without delay', async () => {
		const fn = vi.fn(async () => 'ok');
		const promise = runWithBackoff(fn, { maxAttempts: 5, baseMs: 1000, cooldownMs: 60_000 });
		await vi.runAllTimersAsync();
		const result = await promise;
		expect({ result, calls: fn.mock.calls.length }).toEqual({ result: 'ok', calls: 1 });
	});

	it('MCP-06: retries on transient error and succeeds', async () => {
		let count = 0;
		const fn = vi.fn(async () => {
			count++;
			if (count < 3) {
				throw new Error('transient');
			}
			return 'ok';
		});
		const promise = runWithBackoff(fn, { maxAttempts: 5, baseMs: 100, cooldownMs: 60_000 });
		await vi.runAllTimersAsync();
		const result = await promise;
		expect({ result, calls: fn.mock.calls.length }).toEqual({ result: 'ok', calls: 3 });
	});

	it('MCP-06: throws lastErr after maxAttempts exhausted', async () => {
		const fn = vi.fn(async () => { throw new Error('always-fails'); });
		const promise = runWithBackoff(fn, { maxAttempts: 5, baseMs: 100, cooldownMs: 60_000 });
		// the promise will reject; capture the reason
		const caught = promise.catch((e: Error) => e);
		await vi.runAllTimersAsync();
		const err = await caught;
		expect({ message: err.message, calls: fn.mock.calls.length }).toEqual({ message: 'always-fails', calls: 5 });
	});

	it('MCP-06: cooldownMs sleep applied after final failure before throwing', async () => {
		const fn = vi.fn(async () => { throw new Error('boom'); });
		const cooldownMs = 7_777;
		const baseMs = 10;
		const promise = runWithBackoff(fn, { maxAttempts: 3, baseMs, cooldownMs });
		const caught = promise.catch((e: Error) => e);

		// Run only the inter-attempt jitter delays; do NOT advance through cooldown yet.
		// Each delay is at most baseMs * 2^(attempt-1). For attempts 1,2,3 that's ≤ 10,20,40.
		// Plus the cooldownMs at the very end. Burn the inter-attempt delays first.
		await vi.advanceTimersByTimeAsync(baseMs * 2 ** 3); // covers worst-case jitter for 3 attempts (well in excess of 10+20+40=70)

		// At this point the function has been called 3x; we should NOT have rejected yet
		// because the cooldownMs sleep is still pending. (Cooldown 7777ms is much larger than the burned 80ms.)
		// Now advance through cooldown and beyond.
		await vi.advanceTimersByTimeAsync(cooldownMs + 100);
		const err = await caught;
		expect({ message: err.message, calls: fn.mock.calls.length }).toEqual({ message: 'boom', calls: 3 });
	});
});
