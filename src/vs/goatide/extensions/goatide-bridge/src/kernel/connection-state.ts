/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge-side ConnectionStateMachine — Plan 04-05.
//
// Discriminated union ConnectionState (connecting | connected | degraded | reconnecting)
// + onDidChangeState event emitter. Plan 04-06 extends this with reconnect/drain logic;
// Plan 04-05 establishes the base surface so the KernelClient + status-bar banner have a
// single source of truth for kernel availability.

import * as vscode from 'vscode';

export type ConnectionState =
	| { kind: 'connecting' }
	| { kind: 'connected'; lastHeartbeatMs: number }
	| { kind: 'degraded'; reason: 'crashed' | 'timeout' | 'spawn_failure' | 'heartbeat_miss'; sinceMs: number }
	| { kind: 'reconnecting'; attempt: number; nextRetryMs: number };

export class ConnectionStateMachine {
	private state: ConnectionState = { kind: 'connecting' };
	private readonly emitter = new vscode.EventEmitter<ConnectionState>();
	readonly onDidChangeState: vscode.Event<ConnectionState> = this.emitter.event;

	get current(): ConnectionState {
		return this.state;
	}

	transition(next: ConnectionState): void {
		this.state = next;
		this.emitter.fire(next);
	}

	isConnected(): boolean {
		return this.state.kind === 'connected';
	}

	isDegraded(): boolean {
		return this.state.kind === 'degraded';
	}

	/**
	 * Drive an exponential-backoff reconnect loop. Plan 04-06.
	 *
	 * On each attempt: transition to 'reconnecting' → wait `delay` ms → invoke retryFn.
	 * If retryFn resolves, return (the retryFn is responsible for transitioning to
	 * 'connected' — KernelClient.connect does this at the end). If retryFn throws,
	 * double the delay (capped at maxDelayMs) and try again, up to maxAttempts.
	 *
	 * Plan defaults: 1s start, 30s cap, unlimited attempts. The reconnect command in
	 * extension.ts caps at 5 attempts so a permanently-dead kernel doesn't loop forever
	 * — caller can re-issue the command for another round.
	 */
	async startReconnectAttempts(
		retryFn: () => Promise<void>,
		opts?: { initialDelayMs?: number; maxDelayMs?: number; maxAttempts?: number },
	): Promise<void> {
		let delay = opts?.initialDelayMs ?? 1_000;
		const maxDelay = opts?.maxDelayMs ?? 30_000;
		const maxAttempts = opts?.maxAttempts ?? Infinity;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			this.transition({ kind: 'reconnecting', attempt, nextRetryMs: delay });
			await new Promise<void>((r) => setTimeout(r, delay));
			try {
				await retryFn();
				return;   // success — retryFn transitioned to connected.
			} catch {
				delay = Math.min(delay * 2, maxDelay);   // exponential backoff, capped.
			}
		}
		throw new Error(`startReconnectAttempts: gave up after ${maxAttempts} attempts`);
	}

	dispose(): void {
		this.emitter.dispose();
	}
}
