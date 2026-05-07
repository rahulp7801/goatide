/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/daemon/index.ts — Phase 5 (Plan 05-02) startDaemon entry point.
//
// Wires lockfile + port-discovery + auth-token + RPC server. Owns the lockfile
// lifecycle (atomic create on start, unlink on clean shutdown) and the per-socket auth
// gate (first request MUST be harvester.authenticate; subsequent requests pass through).
//
// The TCP-mode RPC server reuses the same handler-binding logic as stdio mode via
// kernel/src/rpc/server.ts createKernelRpcServer factory.

import * as net from 'node:net';
import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bindEphemeralPort, createTcpRpcServer } from './port-discovery.js';
import { generateAuthToken } from './auth-token.js';
import { atomicCreateLockfile, clearStaleLockfile, isPidAlive, readLockfile, type LockfileContent } from './lockfile.js';
import { resolveLockfilePath } from './paths.js';
import type { GraphDAO } from '../graph/index.js';
import type { ReceiptDAO } from '../receipt/index.js';
import type Database from 'better-sqlite3';
import { bindHandlersForTcp, type SocketAuthState } from '../rpc/server.js';
import { OffsetsDao } from '../harvester/offsets.js';
import { submitRawObservation, type HarvesterDeps } from '../harvester/index.js';
import { startClaudeJsonlWatcher, type StopClaudeJsonlWatcher } from '../harvester/watchers/claude-jsonl.js';
import { enrichGitCommitObservation } from '../harvester/watchers/git.js';

export interface StartDaemonArgs {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	dbPath: string;
	version: string;
	/** Override lockfile path for tests. */
	lockfilePath?: string;
	/**
	 * Override JSONL watch paths for tests. Production defaults to
	 * `<homedir>/.claude/projects/**\/*.jsonl` per TELE-01. Pass `null` to opt out of
	 * starting the watcher entirely (tcp-rpc.spec.ts runs against a temp DB without
	 * touching real Claude transcripts).
	 */
	claudeJsonlWatchPaths?: readonly string[] | null;
}

export interface DaemonHandle {
	port: number;
	authToken: string;
	lockfilePath: string;
	harvesterDeps: HarvesterDeps;
	close: () => Promise<void>;
}

/**
 * Start the kernel daemon: bind ephemeral loopback port, generate auth token, atomically
 * create lockfile (clearing stale lockfile if previous kernel pid is dead), wire RPC
 * server with auth gate, register clean-shutdown handlers.
 *
 * Throws if another live kernel is already serving (caller decides to exit cleanly).
 */
export async function startDaemon(args: StartDaemonArgs): Promise<DaemonHandle> {
	const lockfilePath = args.lockfilePath ?? resolveLockfilePath();
	const authToken = generateAuthToken();

	// Bind first so we have the port for the lockfile.
	const { server, port } = await bindEphemeralPort();

	const content: LockfileContent = {
		pid: process.pid,
		rpc_port: port,
		auth_token: authToken,
		started_at: new Date().toISOString(),
		version: args.version,
	};

	// Atomic-create with one stale-clear retry. Two concurrent kernels racing here will
	// see one 'created' and one 'exists'; the 'exists' loser reads the existing lockfile
	// and decides whether to clear-and-retry (dead pid) or surrender (live pid).
	let creationResult = atomicCreateLockfile(lockfilePath, content);
	if (creationResult === 'exists') {
		const existing = readLockfile(lockfilePath);
		if (existing && isPidAlive(existing.pid)) {
			await new Promise<void>((r) => server.close(() => r()));
			throw new Error(`startDaemon: another kernel daemon is already serving (pid=${existing.pid}, port=${existing.rpc_port})`);
		}
		// Stale (dead pid or corrupt) — clear + retry once.
		clearStaleLockfile(lockfilePath);
		creationResult = atomicCreateLockfile(lockfilePath, content);
		if (creationResult === 'exists') {
			await new Promise<void>((r) => server.close(() => r()));
			throw new Error(`startDaemon: lockfile race lost on retry (pid=${process.pid})`);
		}
	}

	// Phase 5 Plan 05-03 — harvester deps + JSONL watcher bootstrap. The deps bag is
	// shared between in-process watchers (JSONL) and the cross-process RPC handler
	// (bridge → harvester.submitObservation, registered by bindHandlersForTcp via
	// args.harvesterDeps closure resolution).
	const offsetsDao = new OffsetsDao(args.sqlite);
	const harvesterDeps: HarvesterDeps = {
		enrichGit: enrichGitCommitObservation,
		// filter/promoter/liveness intentionally undefined here — Plans 05-05/06/07 wire them.
	};

	// Wire each incoming socket: per-connection auth state map, first-request must be
	// authenticate, subsequent requests gated.
	const sockets = new Set<net.Socket>();
	createTcpRpcServer(server, (socket, connection) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
		const authState: SocketAuthState = { authenticated: false };
		bindHandlersForTcp({
			connection,
			socket,
			authState,
			expectedToken: authToken,
			dao: args.dao,
			receiptDao: args.receiptDao,
			sqlite: args.sqlite,
			dbPath: args.dbPath,
			harvesterDeps,
		});
		connection.listen();
	});

	// Start the Claude JSONL watcher unless the test harness opts out via null. The
	// 05-RESEARCH.md ## Pattern: Tail Observer with Persisted Offset says watch
	// ~/.claude/projects/**\/*.jsonl. Tests pass an explicit temp path.
	let stopJsonlWatcher: StopClaudeJsonlWatcher | null = null;
	if (args.claudeJsonlWatchPaths !== null) {
		const watchPaths = args.claudeJsonlWatchPaths
			?? [join(homedir(), '.claude', 'projects', '**', '*.jsonl')];
		try {
			stopJsonlWatcher = await startClaudeJsonlWatcher({
				watchPaths,
				offsets: offsetsDao,
				submit: (obs) => submitRawObservation(obs, harvesterDeps),
			});
		} catch (e) {
			// Watcher startup failure is non-fatal: the daemon still serves RPC; the
			// bridge can submit observations directly. Log to stderr (kernel.log).
			console.error(`[daemon] startClaudeJsonlWatcher failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	let closed = false;
	const close = async (): Promise<void> => {
		if (closed) {
			return;
		}
		closed = true;
		// Stop watchers first so they don't try to submit while sockets are tearing down.
		if (stopJsonlWatcher) {
			try { await stopJsonlWatcher(); } catch { /* best-effort */ }
		}
		// Destroy all open sockets; close server.
		for (const s of sockets) {
			try { s.destroy(); } catch { /* best-effort */ }
		}
		await new Promise<void>((r) => server.close(() => r()));
		// Only unlink the lockfile if it still belongs to us — defense against the rare
		// case where another daemon overwrote ours during shutdown (shouldn't happen,
		// but cheap to verify).
		try {
			const current = readLockfile(lockfilePath);
			if (current && current.pid === process.pid && existsSync(lockfilePath)) {
				unlinkSync(lockfilePath);
			}
		} catch { /* best-effort */ }
	};

	const cleanup = (): void => {
		void close();
	};
	process.once('SIGTERM', cleanup);
	process.once('SIGINT', cleanup);
	process.once('beforeExit', cleanup);

	return { port, authToken, lockfilePath, harvesterDeps, close };
}

export { resolveLockfilePath } from './paths.js';
export { readLockfile, isPidAlive, clearStaleLockfile, type LockfileContent } from './lockfile.js';
