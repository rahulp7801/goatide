/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/daemon/second-opener-fence.spec.ts -- Phase 21 Plan 21-01 XREPO-01f.
//
// Validates the dbPath-keyed second-opener fence in startDaemon: a second call to
// startDaemon against the same graph.db (same canonical realpath) while the first daemon
// is alive MUST throw an Error whose message contains 'same graph.db'.
//
// Also validates (regression sentry) that a stale lockfile (dead pid) is reclaimed and
// a fresh startDaemon succeeds -- the dbPath fence ONLY fires on a live-pid collision.
//
// Pattern: mirrors tcp-rpc.spec.ts (openDatabase before startDaemon; separate lockfile
// path per test via mkdtempSync; opt out of JSONL watcher via claudeJsonlWatchPaths null).
//
// Grep alignment: 'second-opener-fence' (21-VALIDATION.md task 21-01-XREPO-01f).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, GraphDAO } from '../../../graph/index.js';
import { ReceiptDAO } from '../../../receipt/index.js';
import { startDaemon, type DaemonHandle } from '../../../daemon/index.js';
import { writeLockfile } from '../../../daemon/lockfile.js';

interface DaemonHarness {
	handle: DaemonHandle;
	dbHandle: ReturnType<typeof openDatabase>;
	tmp: string;
	lockfilePath: string;
}

async function startTestDaemon(tmp: string): Promise<DaemonHarness> {
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
		claudeJsonlWatchPaths: null,
		mcp: null,
	});
	return { handle, dbHandle, tmp, lockfilePath };
}

describe('Phase 21 XREPO-01f -- dbPath-keyed second-opener fence', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), 'goatide-fence-'));
	});

	afterEach(() => {
		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('second-opener-fence: second startDaemon against same dbPath rejects with same graph.db error', async () => {
		const harness1 = await startTestDaemon(tmp);
		try {
			const dbPath = join(tmp, 'graph.db');
			const dao2 = new GraphDAO(harness1.dbHandle.db);
			const receiptDao2 = new ReceiptDAO(harness1.dbHandle.db);
			// Second startDaemon against the same dbPath -- must reject with 'same graph.db'.
			await expect(
				startDaemon({
					dao: dao2,
					receiptDao: receiptDao2,
					sqlite: harness1.dbHandle.sqlite,
					dbPath,
					version: '0.0.1-test',
					lockfilePath: harness1.lockfilePath,
					claudeJsonlWatchPaths: null,
					mcp: null,
				}),
			).rejects.toThrow(/same graph\.db/);
		} finally {
			await harness1.handle.close();
			harness1.dbHandle.close();
		}
	});

	it('second-opener-fence: stale lockfile (dead pid) is reclaimed (regression sentry)', async () => {
		const tmp2 = mkdtempSync(join(tmpdir(), 'goatide-stale-'));
		try {
			const dbPath = join(tmp2, 'graph.db');
			const lockfilePath = join(tmp2, 'kernel.lock');
			mkdirSync(tmp2, { recursive: true });
			// Write a synthetic lockfile with a dead PID (PID 1 is init on POSIX and
			// unreachable from tests; on Windows PID 1 is the System idle process -- also
			// unreachable. Use a PID far beyond the OS limit so isPidAlive returns false).
			// 9_999_999 is > the max PID on all supported platforms (Linux: 4_194_304;
			// macOS: 99_999; Windows: 65_535).
			writeLockfile(lockfilePath, {
				pid: 9_999_999,
				rpc_port: 0,
				auth_token: 'a'.repeat(64),
				started_at: new Date().toISOString(),
				version: '0.0.1',
				db_path: dbPath,
			});
			// Create the DB so realpathSync works in startDaemon.
			const dbHandle = openDatabase(dbPath);
			const dao = new GraphDAO(dbHandle.db);
			const receiptDao = new ReceiptDAO(dbHandle.db);
			let handle: DaemonHandle | undefined;
			try {
				handle = await startDaemon({
					dao,
					receiptDao,
					sqlite: dbHandle.sqlite,
					dbPath,
					version: '0.0.1-test',
					lockfilePath,
					claudeJsonlWatchPaths: null,
					mcp: null,
				});
				// Stale-clear path engaged -- daemon started successfully.
				expect(typeof handle.port).toBe('number');
			} finally {
				if (handle) {
					await handle.close();
				}
				dbHandle.close();
			}
		} finally {
			try { rmSync(tmp2, { recursive: true, force: true }); } catch { /* best-effort */ }
		}
	});
});
