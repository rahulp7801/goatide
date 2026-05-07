/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/backoff.ts — Phase 6 (Plan 06-03) MCP-06 runWithBackoff helper.
//
// Full-jitter exponential backoff per AWS recommendation (Marc Brooker 2015):
//   delayMs = Math.random() * baseMs * 2^(attempt-1)
//
// After `maxAttempts` consecutive failures, sleep `cooldownMs` THEN throw the last error.
// The cooldown gives the caller (pool's per-provider supervisor loop) breathing room before
// the next outer-loop restart cycle — important in failure-cascade scenarios where a
// provider stays down for an extended window.
//
// Used by:
//  - kernel/src/mcp/clients/pool.ts — per-provider startProvider supervision loop
//  - kernel/src/mcp/auth/refresh.ts (Plan 06-04) — OAuth token refresh retry policy

export interface BackoffOptions {
	/** Maximum number of attempts before throwing the last error. Default 5. */
	maxAttempts?: number;
	/** Base delay (ms) for the jitter window. Default 1000 (1s -> up to 16s on attempt 5). */
	baseMs?: number;
	/** Sleep window after exhaustion before throwing. Default 5min. Pass 0 to skip. */
	cooldownMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_MS = 1000;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	if (ms <= 0) {
		return Promise.resolve();
	}
	return new Promise<void>(r => setTimeout(r, ms));
}

/**
 * Run `fn` up to `maxAttempts` times with full-jitter exponential backoff between attempts.
 * On success: returns the resolved value immediately. On exhaustion: sleeps cooldownMs, then
 * throws the last caught error. First attempt has zero pre-delay (fast-path).
 */
export async function runWithBackoff<T>(fn: () => Promise<T>, opts?: BackoffOptions): Promise<T> {
	const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	const baseMs = opts?.baseMs ?? DEFAULT_BASE_MS;
	const cooldownMs = opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS;

	let lastErr: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt < maxAttempts) {
				const cap = baseMs * Math.pow(2, attempt - 1);
				const delay = Math.random() * cap;
				await sleep(delay);
			}
		}
	}
	await sleep(cooldownMs);
	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
