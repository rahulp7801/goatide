/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge-side KernelClient — Plan 04-05.
//
// Spawns kernel/dist/main.js as a ChildProcess + manages a vscode-jsonrpc 8.2.1
// MessageConnection over stdin/stdout. Per-request 5s default timeout; transitions
// the ConnectionStateMachine on child exit/error/timeout.
//
// Pitfall 5: vscode-jsonrpc kept at ^8.2.1 to mirror kernel/package.json:26 — DO NOT
// bump to 9.x unless the kernel pin is bumped first.
// Phase 04 STATE.md decision: import from 'vscode-jsonrpc/node.js' (with .js suffix)
// under Node16 ESM moduleResolution — package has no exports field; bare path fails
// TS2307.

import { spawn, type ChildProcess } from 'node:child_process';
import * as rpc from 'vscode-jsonrpc/node.js';
import { ConnectionStateMachine, type ConnectionState } from './connection-state.js';
import {
	QueryGraphRequest,
	ProposeEditRequest,
	RecordRejectionRequest,
	AtomicAcceptRequest,
	QueryAttemptByStagingPathRequest,
	QueryNodesRequest,
	HeartbeatRequest,
	type QueryGraphParams, type QueryGraphResult,
	type ProposeEditParams, type ProposeEditResult,
	type RecordRejectionParams, type RecordRejectionResult,
	type AtomicAcceptParams, type AtomicAcceptResult,
	type QueryAttemptByStagingPathParams, type QueryAttemptByStagingPathResult,
	type QueryNodesParams, type QueryNodesResult,
	type HeartbeatResult,
} from './methods.js';

export interface KernelClientOptions {
	requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export class KernelClient {
	private proc: ChildProcess | null = null;
	private connection: rpc.MessageConnection | null = null;
	readonly state = new ConnectionStateMachine();
	private readonly requestTimeoutMs: number;
	// Plan 04-06: capture connect args so reconnect() can re-use them without the caller
	// having to thread them through the reconnect command.
	private kernelPath?: string;
	private dbPath?: string;
	// Plan 04-06: generation token for exit/error handlers — see connect().
	private generation = 0;

	constructor(opts?: KernelClientOptions) {
		this.requestTimeoutMs = opts?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	}

	get onDidChangeState(): typeof this.state.onDidChangeState {
		return this.state.onDidChangeState;
	}

	async connect(kernelPath: string, dbPath?: string): Promise<void> {
		this.kernelPath = kernelPath;
		this.dbPath = dbPath;
		this.state.transition({ kind: 'connecting' });
		// Plan 04-06: each connect() pairs with a generation token. Exit/error handlers
		// only transition the state machine if their generation is still current — this
		// way an OLD proc's late SIGTERM doesn't clobber the NEW proc's connected state
		// after reconnect().
		this.generation++;
		const myGen = this.generation;
		let proc: ChildProcess;
		try {
			proc = spawn(process.execPath, [kernelPath], {
				stdio: ['pipe', 'pipe', 'pipe'],
				env: { ...process.env, ...(dbPath ? { GOATIDE_DB: dbPath } : {}) },
			});
			this.proc = proc;
		} catch (e) {
			this.state.transition({ kind: 'degraded', reason: 'spawn_failure', sinceMs: Date.now() });
			throw e;
		}

		proc.stderr?.on('data', (b: Buffer) => {
			// Forward kernel stderr to extension log; useful for diagnosis.
			console.error('[goatide-kernel]', b.toString().trimEnd());
		});
		proc.on('exit', (code) => {
			if (myGen !== this.generation) {
				return;   // a newer connect() superseded us; ignore stale exit.
			}
			this.state.transition({ kind: 'degraded', reason: 'crashed', sinceMs: Date.now() });
			console.error(`[goatide-bridge] kernel exited with code ${code}`);
		});
		proc.on('error', (e) => {
			if (myGen !== this.generation) {
				return;   // stale.
			}
			this.state.transition({ kind: 'degraded', reason: 'spawn_failure', sinceMs: Date.now() });
			console.error('[goatide-bridge] kernel spawn error', e);
		});

		this.connection = rpc.createMessageConnection(
			new rpc.StreamMessageReader(proc.stdout!),
			new rpc.StreamMessageWriter(proc.stdin!),
		);
		this.connection.listen();
		this.state.transition({ kind: 'connected', lastHeartbeatMs: Date.now() });
	}

	private sendWithTimeout<P, R>(req: rpc.RequestType<P, R, Error>, params: P): Promise<R> {
		if (!this.connection) {
			return Promise.reject(new Error('KernelClient: not connected'));
		}
		const conn = this.connection;
		return new Promise<R>((resolve, reject) => {
			const t = setTimeout(() => {
				this.state.transition({ kind: 'degraded', reason: 'timeout', sinceMs: Date.now() });
				reject(new Error(`KernelClient: request ${(req as unknown as { method: string }).method} timed out after ${this.requestTimeoutMs}ms`));
			}, this.requestTimeoutMs);
			conn.sendRequest(req, params).then(
				(result) => { clearTimeout(t); resolve(result); },
				(error) => { clearTimeout(t); reject(error); },
			);
		});
	}

	queryGraph(params: QueryGraphParams): Promise<QueryGraphResult> {
		return this.sendWithTimeout(QueryGraphRequest, params);
	}
	proposeEdit(params: ProposeEditParams): Promise<ProposeEditResult> {
		return this.sendWithTimeout(ProposeEditRequest, params);
	}
	recordRejection(params: RecordRejectionParams): Promise<RecordRejectionResult> {
		return this.sendWithTimeout(RecordRejectionRequest, params);
	}
	atomicAccept(params: AtomicAcceptParams): Promise<AtomicAcceptResult> {
		return this.sendWithTimeout(AtomicAcceptRequest, params);
	}
	queryAttemptByStagingPath(params: QueryAttemptByStagingPathParams): Promise<QueryAttemptByStagingPathResult> {
		return this.sendWithTimeout(QueryAttemptByStagingPathRequest, params);
	}
	queryNodes(params: QueryNodesParams): Promise<QueryNodesResult> {
		return this.sendWithTimeout(QueryNodesRequest, params);
	}
	heartbeat(): Promise<HeartbeatResult> {
		return this.sendWithTimeout(HeartbeatRequest, {});
	}

	/**
	 * Re-spawn the kernel sidecar using the kernelPath + dbPath captured at the original
	 * connect(). Disposes the existing proc + connection first. Plan 04-06 wires
	 * ConnectionStateMachine.startReconnectAttempts to drive this with exponential backoff.
	 */
	async reconnect(): Promise<void> {
		if (!this.kernelPath) {
			throw new Error('KernelClient.reconnect: never connected; call connect() first');
		}
		const kernelPath = this.kernelPath;
		const dbPath = this.dbPath;
		try { this.connection?.dispose(); } catch { /* best-effort */ }
		try { this.proc?.kill('SIGTERM'); } catch { /* best-effort */ }
		this.connection = null;
		this.proc = null;
		await this.connect(kernelPath, dbPath);
	}

	isConnected(): boolean {
		return this.state.isConnected();
	}

	get currentState(): ConnectionState {
		return this.state.current;
	}

	dispose(): void {
		try { this.connection?.dispose(); } catch { /* best-effort */ }
		try { this.proc?.kill('SIGTERM'); } catch { /* best-effort */ }
		this.connection = null;
		this.proc = null;
		this.state.dispose();
	}
}
