/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/auth/refresh.ts — Phase 6 (Plan 06-04) MCP-06 TokenRefreshScheduler.
//
// Pre-emptive OAuth refresh per 06-RESEARCH.md ## Pattern: Per-Client Resilience.
//
// Mechanics:
//   - REFRESH_THRESHOLD_MS = 5 * 60 * 1000 (5 min). Scheduler fires at expiresAtMs - threshold,
//     leaving a 5-minute safety window for the upstream provider's clock skew + the network
//     round-trip of the refresh-token exchange.
//   - Injectable clock (`now`) — mirrors Phase-5 LivenessState pattern so timer-driven tests
//     advance a synthetic clock instead of waiting in real time.
//   - Backoff retry — refresh failures retry through `runWithBackoff` with the caller-supplied
//     policy (defaults: 5 attempts, 1s base, 5min cooldown) before surfacing a hard failure.
//
// Pitfall 6 — In-flight call coordination:
//
//   The OAuth access token is long-lived in memory; concurrent tool calls are mid-flight when
//   the refresh fires. If a refresh resolves while a callTool is using the OLD access token,
//   the upstream API would observe a partial-rotation race (some requests succeed, some 401).
//
//   Defense: every `client.callTool` invocation routes through `withMutex(fn)`. Refresh
//   acquires the mutex (via `refresh()`); concurrent tool calls block on the mutex acquisition;
//   when refresh resolves, the queued callers drain in FIFO order. Typical wait latency is
//   < 500ms (the refresh round-trip dominates).

import { runWithBackoff, type BackoffOptions } from '../backoff.js';

/**
 * 5-minute refresh threshold. Refresh fires at `expiresAtMs - REFRESH_THRESHOLD_MS`. Pinned
 * here as a module constant so tests can reference the same value without recomputing.
 */
export const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Injectable clock interface. Production uses Date.now; tests use makeStaleClock from
 * kernel/src/test/helpers/mcp-fixtures.ts.
 */
export interface RefreshClock {
	/** Returns current time in ms since epoch. */
	now: () => number;
}

/**
 * Per-provider refresh contract. `fetchExpiry` returns the access token's expiration time in
 * ms-since-epoch (the scheduler computes refreshAt = expiresAt - REFRESH_THRESHOLD_MS).
 * `refresh` performs the OAuth refresh-token exchange and persists the new access + refresh
 * tokens to the keychain; on resolve, the scheduler reschedules from the new expiry.
 */
export interface TokenRefreshSchedulerArgs {
	provider: string;
	fetchExpiry: () => Promise<number>;
	refresh: () => Promise<void>;
	clock?: RefreshClock;
	backoff?: BackoffOptions;
	/** Optional `setTimeout` shim for tests that prefer fake timers over a controlled clock. */
	setTimer?: (handler: () => void, delayMs: number) => unknown;
	/** Optional `clearTimeout` shim paired with `setTimer`. */
	clearTimer?: (handle: unknown) => void;
}

/**
 * Pre-emptive OAuth refresh scheduler with Pitfall 6 mutex coordination.
 *
 * Lifecycle:
 *  - constructor: stores deps; does NOT schedule (caller invokes start()).
 *  - start(): fetches expiry, schedules first refresh, returns.
 *  - stop(): clears the timer; pending mutex acquirers reject with 'TokenRefreshScheduler stopped'.
 *  - refresh() (private): acquires mutex; runs `args.refresh` under runWithBackoff; releases
 *    mutex; reschedules from the new expiry.
 *  - withMutex<T>(fn): public mutex acquisition for tool callers (Pitfall 6).
 */
export class TokenRefreshScheduler {
	private readonly clock: RefreshClock;
	private readonly setTimer: (handler: () => void, delayMs: number) => unknown;
	private readonly clearTimer: (handle: unknown) => void;
	private timerHandle: unknown;
	private mutex: Promise<void> = Promise.resolve();
	private stopped = false;

	constructor(private readonly args: TokenRefreshSchedulerArgs) {
		this.clock = args.clock ?? { now: () => Date.now() };
		this.setTimer = args.setTimer ?? ((h, d) => setTimeout(h, d));
		this.clearTimer = args.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
	}

	/**
	 * Start the scheduler: fetch the current expiry and schedule the first refresh.
	 * Returns once scheduling is complete (NOT once the refresh fires — that's async).
	 */
	async start(): Promise<void> {
		this.stopped = false;
		await this.scheduleNext();
	}

	/**
	 * Stop the scheduler. Clears the active timer; subsequent withMutex calls reject.
	 */
	stop(): void {
		this.stopped = true;
		if (this.timerHandle !== undefined) {
			this.clearTimer(this.timerHandle);
			this.timerHandle = undefined;
		}
	}

	/**
	 * Pitfall 6: acquire the per-provider mutex, run `fn`, release. Concurrent callers queue
	 * behind any in-flight refresh; when the refresh resolves, queued callers drain in FIFO.
	 */
	async withMutex<T>(fn: () => Promise<T>): Promise<T> {
		// Wait on the existing mutex chain; replace it with our own promise so subsequent
		// callers wait on the chain INCLUDING our work (FIFO ordering).
		const previous = this.mutex;
		let release!: () => void;
		const mine = new Promise<void>((r) => { release = r; });
		this.mutex = mine;
		try {
			await previous;
			if (this.stopped) {
				throw new Error('TokenRefreshScheduler stopped');
			}
			return await fn();
		} finally {
			release();
		}
	}

	/**
	 * Internal: compute next refresh time + arm the timer.
	 */
	private async scheduleNext(): Promise<void> {
		if (this.stopped) {
			return;
		}
		const expiresAtMs = await this.args.fetchExpiry();
		const refreshAtMs = expiresAtMs - REFRESH_THRESHOLD_MS;
		const delay = Math.max(0, refreshAtMs - this.clock.now());
		this.timerHandle = this.setTimer(() => {
			void this.refreshAndReschedule();
		}, delay);
	}

	/**
	 * Internal: acquire mutex, run refresh under backoff, reschedule. The returned promise
	 * resolves once both the refresh + the rescheduling are complete; tests await it directly
	 * via `lastRefreshCycle()` so they don't have to flush microtasks individually.
	 */
	private async refreshAndReschedule(): Promise<void> {
		this.timerHandle = undefined;
		try {
			await this.withMutex(async () => {
				await runWithBackoff(() => this.args.refresh(), this.args.backoff);
			});
		} catch {
			// Backoff exhausted; the caller's onError surface (pool's handleError equivalent)
			// catches via the next callTool failing with 401 → revocation detector kicks in.
			// We deliberately do NOT propagate here because the scheduler runs outside a
			// supervisor's catch frame.
		}
		if (!this.stopped) {
			await this.scheduleNext();
		}
	}

	/**
	 * Test surface: synchronously trigger a refresh + reschedule cycle (bypassing the timer).
	 * Returns the cycle promise so tests can await it directly. Production callers do not use
	 * this; the timer is the canonical trigger.
	 */
	async triggerRefreshNow(): Promise<void> {
		await this.refreshAndReschedule();
	}
}
