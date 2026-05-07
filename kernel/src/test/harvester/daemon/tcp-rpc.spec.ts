/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/daemon/tcp-rpc.spec.ts — Phase 5 Plan 05-02 TCP transport
// + per-socket auth gate.
//
// Validates startDaemon end-to-end: bindEphemeralPort → atomic lockfile → TCP RPC
// server with auth gate. Drives a real TCP socket against the daemon and round-trips
// harvester.authenticate + a follow-up call.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as rpc from 'vscode-jsonrpc/node.js';
import Database from 'better-sqlite3';
import { openDatabase, GraphDAO } from '../../../graph/index.js';
import { ReceiptDAO } from '../../../receipt/index.js';
import { startDaemon, type DaemonHandle } from '../../../daemon/index.js';
import { AuthenticateRequest, HeartbeatRequest } from '../../../rpc/methods.js';

interface DaemonHarness {
	handle: DaemonHandle;
	dbHandle: ReturnType<typeof openDatabase>;
	tmp: string;
	lockfilePath: string;
}

async function startTestDaemon(): Promise<DaemonHarness> {
	const tmp = mkdtempSync(join(tmpdir(), 'goatide-tcp-'));
	const dbPath = join(tmp, 'graph.db');
	const lockfilePath = join(tmp, 'kernel.lock');
	const dbHandle = openDatabase(dbPath);
	const dao = new GraphDAO(dbHandle.db);
	const receiptDao = new ReceiptDAO(dbHandle.db);
	const handle = await startDaemon({
		dao,
		receiptDao,
		sqlite: dbHandle.sqlite,
		dbPath,
		version: '0.0.1-test',
		lockfilePath,
	});
	return { handle, dbHandle, tmp, lockfilePath };
}

async function connectClient(port: number): Promise<{ socket: net.Socket; connection: rpc.MessageConnection }> {
	const socket = await new Promise<net.Socket>((resolve, reject) => {
		const s = net.createConnection({ port, host: '127.0.0.1' });
		s.once('connect', () => resolve(s));
		s.once('error', reject);
	});
	const connection = rpc.createMessageConnection(
		new rpc.StreamMessageReader(socket),
		new rpc.StreamMessageWriter(socket),
	);
	connection.listen();
	return { socket, connection };
}

describe('TELE-05: daemon TCP transport + harvester.authenticate gate', () => {
	let harness: DaemonHarness;

	beforeEach(async () => {
		harness = await startTestDaemon();
	});
	afterEach(async () => {
		await harness.handle.close();
		try { harness.dbHandle.close(); } catch { /* best-effort */ }
		try { rmSync(harness.tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('binds TCP loopback + creates lockfile', async () => {
		expect(harness.handle.port).toBeGreaterThan(1024);
		expect(existsSync(harness.lockfilePath)).toBe(true);
	});

	it('first request MUST be harvester.authenticate; other requests rejected pre-auth', async () => {
		const { socket, connection } = await connectClient(harness.handle.port);
		try {
			let threw = false;
			try {
				await connection.sendRequest(HeartbeatRequest, {});
			} catch (e) {
				threw = true;
				expect((e as Error).message).toMatch(/authenticate/i);
			}
			expect(threw).toBe(true);
		} finally {
			connection.dispose();
			socket.destroy();
		}
	});

	it('correct token authenticates; subsequent RPCs succeed on same connection', async () => {
		const { socket, connection } = await connectClient(harness.handle.port);
		try {
			const auth = await connection.sendRequest(AuthenticateRequest, { token: harness.handle.authToken });
			expect(auth.ok).toBe(true);
			const hb = await connection.sendRequest(HeartbeatRequest, {});
			expect(hb.ok).toBe(true);
			expect(hb.pid).toBe(process.pid);
		} finally {
			connection.dispose();
			socket.destroy();
		}
	});

	it('wrong token closes connection; socket disconnects', async () => {
		const { socket, connection } = await connectClient(harness.handle.port);
		try {
			const closed = new Promise<void>((r) => socket.once('close', () => r()));
			let authThrew = false;
			try {
				await connection.sendRequest(AuthenticateRequest, { token: 'b'.repeat(64) });
			} catch {
				authThrew = true;
			}
			expect(authThrew).toBe(true);
			// Server-side dispose runs on setImmediate; socket should close shortly after.
			await Promise.race([
				closed,
				new Promise<void>((_, rej) => setTimeout(() => rej(new Error('socket close timeout')), 1000)),
			]);
		} finally {
			try { connection.dispose(); } catch { /* best-effort */ }
			try { socket.destroy(); } catch { /* best-effort */ }
		}
	});

	it('clean shutdown removes lockfile', async () => {
		expect(existsSync(harness.lockfilePath)).toBe(true);
		await harness.handle.close();
		expect(existsSync(harness.lockfilePath)).toBe(false);
	});

	it('rejects start when another live daemon already serves', async () => {
		const dbHandle2 = openDatabase(join(harness.tmp, 'graph2.db'));
		const dao2 = new GraphDAO(dbHandle2.db);
		const receiptDao2 = new ReceiptDAO(dbHandle2.db);
		let threw = false;
		try {
			await startDaemon({
				dao: dao2,
				receiptDao: receiptDao2,
				sqlite: dbHandle2.sqlite,
				dbPath: 'unused',
				version: '0.0.1-test',
				lockfilePath: harness.lockfilePath,
			});
		} catch (e) {
			threw = true;
			expect((e as Error).message).toMatch(/already serving/);
		} finally {
			dbHandle2.close();
		}
		expect(threw).toBe(true);
	});
});
