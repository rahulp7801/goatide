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

	dispose(): void {
		this.emitter.dispose();
	}
}
