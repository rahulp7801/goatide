/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge HeartbeatPoller — Plan 04-06.
//
// Polls kernel.heartbeat at a regular interval; transitions ConnectionStateMachine to
// 'degraded' if no successful heartbeat lands within missThresholdMs. Detects the
// "hung but alive" failure mode that connection-drop alone cannot catch (deadlocked
// kernel, blocked-on-fsync, network FS stall on the DB path).
//
// RESEARCH 04-RESEARCH.md ## Pattern: Kernel-Degraded Mode — detection signals include
// heartbeat-miss (3 consecutive misses at 10s interval = 30s degraded-detection window).

import type { KernelClient } from './client.js';
import type { ConnectionStateMachine } from './connection-state.js';

export interface HeartbeatPollerOptions {
	/** Default 10_000 (10s). */
	intervalMs?: number;
	/** Default 30_000 (30s — 3 consecutive missed beats at the default interval). */
	missThresholdMs?: number;
}

export class HeartbeatPoller {
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastSuccessMs = Date.now();
	private readonly intervalMs: number;
	private readonly missThresholdMs: number;

	constructor(
		private readonly kernel: KernelClient,
		private readonly state: ConnectionStateMachine,
		opts: HeartbeatPollerOptions = {},
	) {
		this.intervalMs = opts.intervalMs ?? 10_000;
		this.missThresholdMs = opts.missThresholdMs ?? 30_000;
	}

	start(): void {
		if (this.timer) {
			return;
		}
		this.lastSuccessMs = Date.now();
		this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async tick(): Promise<void> {
		try {
			await this.kernel.heartbeat();
			this.lastSuccessMs = Date.now();
		} catch {
			const elapsed = Date.now() - this.lastSuccessMs;
			// Only transition if we ARE currently connected — if the kernel already
			// crashed and dropped the connection, KernelClient.connect's exit handler
			// has already moved us to degraded { reason: 'crashed' }; we don't want to
			// clobber that with 'heartbeat_miss'.
			if (elapsed >= this.missThresholdMs && this.state.isConnected()) {
				this.state.transition({
					kind: 'degraded',
					reason: 'heartbeat_miss',
					sinceMs: Date.now(),
				});
			}
		}
	}

	/** For tests: force a tick synchronously (returns when the tick's I/O completes). */
	async forceTick(): Promise<void> {
		await this.tick();
	}
}
