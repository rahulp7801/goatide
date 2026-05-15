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

import { type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import * as net from 'node:net';
import * as rpc from 'vscode-jsonrpc/node.js';
import { ConnectionStateMachine, type ConnectionState } from './connection-state.js';
import { readLockfile, isPidAlive, clearStaleLockfile, resolveLockfilePath, resolveGoatideConfigDir } from './lockfile-reader.js';

// Resolve child_process via CommonJS `require` so the property `childProcess.spawn` lives
// on a mutable, sinon-stubbable object. tsx's ESM-namespace wrapper (which `import * as cp`
// would produce) freezes property descriptors and breaks sinon.stub(cp, 'spawn'), preventing
// BRIDGE-RT-02 unit tests from intercepting the spawn call. The bridge ships as CJS
// (no `"type": "module"` in package.json), so `require` is available without a shim.
const childProcess: typeof import('node:child_process') = require('node:child_process');
import {
	QueryGraphRequest,
	QueryRationaleAtRequest,
	QueryGraphSnapshotRequest,
	QueryTimelineTransitionsRequest,
	ProposeEditRequest,
	RecordRejectionRequest,
	RecordContractOverrideRequest,
	AtomicAcceptRequest,
	QueryAttemptByStagingPathRequest,
	QueryNodesRequest,
	HeartbeatRequest,
	AuthenticateRequest,
	SubmitObservationRequest,
	GetLivenessRequest,
	GetDailyMetricsRequest,
	McpGetProviderStateRequest,
	McpGetSchemaDriftReportRequest,
	McpListProvidersRequest,
	McpAcceptProviderSchemaDriftRequest,
	McpReconnectProviderRequest,
	RunDriftAndLockRequest,
	RunRippleProgressiveRequest,
	DriftProgressNotificationType,
	type QueryGraphParams, type QueryGraphResult,
	type QueryRationaleAtParams, type QueryRationaleAtResult,
	type QueryGraphSnapshotParams, type QueryGraphSnapshotResult,
	type QueryTimelineTransitionsResult,
	type ProposeEditParams, type ProposeEditResult,
	type RecordRejectionParams, type RecordRejectionResult,
	type RecordContractOverrideParams, type RecordContractOverrideResult,
	type AtomicAcceptParams, type AtomicAcceptResult,
	type QueryAttemptByStagingPathParams, type QueryAttemptByStagingPathResult,
	type QueryNodesParams, type QueryNodesResult,
	type HeartbeatResult,
	type SubmitObservationParams, type SubmitObservationResult,
	type GetLivenessResult,
	type GetDailyMetricsParams, type GetDailyMetricsResult,
	type McpGetProviderStateParams, type McpGetProviderStateResult,
	type McpGetSchemaDriftReportResult,
	type McpListProvidersResult,
	type McpAcceptProviderSchemaDriftParams, type McpAcceptProviderSchemaDriftResult,
	type McpReconnectProviderParams, type McpReconnectProviderResult,
	type RunDriftAndLockParams, type RunDriftAndLockResult,
	type RunRippleProgressiveParams, type RunRippleProgressiveResult,
	type DriftProgressNotification,
	ConstraintLiftRequest,
	type ConstraintLiftParams, type ConstraintLiftResult,
} from './methods.js';

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

/**
 * Lockfile poll timeout for kernel daemon spawn detection.
 *
 * BRIDGE-RT-03: 15s covers cold-start arithmetic on a fresh clone:
 *   - daemon process spawn:        ~3s (Node startup + better-sqlite3 native module load)
 *   - lockfile atomic-rename:      ~2-3s on slow disks (Windows Defender scans tempfiles)
 *   - variance budget for CI/VM:   5-7s
 * Total: ~10-13s. 15s is the conservative ceiling.
 *
 * Nothing in the bridge depends on this value being short — it is purely an early-failure
 * ceiling for `daemon failed to come up`. Lifting it does not slow happy-path scenarios
 * (the poll loop returns as soon as the lockfile appears).
 *
 * Migrated to src from dist patch applied 2026-05-08 stress test (was 5_000 → 15_000).
 * Exported so the BRIDGE-RT-03 test can statically assert the floor.
 */
export const DEFAULT_LOCKFILE_POLL_TIMEOUT_MS = 15_000;

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
			proc = childProcess.spawn(process.execPath, [kernelPath], {
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
		// BRIDGE-RT-02: cwd must NOT be a workspace folder (Pitfall 10 — homedir() collides
		// with `~/.git` on dev boxes that ran `git config --global` once, and the kernel's
		// validateCwdForDaemon then refuses to start).
		//
		//   Belt:       cwd = resolveGoatideConfigDir() — the kernel's own config dir
		//               (e.g. %APPDATA%\goatide on Windows, $XDG_CONFIG_HOME/goatide on Linux).
		//               Guaranteed not to be a workspace.
		//   Suspenders: env.GOATIDE_TEST_OVERRIDE_CWD='1' — kernel/src/main.ts
		//               validateCwdForDaemon reads this and skips the workspace-cwd refusal
		//               even if the cwd somehow ends up looking like a workspace.
		//
		// Pitfall 3 retained: detached:true + stdio:'ignore' + child.unref() — all three
		// required so the bridge's parent process can actually exit.
		const env: NodeJS.ProcessEnv = {
			...process.env,
			GOATIDE_TEST_OVERRIDE_CWD: '1',
		};
		if (this.dbPath) {
			env.GOATIDE_DB = this.dbPath;
		}
		if (this.lockfilePath) {
			env.GOATIDE_LOCKFILE_PATH = this.lockfilePath;
		}
		const dataDir = resolveGoatideConfigDir();
		// Ensure dataDir exists — first-ever spawn on a fresh box will need this. Best-effort:
		// if mkdir fails the spawn will surface a clearer error and the user can fix perms.
		try {
			mkdirSync(dataDir, { recursive: true });
		} catch { /* best-effort */ }
		const child = childProcess.spawn(process.execPath, [this.kernelPath, '--daemon'], {
			detached: true,
			stdio: ['ignore', 'ignore', 'ignore'],
			env,
			cwd: dataDir,
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
	/**
	 * Phase 14 Plan 14-02 (DEEP-01) — bitemporal "Why does this exist?" composition.
	 *
	 * The Verification Canvas "Why does this exist?" button click ultimately calls this
	 * method via panel.ts handleMessage. `params.asOf` MUST be the receipt's
	 * graph_snapshot_tx_time (REC-03 single-snapshot invariant; Pitfall 1 asOf-drift
	 * fence — NEVER new Date().toISOString() at click time).
	 *
	 * The ReadonlyKernelClient Pick<> exposes this method to the inspector layer
	 * (DEEP-05 read-only narrowing); the bridge tsc gate refuses inspector code that
	 * touches any of the four banned write-RPC names (refuse-deep05-write.sh).
	 */
	queryRationaleAt(params: QueryRationaleAtParams): Promise<QueryRationaleAtResult> {
		return this.sendWithTimeout(QueryRationaleAtRequest, params);
	}
	/**
	 * Phase 15 Plan 15-02 (DEEP-02) — bitemporal snapshot of nodes + edges at the given
	 * asOf timestamp. The inspector slider dispatches this once per timeline transition;
	 * `params.asOf` MUST be a transition emitted by queryTimelineTransitions (the slider
	 * snaps to those instants). REC-03 single-snapshot invariant — the bridge never
	 * substitutes new Date().toISOString() for asOf.
	 *
	 * The ReadonlyKernelClient Pick<> exposes this method to the inspector layer (Mandate B
	 * read-only narrowing); refuse-deep05-write.sh prevents inspector code from importing
	 * any of the four banned write-RPC names.
	 */
	public queryGraphSnapshot(params: QueryGraphSnapshotParams): Promise<QueryGraphSnapshotResult> {
		return this.sendWithTimeout(QueryGraphSnapshotRequest, params);
	}

	/**
	 * Phase 15 Plan 15-02 (DEEP-02) — deduped, sorted-ascending timeline transitions across
	 * nodes + edges. Plan 15-04 webview slider snaps to these instants so every drag step
	 * produces a visually-distinct snapshot. Pure read; no parameters.
	 */
	public queryTimelineTransitions(): Promise<QueryTimelineTransitionsResult> {
		return this.sendWithTimeout(QueryTimelineTransitionsRequest, undefined);
	}

	/**
	 * Phase 16 Plan 16-03 (DEEP-03) — hypothetical-impact ripple analysis.
	 * Mirrors queryRationaleAt + queryGraphSnapshot sibling shape.
	 * `params.asOf` MUST be the receipt's graph_snapshot_tx_time (Pitfall 1 / REC-03
	 * single-snapshot invariant — NEVER new Date().toISOString() at click time).
	 */
	public constraintLift(params: ConstraintLiftParams): Promise<ConstraintLiftResult> {
		return this.sendWithTimeout(ConstraintLiftRequest, params);
	}

	heartbeat(): Promise<HeartbeatResult> {
		return this.sendWithTimeout(HeartbeatRequest, {});
	}
	harvesterSubmitObservation(params: SubmitObservationParams): Promise<SubmitObservationResult> {
		return this.sendWithTimeout(SubmitObservationRequest, params);
	}
	harvesterGetLiveness(): Promise<GetLivenessResult> {
		return this.sendWithTimeout(GetLivenessRequest, {});
	}
	harvesterGetDailyMetrics(params: GetDailyMetricsParams): Promise<GetDailyMetricsResult> {
		return this.sendWithTimeout(GetDailyMetricsRequest, params);
	}
	mcpGetProviderState(params: McpGetProviderStateParams): Promise<McpGetProviderStateResult> {
		return this.sendWithTimeout(McpGetProviderStateRequest, params);
	}
	mcpGetSchemaDriftReport(): Promise<McpGetSchemaDriftReportResult> {
		return this.sendWithTimeout(McpGetSchemaDriftReportRequest, {});
	}
	/**
	 * Plan 10-02 (POLISH-02) — precondition gate for SchemaDriftBanner's 30s poll loop.
	 * Empty `providers` array signals "no MCP providers configured", in which case the
	 * banner suppresses its mcp.getSchemaDriftReport poll entirely. The handler is
	 * registered unconditionally in kernel/src/rpc/server.ts so this RPC never produces
	 * a MethodNotFound -32601 response (Pitfall 2 mitigation — that error class was the
	 * dominant renderer.log [error] noise source identified in 10-RESEARCH SC#5 audit).
	 */
	mcpListProviders(): Promise<McpListProvidersResult> {
		return this.sendWithTimeout(McpListProvidersRequest, {});
	}
	mcpAcceptProviderSchemaDrift(params: McpAcceptProviderSchemaDriftParams): Promise<McpAcceptProviderSchemaDriftResult> {
		return this.sendWithTimeout(McpAcceptProviderSchemaDriftRequest, params);
	}
	mcpReconnectProvider(params: McpReconnectProviderParams): Promise<McpReconnectProviderResult> {
		return this.sendWithTimeout(McpReconnectProviderRequest, params);
	}

	// Phase 7 Plan 07-07 — DRIFT-06 + DRIFT-01 + DRIFT-03 + DRIFT-04 + DRIFT-05 surfaces.
	recordContractOverride(params: RecordContractOverrideParams): Promise<RecordContractOverrideResult> {
		return this.sendWithTimeout(RecordContractOverrideRequest, params);
	}
	runDriftAndLock(params: RunDriftAndLockParams): Promise<RunDriftAndLockResult> {
		return this.sendWithTimeout(RunDriftAndLockRequest, params);
	}
	runRippleProgressive(params: RunRippleProgressiveParams): Promise<RunRippleProgressiveResult> {
		return this.sendWithTimeout(RunRippleProgressiveRequest, params);
	}

	/**
	 * Subscribe to graph.driftProgress notifications. tier-dispatch.ts wires this when a
	 * lock_trigger fires so the bridge can post first-degree partial reports to the webview
	 * BEFORE the runRippleProgressive RPC final response arrives.
	 *
	 * Returns a disposer that detaches the listener. When disposed, the listener is removed
	 * by reassigning to a no-op (vscode-jsonrpc 8.x lacks an off-handle from onNotification —
	 * the typical pattern is to keep a handler reference + check a 'disposed' flag).
	 */
	onDriftProgress(handler: (n: DriftProgressNotification) => void): () => void {
		if (!this.connection) {
			return () => undefined;
		}
		let active = true;
		this.connection.onNotification(DriftProgressNotificationType, (n) => {
			if (active) {
				handler(n);
			}
		});
		return () => { active = false; };
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
