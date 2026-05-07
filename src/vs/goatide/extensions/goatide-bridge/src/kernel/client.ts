/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge-side KernelClient — Plan 04-05 + Plan 05-02.
//
// Two modes:
//   - connect(kernelPath, dbPath?)         — Phase-4 stdio mode (spawn child, talk over stdin/stdout).
//                                            Preserved for back-compat with existing tests + the
//                                            stdio CLI / kernel/dist invocation path.
//   - ensureKernel({kernelPath, dbPath?, lockfilePath?})
//                                          — Phase-5 daemon mode. Reads lockfile; if alive,
//                                            connects via TCP to lockfile.rpc_port +
//                                            authenticates. Otherwise clears stale lockfile,
//                                            spawns a detached kernel (--daemon flag), waits
//                                            for the new lockfile, connects.
//
// vscode-jsonrpc kept at ^8.2.1 to mirror kernel/package.json (Pitfall 5).

import { spawn, type ChildProcess } from 'node:child_process';
import * as net from 'node:net';
import { homedir } from 'node:os';
import * as rpc from 'vscode-jsonrpc/node.js';
import { ConnectionStateMachine, type ConnectionState } from './connection-state.js';
import { readLockfile, isPidAlive, clearStaleLockfile, resolveLockfilePath } from './lockfile-reader.js';
import {
	QueryGraphRequest,
	ProposeEditRequest,
	RecordRejectionRequest,
	AtomicAcceptRequest,
	QueryAttemptByStagingPathRequest,
	QueryNodesRequest,
	HeartbeatRequest,
	AuthenticateRequest,
	type QueryGraphParams, type QueryGraphResult,
	type ProposeEditParams, type ProposeEditResult,
	type RecordRejectionParams, type RecordRejectionResult,
	type AtomicAcceptParams, type AtomicAcceptResult,
	type QueryAttemptByStagingPathParams, type QueryAttemptByStagingPathResult,
	type QueryNodesParams, type QueryNodesResult,
	type HeartbeatResult,
} from './methods.js';
import { existsSync } from 'node:fs';

export interface KernelClientOptions {
	requestTimeoutMs?: number;
	/** Plan 05-02: how long to wait for a freshly-spawned kernel to write its lockfile. */
	lockfilePollTimeoutMs?: number;
}

export interface EnsureKernelArgs {
	kernelPath: string;
	dbPath?: string;
	/** Override lockfile location (test harness). Defaults to resolveLockfilePath(). */
	lockfilePath?: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_LOCKFILE_POLL_TIMEOUT_MS = 5_000;
const DEFAULT_LOCKFILE_POLL_STEP_MS = 100;

export class KernelClient {
	private proc: ChildProcess | null = null;
	private socket: net.Socket | null = null;
	private connection: rpc.MessageConnection | null = null;
	readonly state = new ConnectionStateMachine();
	private readonly requestTimeoutMs: number;
	private readonly lockfilePollTimeoutMs: number;
	// Legacy connect() args (kept for reconnect()).
	private kernelPath?: string;
	private dbPath?: string;
	private lockfilePath?: string;
	// Plan 04-06 generation token for stale stdio-exit handlers.
	private generation = 0;
	// Track which mode we're in so reconnect() chooses the right path.
	private mode: 'stdio' | 'daemon' | 'none' = 'none';

	constructor(opts?: KernelClientOptions) {
		this.requestTimeoutMs = opts?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.lockfilePollTimeoutMs = opts?.lockfilePollTimeoutMs ?? DEFAULT_LOCKFILE_POLL_TIMEOUT_MS;
	}

	get onDidChangeState(): typeof this.state.onDidChangeState {
		return this.state.onDidChangeState;
	}

	/**
	 * Phase-4 stdio mode: spawn the kernel as a child, talk over stdin/stdout. Kept for
	 * back-compat with existing Phase-4 tests + the goatide-cli child-process invocation.
	 */
	async connect(kernelPath: string, dbPath?: string): Promise<void> {
		this.kernelPath = kernelPath;
		this.dbPath = dbPath;
		this.mode = 'stdio';
		this.state.transition({ kind: 'connecting' });
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
			console.error('[goatide-kernel]', b.toString().trimEnd());
		});
		proc.on('exit', (code) => {
			if (myGen !== this.generation) {
				return;
			}
			this.state.transition({ kind: 'degraded', reason: 'crashed', sinceMs: Date.now() });
			console.error(`[goatide-bridge] kernel exited with code ${code}`);
		});
		proc.on('error', (e) => {
			if (myGen !== this.generation) {
				return;
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

	/**
	 * Phase-5 daemon mode (Plan 05-02): reconnect-or-spawn flow.
	 *
	 *   1. Read lockfile.
	 *   2. If exists and pid alive → tryConnectTcp. On success: Mandate-A (kernel survived
	 *      IDE close). On failure (RPC unreachable): degraded state, throw.
	 *   3. If lockfile present but pid dead → clearStaleLockfile, fall through to spawn.
	 *   4. If no lockfile → fall through to spawn.
	 *   5. spawnDetachedKernel + pollForLockfile (5s) + tryConnectTcp.
	 */
	async ensureKernel(args: EnsureKernelArgs): Promise<void> {
		this.kernelPath = args.kernelPath;
		this.dbPath = args.dbPath;
		this.lockfilePath = args.lockfilePath ?? resolveLockfilePath();
		this.mode = 'daemon';
		this.state.transition({ kind: 'connecting' });

		const lock = readLockfile(this.lockfilePath);
		if (lock) {
			if (isPidAlive(lock.pid)) {
				try {
					await this.connectTcp(lock.rpc_port, lock.auth_token);
					this.state.transition({ kind: 'connected', lastHeartbeatMs: Date.now() });
					return;
				} catch (e) {
					// pid alive but RPC unreachable / auth failed — wedged daemon. Surface
					// to the user via the degraded banner; don't auto-clear (could be a real
					// daemon owned by a sibling install).
					this.state.transition({ kind: 'degraded', reason: 'spawn_failure_with_lockfile_present', sinceMs: Date.now() });
					throw e;
				}
			}
			// Stale lockfile.
			clearStaleLockfile(this.lockfilePath);
			this.state.transition({ kind: 'reconnecting', attempt: 1, nextRetryMs: 0, reason: 'lockfile_stale' });
		} else {
			this.state.transition({ kind: 'reconnecting', attempt: 1, nextRetryMs: 0, reason: 'lockfile_missing' });
		}

		await this.spawnDetachedKernel();
		const newLock = await this.pollForLockfile();
		try {
			await this.connectTcp(newLock.rpc_port, newLock.auth_token);
		} catch (e) {
			this.state.transition({ kind: 'degraded', reason: 'authenticate_failed', sinceMs: Date.now() });
			throw e;
		}
		this.state.transition({ kind: 'connected', lastHeartbeatMs: Date.now() });
	}

	private async connectTcp(port: number, token: string): Promise<void> {
		const socket = await new Promise<net.Socket>((resolve, reject) => {
			const s = net.createConnection({ port, host: '127.0.0.1' });
			const onError = (e: Error): void => {
				s.removeAllListeners('connect');
				reject(e);
			};
			s.once('error', onError);
			s.once('connect', () => {
				s.removeListener('error', onError);
				// Reattach a long-lived error handler so subsequent socket failures don't
				// crash the process; KernelClient surfaces them via state transitions.
				s.on('error', (err) => {
					console.error('[goatide-bridge] kernel TCP socket error', err);
				});
				resolve(s);
			});
		});
		const connection = rpc.createMessageConnection(
			new rpc.StreamMessageReader(socket),
			new rpc.StreamMessageWriter(socket),
		);
		connection.listen();
		try {
			const auth = await connection.sendRequest(AuthenticateRequest, { token });
			if (!auth || auth.ok !== true) {
				throw new Error('harvester.authenticate did not return ok');
			}
		} catch (e) {
			try { connection.dispose(); } catch { /* best-effort */ }
			try { socket.destroy(); } catch { /* best-effort */ }
			throw e;
		}
		this.socket = socket;
		this.connection = connection;
	}

	private async spawnDetachedKernel(): Promise<void> {
		if (!this.kernelPath) {
			throw new Error('spawnDetachedKernel: kernelPath not set');
		}
		// Pitfall 3: detached:true + stdio:'ignore' + child.unref() — all three required so
		// the bridge's parent process can actually exit.
		// Pitfall 10: explicit cwd=homedir() so the daemon doesn't accidentally open the DB
		// inside a workspace folder.
		const env: NodeJS.ProcessEnv = { ...process.env };
		if (this.dbPath) {
			env.GOATIDE_DB = this.dbPath;
		}
		if (this.lockfilePath) {
			env.GOATIDE_LOCKFILE_PATH = this.lockfilePath;
		}
		const child = spawn(process.execPath, [this.kernelPath, '--daemon'], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore'],
			env,
			cwd: homedir(),
		});
		child.unref();
	}

	private async pollForLockfile(): Promise<{ pid: number; rpc_port: number; auth_token: string }> {
		const deadline = Date.now() + this.lockfilePollTimeoutMs;
		while (Date.now() < deadline) {
			const lock = readLockfile(this.lockfilePath);
			if (lock && isPidAlive(lock.pid)) {
				return { pid: lock.pid, rpc_port: lock.rpc_port, auth_token: lock.auth_token };
			}
			await new Promise((r) => setTimeout(r, DEFAULT_LOCKFILE_POLL_STEP_MS));
		}
		throw new Error(`pollForLockfile: timed out after ${this.lockfilePollTimeoutMs}ms (path=${this.lockfilePath})`);
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
	 * Re-establish the kernel link. In stdio mode (Phase 4) this re-spawns the child;
	 * in daemon mode (Phase 5) this re-runs ensureKernel (read lockfile → reuse if alive,
	 * spawn detached otherwise).
	 */
	async reconnect(): Promise<void> {
		if (this.mode === 'daemon') {
			if (!this.kernelPath) {
				throw new Error('KernelClient.reconnect: ensureKernel never called');
			}
			try { this.connection?.dispose(); } catch { /* best-effort */ }
			try { this.socket?.destroy(); } catch { /* best-effort */ }
			this.connection = null;
			this.socket = null;
			await this.ensureKernel({ kernelPath: this.kernelPath, dbPath: this.dbPath, lockfilePath: this.lockfilePath });
			return;
		}
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

	/**
	 * Plan 05-02: lockfile-aware fast-path used by the reconnect command — if the lockfile
	 * points at a still-alive daemon, just reconnect TCP rather than spawning fresh.
	 */
	getDaemonLockfile(): { pid: number; rpc_port: number; auth_token: string; alive: boolean } | null {
		const path = this.lockfilePath ?? resolveLockfilePath();
		if (!existsSync(path)) {
			return null;
		}
		const lock = readLockfile(path);
		if (!lock) {
			return null;
		}
		return {
			pid: lock.pid,
			rpc_port: lock.rpc_port,
			auth_token: lock.auth_token,
			alive: isPidAlive(lock.pid),
		};
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
		try { this.socket?.destroy(); } catch { /* best-effort */ }
		this.connection = null;
		this.proc = null;
		this.socket = null;
		this.state.dispose();
	}
}
