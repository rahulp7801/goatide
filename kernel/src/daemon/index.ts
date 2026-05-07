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
import { bindEphemeralPort, createTcpRpcServer } from './port-discovery.js';
import { generateAuthToken } from './auth-token.js';
import { atomicCreateLockfile, clearStaleLockfile, isPidAlive, readLockfile, type LockfileContent } from './lockfile.js';
import { resolveLockfilePath } from './paths.js';
import type { GraphDAO } from '../graph/index.js';
import type { ReceiptDAO } from '../receipt/index.js';
import type Database from 'better-sqlite3';
import { bindHandlersForTcp, type SocketAuthState } from '../rpc/server.js';

export interface StartDaemonArgs {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	dbPath: string;
	version: string;
	/** Override lockfile path for tests. */
	lockfilePath?: string;
}

export interface DaemonHandle {
	port: number;
	authToken: string;
	lockfilePath: string;
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
		});
		connection.listen();
	});

	let closed = false;
	const close = async (): Promise<void> => {
		if (closed) {
			return;
		}
		closed = true;
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

	return { port, authToken, lockfilePath, close };
}

export { resolveLockfilePath } from './paths.js';
export { readLockfile, isPidAlive, clearStaleLockfile, type LockfileContent } from './lockfile.js';
