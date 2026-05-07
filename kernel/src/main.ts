/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/main.ts — Phase 3 (Plan 03-04) RPC daemon entry + Phase 5 (Plan 05-02) --daemon mode.
//
// Two modes:
//   - stdio (default; existing): goatide-cli child-process invocation. Reads stdin, writes
//     stdout. ALL log output → stderr (Pitfall 3).
//   - daemon (NEW; --daemon flag): long-lived detached process. Binds 127.0.0.1:0,
//     atomically writes lockfile with auth_token, gates all RPCs behind harvester.authenticate.
//
// CWD validation (Pitfall 10): in --daemon mode we refuse to start if process.cwd() looks
// like a workspace folder (contains .git/ or .vscode/). Without this guard a misconfigured
// spawn (e.g. detached:true without explicit cwd:homedir()) silently opens the DB inside
// a project tree, leaking graph state across workspaces.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, GraphDAO } from './graph/index.js';
import { ReceiptDAO } from './receipt/index.js';
import { resolveDbPath } from './cli/db-path.js';
import { createRpcServer } from './rpc/index.js';
import { startDaemon } from './daemon/index.js';

const isDaemon = process.argv.includes('--daemon');
const dbPath = process.env.GOATIDE_DB ?? resolveDbPath();

if (isDaemon) {
	validateCwdForDaemon();
	const handle = openDatabase(dbPath);
	const dao = new GraphDAO(handle.db);
	const receiptDao = new ReceiptDAO(handle.db);
	startDaemon({
		dao,
		receiptDao,
		sqlite: handle.sqlite,
		dbPath,
		version: '0.0.1',
		lockfilePath: process.env.GOATIDE_LOCKFILE_PATH,
	}).then((daemon) => {
		console.error(`[kernel] daemon up pid=${process.pid} db=${dbPath} port=${daemon.port}`);
		const shutdown = (signal: NodeJS.Signals): void => {
			console.error(`[kernel] received ${signal}, shutting daemon down cleanly`);
			daemon.close().then(() => {
				try { handle.close(); } catch { /* best-effort */ }
				process.exit(0);
			}).catch(() => process.exit(1));
		};
		process.on('SIGTERM', () => shutdown('SIGTERM'));
		process.on('SIGINT', () => shutdown('SIGINT'));
	}).catch((e) => {
		console.error(`[kernel] daemon startup failed: ${e instanceof Error ? e.message : String(e)}`);
		try { handle.close(); } catch { /* best-effort */ }
		process.exit(1);
	});
} else {
	const handle = openDatabase(dbPath);
	const dao = new GraphDAO(handle.db);
	const receiptDao = new ReceiptDAO(handle.db);

	const connection = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, dbPath });
	connection.listen();

	// STDERR — stdout is reserved for JSON-RPC framing (Pitfall 3).
	console.error(`[kernel] rpc up pid=${process.pid} db=${dbPath}`);

	const shutdown = (signal: NodeJS.Signals): void => {
		console.error(`[kernel] received ${signal}, exiting cleanly`);
		try {
			handle.close();
		} catch (e) {
			console.error(`[kernel] close error: ${e instanceof Error ? e.message : String(e)}`);
		}
		process.exit(0);
	};

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Refuse to start the daemon when CWD looks like a workspace folder. Set
 * GOATIDE_TEST_OVERRIDE_CWD=1 to bypass (used by integration tests that spawn the daemon
 * from inside the kernel checkout — kernel/.git is itself a workspace marker).
 */
function validateCwdForDaemon(): void {
	if (process.env.GOATIDE_TEST_OVERRIDE_CWD) {
		return;
	}
	const cwd = process.cwd();
	const looksLikeWorkspace = existsSync(join(cwd, '.git')) || existsSync(join(cwd, '.vscode'));
	if (looksLikeWorkspace) {
		throw new Error(
			`[kernel] refusing to start daemon in a workspace folder (cwd=${cwd}). ` +
			`The bridge spawn must pass cwd=homedir() (Pitfall 10). ` +
			`Set GOATIDE_TEST_OVERRIDE_CWD=1 to bypass for integration tests.`,
		);
	}
}
