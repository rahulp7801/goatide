/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/daemon/ide-close-survival.spec.ts — Phase 5 Plan 05-02.
//
// ROADMAP SC #1 substrate: spawn detached kernel via the production triple-pattern
// (detached:true + stdio:'ignore' + child.unref()), kill the parent simulator, assert the
// kernel pid is still alive over a 2-second polling window, then connect via TCP +
// authenticate + heartbeat round-trip. Plan 05-08 wires the full SC #1 walkthrough end-to-end
// (developer closes IDE → CLI session in another window → re-open IDE → observation
// is present). This spec verifies the kernel-process layer.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as net from 'node:net';
import * as rpc from 'vscode-jsonrpc/node.js';
import { AuthenticateRequest, HeartbeatRequest } from '../../../rpc/methods.js';
import type { LockfileContent } from '../../../daemon/lockfile.js';

describe('TELE-05: IDE-close survival (ROADMAP SC #1 substrate)', () => {
	it('spawns detached kernel that survives parent death + RPC reachable via lockfile', async () => {
		const kernelMain = resolve(process.cwd(), 'dist', 'main.js');
		expect(existsSync(kernelMain)).toBe(true);

		const tmp = mkdtempSync(join(tmpdir(), 'goatide-ide-close-'));
		const tmpPidFile = join(tmp, 'kernel.pid');
		const tmpDb = join(tmp, 'graph.db');
		const lockfilePath = join(tmp, 'kernel.lock');

		// Bridge-simulator: a Node script that spawns the kernel detached and exits. The
		// kernel must outlive this simulator process (Pitfall 3 — detached:true +
		// stdio:'ignore' + unref() are all required).
		const escape = (p: string): string => p.replace(/\\/g, '\\\\');
		const simulatorCode = `
			const { spawn } = require('node:child_process');
			const { writeFileSync } = require('node:fs');
			const child = spawn(${JSON.stringify(process.execPath)}, [${JSON.stringify(kernelMain)}, '--daemon'], {
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore'],
				env: {
					...process.env,
					GOATIDE_DB: '${escape(tmpDb)}',
					GOATIDE_TEST_OVERRIDE_CWD: '1',
					GOATIDE_LOCKFILE_PATH: '${escape(lockfilePath)}',
				},
				cwd: require('node:os').homedir(),
			});
			child.unref();
			writeFileSync('${escape(tmpPidFile)}', String(child.pid));
			process.exit(0);
		`;

		const simulator = spawnSync(process.execPath, ['-e', simulatorCode], { stdio: 'pipe' });
		expect(simulator.status).toBe(0);

		// Wait for the kernel to write its lockfile (poll for up to 5 seconds).
		const lockfileReady = await pollUntil(() => existsSync(lockfilePath), 5000, 100);
		expect(lockfileReady).toBe(true);

		const pid = parseInt(readFileSync(tmpPidFile, 'utf8'), 10);
		expect(pid).toBeGreaterThan(0);

		// Verify the simulator process is gone (parent already exited).
		expect(isPidAlive(simulator.pid ?? -1)).toBe(false);

		// Poll the kernel pid every 100ms for 2 seconds; kernel MUST stay alive.
		const aliveChecks: boolean[] = [];
		for (let i = 0; i < 20; i++) {
			aliveChecks.push(isPidAlive(pid));
			await new Promise((r) => setTimeout(r, 100));
		}
		expect(aliveChecks.every(Boolean)).toBe(true);

		// Read lockfile + connect via TCP + authenticate + heartbeat.
		const lock = JSON.parse(readFileSync(lockfilePath, 'utf8')) as LockfileContent;
		expect(lock.pid).toBe(pid);
		expect(lock.rpc_port).toBeGreaterThan(1024);

		const socket = await new Promise<net.Socket>((resolveSock, rej) => {
			const s = net.createConnection({ port: lock.rpc_port, host: '127.0.0.1' });
			s.once('connect', () => resolveSock(s));
			s.once('error', rej);
		});
		const connection = rpc.createMessageConnection(
			new rpc.StreamMessageReader(socket),
			new rpc.StreamMessageWriter(socket),
		);
		connection.listen();
		try {
			const auth = await connection.sendRequest(AuthenticateRequest, { token: lock.auth_token });
			expect(auth.ok).toBe(true);
			const hb = await connection.sendRequest(HeartbeatRequest, {});
			expect(hb.ok).toBe(true);
			expect(hb.pid).toBe(pid);
		} finally {
			connection.dispose();
			socket.destroy();
		}

		// Cleanup: terminate the kernel.
		try { process.kill(pid, 'SIGTERM'); } catch { /* best-effort */ }

		// On POSIX, SIGTERM gives the kernel a chance to run its cleanup hook and unlink
		// the lockfile. On Windows, process.kill with any signal is uncatchable — the
		// lockfile is left behind and the bridge's reconnect-or-spawn flow detects + clears
		// it via isPidAlive on next launch (the recovery path). Assert kernel-pid is dead
		// (verifies the kill landed); the lockfile-cleanup assertion is POSIX-only.
		const dead = await pollUntil(() => !isPidAlive(pid), 3000, 100);
		expect(dead).toBe(true);
		if (process.platform !== 'win32') {
			const cleaned = await pollUntil(() => !existsSync(lockfilePath), 3000, 100);
			expect(cleaned).toBe(true);
		}

		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
	}, 30_000);
});

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') {
			return false;
		}
		if (code === 'EPERM') {
			return true;
		}
		return false;
	}
}

async function pollUntil(predicate: () => boolean, timeoutMs: number, stepMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) {
			return true;
		}
		await new Promise((r) => setTimeout(r, stepMs));
	}
	return predicate();
}
