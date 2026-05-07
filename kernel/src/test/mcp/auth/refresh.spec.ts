/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/auth/refresh.spec.ts — Phase 6 (Plan 06-04) MCP-06 TokenRefreshScheduler.
//
// Three contracts pinned:
//   1. Scheduler arms the refresh at expiresAtMs - REFRESH_THRESHOLD_MS via the injected clock.
//   2. Refresh failure schedules retry under runWithBackoff (token exchange transient errors).
//   3. Pitfall 6 mutex: in-flight tool calls block while refresh holds the mutex; queued
//      callers drain in FIFO order once refresh resolves.
//
// Tests inject a manual timer harness so the scheduler's outer arming is observable; the
// internal retry loop (runWithBackoff) uses real setTimeout but with baseMs=1 the wall-clock
// cost is sub-millisecond and the retry semantics are exercised end-to-end.

import { describe, expect, it } from 'vitest';

import { REFRESH_THRESHOLD_MS, TokenRefreshScheduler } from '../../../mcp/auth/refresh.js';
import { makeStaleClock } from '../../helpers/mcp-fixtures.js';

interface PendingTimer {
	delay: number;
	handler: () => void;
}

/**
 * Manual timer harness. The scheduler arms timers via `setTimer`; tests inspect/clear them
 * via `pending()` + `clearTimer`. Triggering the actual refresh cycle is done via
 * `scheduler.triggerRefreshNow()` rather than firing the handler so the resulting promise
 * (including its internal retry sleeps + reschedule) can be awaited directly.
 */
function makeManualTimer() {
	const queue: PendingTimer[] = [];
	return {
		setTimer: (handler: () => void, delay: number) => {
			const entry = { delay, handler };
			queue.push(entry);
			return entry;
		},
		clearTimer: (handle: unknown) => {
			const idx = queue.indexOf(handle as PendingTimer);
			if (idx >= 0) {
				queue.splice(idx, 1);
			}
		},
		pending: () => queue.map(e => e.delay),
		clearAll: () => { queue.length = 0; },
	};
}

describe('MCP-06: TokenRefreshScheduler — pre-emptive OAuth refresh with mutex coordination', () => {
	it('MCP-06: TokenRefreshScheduler fires at expiry-5min via injected clock', async () => {
		const startMs = 1_700_000_000_000;
		const clock = makeStaleClock(startMs);
		const expiresAtMs = startMs + 60 * 60 * 1000; // expires in 1h
		const timer = makeManualTimer();
		let refreshCalls = 0;
		const scheduler = new TokenRefreshScheduler({
			provider: 'slack',
			fetchExpiry: async () => expiresAtMs,
			refresh: async () => { refreshCalls++; },
			clock,
			setTimer: timer.setTimer,
			clearTimer: timer.clearTimer,
			backoff: { maxAttempts: 1, baseMs: 0, cooldownMs: 0 },
		});

		await scheduler.start();
		// First arm: 1h expiry - 5min threshold = 55min delay.
		const firstDelay = timer.pending()[0];
		// Drop the armed timer; trigger the cycle synchronously and await it.
		timer.clearAll();
		await scheduler.triggerRefreshNow();
		// After refresh, scheduler reschedules from the new expiry.
		const secondDelay = timer.pending()[0];
		scheduler.stop();

		expect({
			firstDelay,
			expectedFirstDelay: 60 * 60 * 1000 - REFRESH_THRESHOLD_MS,
			refreshCallsAfterFirstFire: refreshCalls,
			rescheduled: typeof secondDelay === 'number',
			REFRESH_THRESHOLD_MS,
		}).toEqual({
			firstDelay: 55 * 60 * 1000,
			expectedFirstDelay: 55 * 60 * 1000,
			refreshCallsAfterFirstFire: 1,
			rescheduled: true,
			REFRESH_THRESHOLD_MS: 5 * 60 * 1000,
		});
	});

	it('MCP-06: refresh failure schedules retry with exponential backoff', async () => {
		const startMs = 1_700_000_000_000;
		const clock = makeStaleClock(startMs);
		const expiresAtMs = startMs + 30 * 60 * 1000; // 30min
		const timer = makeManualTimer();
		let attempts = 0;
		const scheduler = new TokenRefreshScheduler({
			provider: 'linear',
			fetchExpiry: async () => expiresAtMs,
			refresh: async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error(`transient-${attempts}`);
				}
				// success on 3rd attempt
			},
			clock,
			setTimer: timer.setTimer,
			clearTimer: timer.clearTimer,
			backoff: { maxAttempts: 5, baseMs: 1, cooldownMs: 0 },
		});

		await scheduler.start();
		timer.clearAll();
		await scheduler.triggerRefreshNow();
		// After a successful retry, scheduler armed the next refresh.
		const rescheduled = timer.pending().length;
		scheduler.stop();

		expect({
			attempts,
			rescheduled,
		}).toEqual({
			attempts: 3,
			rescheduled: 1,
		});
	});

	it('MCP-06: in-flight call coordination: refresh holds mutex; new calls wait for drain (Pitfall 6)', async () => {
		const startMs = 1_700_000_000_000;
		const clock = makeStaleClock(startMs);
		const timer = makeManualTimer();

		// Refresh resolves only when we explicitly resolve the gate. Tool calls queued via
		// withMutex MUST block until the refresh's promise resolves; we observe the order in
		// which their handlers run.
		let releaseRefresh!: () => void;
		const refreshGate = new Promise<void>((r) => { releaseRefresh = r; });
		const order: string[] = [];

		const scheduler = new TokenRefreshScheduler({
			provider: 'linear',
			fetchExpiry: async () => startMs + 30 * 60 * 1000,
			refresh: async () => {
				order.push('refresh-start');
				await refreshGate;
				order.push('refresh-end');
			},
			clock,
			setTimer: timer.setTimer,
			clearTimer: timer.clearTimer,
			backoff: { maxAttempts: 1, baseMs: 0, cooldownMs: 0 },
		});
		await scheduler.start();
		timer.clearAll();

		// Trigger the refresh cycle but do NOT await it yet — it will park on refreshGate.
		const cyclePromise = scheduler.triggerRefreshNow();
		// Yield so the refresh's microtask-chain reaches `await refreshGate`.
		await new Promise<void>(r => setImmediate(r));

		// Now queue two tool calls under withMutex. They must NOT run until refresh resolves.
		const start = Date.now();
		const callA = scheduler.withMutex(async () => { order.push('callA'); return 'A'; });
		const callB = scheduler.withMutex(async () => { order.push('callB'); return 'B'; });

		// Yield once more — neither tool call should have run yet because the refresh
		// hasn't released the mutex.
		await new Promise<void>(r => setImmediate(r));
		const orderBeforeRelease = [...order];

		// Release the refresh; queued tool calls drain.
		releaseRefresh();
		const [resA, resB] = await Promise.all([callA, callB]);
		await cyclePromise;
		const elapsed = Date.now() - start;
		scheduler.stop();

		expect({
			orderBeforeRelease,
			orderAfter: order,
			results: [resA, resB],
			latencyUnder500ms: elapsed < 500,
		}).toEqual({
			orderBeforeRelease: ['refresh-start'],
			orderAfter: ['refresh-start', 'refresh-end', 'callA', 'callB'],
			results: ['A', 'B'],
			latencyUnder500ms: true,
		});
	});
});
