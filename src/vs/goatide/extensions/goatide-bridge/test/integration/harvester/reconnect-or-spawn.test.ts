/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/reconnect-or-spawn.test.ts
//
// Phase 5 Plan 05-02 — bridge KernelClient.ensureKernel reconnect-or-spawn flow tests.
// TELE-05 requires the bridge to (a) reconnect to an existing kernel-daemon when the
// lockfile points at an alive pid, (b) spawn a fresh detached daemon when no lockfile
// exists, (c) clear stale lockfiles + spawn fresh when the recorded pid is dead.

import * as assert from 'node:assert/strict';
import * as net from 'node:net';
import * as path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as rpc from 'vscode-jsonrpc/node.js';

import { KernelClient } from '../../../src/kernel/client.js';
import { AuthenticateRequest, HeartbeatRequest } from '../../../src/kernel/methods.js';

interface FakeDaemonHarness {
	port: number;
	authToken: string;
	close: () => Promise<void>;
}

/**
 * Spin up a TCP loopback server that accepts the harvester.authenticate handshake +
 * answers HeartbeatRequest. Used by Test 1 to simulate a still-alive kernel daemon
 * without spawning the real binary.
 */
async function startFakeDaemon(authToken: string): Promise<FakeDaemonHarness> {
	const server = net.createServer((socket) => {
		const reader = new rpc.StreamMessageReader(socket);
		const writer = new rpc.StreamMessageWriter(socket);
		const connection = rpc.createMessageConnection(reader, writer);
		let authed = false;
		connection.onRequest(AuthenticateRequest, (params) => {
			if (params.token !== authToken) {
				throw new Error('invalid token');
			}
			authed = true;
			return { ok: true };
		});
		connection.onRequest(HeartbeatRequest, () => {
			if (!authed) {
				throw new Error('not authenticated');
			}
			return { ok: true, pid: process.pid, db_path: '<fake>', uptime_ms: 0 };
		});
		socket.once('error', () => { try { connection.dispose(); } catch { /* best-effort */ } });
		connection.listen();
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject);
			resolve();
		});
	});
	const addr = server.address();
	if (!addr || typeof addr !== 'object') {
		throw new Error('startFakeDaemon: no address');
	}
	return {
		port: addr.port,
		authToken,
		close: () => new Promise<void>((r) => server.close(() => r())),
	};
}

describe('TELE-05: bridge reconnect-or-spawn flow', () => {
	const kernelMain = path.resolve(process.cwd(), '..', '..', '..', '..', '..', 'kernel', 'dist', 'main.js');

	let tmp: string;
	let lockfilePath: string;

	beforeEach(() => {
		tmp = mkdtempSync(path.join(tmpdir(), 'goatide-bridge-spawn-'));
		lockfilePath = path.join(tmp, 'kernel.lock');
	});
	afterEach(() => {
		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('reuses existing kernel via lockfile when pid alive (Mandate-A: kernel survived IDE close)', async () => {
		const authToken = 'a'.repeat(64);
		const fake = await startFakeDaemon(authToken);
		try {
			const lock = {
				pid: process.pid,        // process.pid is guaranteed alive.
				rpc_port: fake.port,
				auth_token: authToken,
				started_at: new Date().toISOString(),
				version: '0.0.1-test',
			};
			writeFileSync(lockfilePath, JSON.stringify(lock));

			const client = new KernelClient({ requestTimeoutMs: 2_000 });
			try {
				await client.ensureKernel({ kernelPath: kernelMain, lockfilePath });
				assert.strictEqual(client.isConnected(), true);
				const hb = await client.heartbeat();
				assert.strictEqual(hb.ok, true);
			} finally {
				client.dispose();
			}
		} finally {
			await fake.close();
		}
	});

	it('clears stale lockfile when pid dead and would proceed to spawn (verified by lockfile.unlink + spawn-failure on bogus path)', async () => {
		const lock = {
			pid: 99999999,            // overwhelmingly likely to be dead.
			rpc_port: 1,              // would refuse anyway.
			auth_token: 'b'.repeat(64),
			started_at: new Date().toISOString(),
			version: '0.0.1-test',
		};
		writeFileSync(lockfilePath, JSON.stringify(lock));

		const client = new KernelClient({ requestTimeoutMs: 1_000, lockfilePollTimeoutMs: 1_500 });
		// Use a non-existent kernel path so the spawn doesn't actually write a lockfile —
		// pollForLockfile will time out, surfacing the spawn-failure path. The important
		// assertion is that the stale lockfile was cleared (it was, since spawn was attempted).
		const bogusKernel = path.join(tmp, 'no-such-kernel.js');
		let threw = false;
		try {
			await client.ensureKernel({ kernelPath: bogusKernel, lockfilePath });
		} catch (e) {
			threw = true;
			assert.match((e as Error).message, /pollForLockfile: timed out|ENOENT|EACCES/);
		} finally {
			client.dispose();
		}
		assert.strictEqual(threw, true);
		// Stale lockfile must have been cleared by the dead-pid branch before spawn.
		const { existsSync } = await import('node:fs');
		assert.strictEqual(existsSync(lockfilePath), false);
	});

	it('spawns detached kernel when no lockfile present (full integration via real kernel/dist/main.js)', async () => {
		const dbPath = path.join(tmp, 'graph.db');
		const client = new KernelClient({ requestTimeoutMs: 5_000, lockfilePollTimeoutMs: 8_000 });

		// Sentinel env so the kernel doesn't refuse to start in our test cwd.
		const prevTestOverride = process.env.GOATIDE_TEST_OVERRIDE_CWD;
		process.env.GOATIDE_TEST_OVERRIDE_CWD = '1';

		let kernelPidForCleanup: number | undefined;
		try {
			await client.ensureKernel({ kernelPath: kernelMain, dbPath, lockfilePath });
			assert.strictEqual(client.isConnected(), true);
			const hb = await client.heartbeat();
			assert.strictEqual(hb.ok, true);
			kernelPidForCleanup = hb.pid;
		} finally {
			client.dispose();
			if (prevTestOverride === undefined) {
				delete process.env.GOATIDE_TEST_OVERRIDE_CWD;
			} else {
				process.env.GOATIDE_TEST_OVERRIDE_CWD = prevTestOverride;
			}
			if (kernelPidForCleanup) {
				try { process.kill(kernelPidForCleanup, 'SIGTERM'); } catch { /* best-effort */ }
			}
		}
	}).timeout(20_000);
});
