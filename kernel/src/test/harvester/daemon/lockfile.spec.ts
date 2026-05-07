/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/daemon/lockfile.spec.ts — Phase 5 Plan 05-02 lockfile primitives.
//
// TELE-05 substrate: atomic creation, stale-pid detection, mode 0600 (POSIX), idempotent
// reads. ROADMAP SC #1 ('developer closes IDE; kernel survives') depends on these.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	atomicCreateLockfile,
	clearStaleLockfile,
	isPidAlive,
	readLockfile,
	writeLockfile,
	type LockfileContent,
} from '../../../daemon/lockfile.js';

function makeContent(pid = process.pid, port = 50001): LockfileContent {
	return {
		pid,
		rpc_port: port,
		auth_token: 'a'.repeat(64),
		started_at: new Date().toISOString(),
		version: '0.0.1',
	};
}

describe('TELE-05: lockfile primitives', () => {
	let tmp: string;
	let lockPath: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), 'goatide-lock-'));
		lockPath = join(tmp, 'nested', 'kernel.lock');
	});
	afterEach(() => {
		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('writeLockfile creates parent dir + file with mode 0600 (POSIX)', () => {
		writeLockfile(lockPath, makeContent());
		expect(existsSync(lockPath)).toBe(true);
		if (process.platform !== 'win32') {
			const mode = statSync(lockPath).mode & 0o777;
			expect(mode).toBe(0o600);
		}
	});

	it('readLockfile returns null on missing/corrupt', () => {
		expect(readLockfile(lockPath)).toBeNull();
		mkdirSync(join(tmp, 'corrupt'), { recursive: true });
		const corruptPath = join(tmp, 'corrupt', 'kernel.lock');
		writeFileSync(corruptPath, '{not valid json');
		expect(readLockfile(corruptPath)).toBeNull();
	});

	it('isPidAlive ESRCH detection', () => {
		expect(isPidAlive(99999999)).toBe(false);
		expect(isPidAlive(process.pid)).toBe(true);
	});

	it('clearStaleLockfile unlinks dead-pid lockfile, preserves alive-pid', () => {
		writeLockfile(lockPath, makeContent(99999999));
		clearStaleLockfile(lockPath);
		expect(existsSync(lockPath)).toBe(false);

		const alivePath = join(tmp, 'alive', 'kernel.lock');
		writeLockfile(alivePath, makeContent(process.pid));
		clearStaleLockfile(alivePath);
		expect(existsSync(alivePath)).toBe(true);
	});

	it('atomicCreateLockfile O_CREAT|O_EXCL — exactly one of two concurrent attempts wins', () => {
		const first = atomicCreateLockfile(lockPath, makeContent());
		const second = atomicCreateLockfile(lockPath, makeContent());
		expect([first, second].sort()).toStrictEqual(['created', 'exists']);
		expect(readLockfile(lockPath)?.pid).toBe(process.pid);
	});
});

describe('TELE-05: auth-token primitives', () => {
	it('generateAuthToken returns 64-char hex; calls produce distinct values; validateAuthToken constant-time-compares', async () => {
		const { generateAuthToken, validateAuthToken } = await import('../../../daemon/auth-token.js');
		const a = generateAuthToken();
		const b = generateAuthToken();
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(b).toMatch(/^[0-9a-f]{64}$/);
		expect(a).not.toBe(b);
		expect(validateAuthToken(a, a)).toBe(true);
		expect(validateAuthToken(a, b)).toBe(false);
		expect(validateAuthToken('short', a)).toBe(false);
	});
});

describe('TELE-05: port-discovery primitives', () => {
	it('bindEphemeralPort binds 127.0.0.1 with ephemeral port', async () => {
		const { bindEphemeralPort } = await import('../../../daemon/port-discovery.js');
		const { server, port } = await bindEphemeralPort();
		expect(port).toBeGreaterThan(1024);
		expect(port).toBeLessThan(65536);
		const addr = server.address();
		expect(addr).not.toBeNull();
		if (addr && typeof addr === 'object') {
			expect(addr.address).toBe('127.0.0.1');
		}
		await new Promise<void>(r => server.close(() => r()));
	});
});
