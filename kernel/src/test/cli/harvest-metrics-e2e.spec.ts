/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/cli/harvest-metrics-e2e.spec.ts
//
// Phase 10 Plan 10-03 (Wave 1) — LIVE end-to-end SC#4 closure for BRIDGE-POLISH-04.
// Replaces the Plan 10-00 it.skip stub. The flow this guards:
//
//   1. Spawn the kernel daemon as a child process against an isolated GOATIDE_DB scratch.
//   2. Poll the lockfile until { auth_token, rpc_port } are available.
//   3. Open a TCP RPC connection, authenticate, seed a ContractNode via graph.proposeEdit
//      preconditions (we hand-seed via the same SQLite handle the daemon owns — see
//      seedContractNodeDirect — to avoid a second `proposeEdit` round-trip we don't need
//      for the wire-path assertion).
//   4. Send graph.recordContractOverride — this is the production-path RPC that bumps
//      harvest_metrics_daily.contract_overrides for source='canvas' on the override's
//      UTC date.
//   5. Close the RPC connection. SIGTERM the daemon. Wait for the lockfile to disappear
//      so we know the daemon released its DB lock.
//   6. spawnSync `goatide-cli harvest metrics --days 7` against the SAME GOATIDE_DB.
//   7. Assert stdout matches the verbatim non-zero `canvas overrides (last 7d): <N>`
//      footer shape captured in the reconnaissance step (W4 fix — regex derived from
//      real CLI output, not guessed).
//
// CAPTURED 2026-05-10 (Task 1 sub-step 0 reconnaissance — hand-seeded HarvestMetricsDao,
// invoked `node dist/cli/index.js harvest metrics --days 7` with GOATIDE_NOW_OVERRIDE_ISO
// pinned to 2026-05-10T12:00:00Z, captured verbatim stdout):
//
//   date_utc    source  submitted  rejected_by_filter  promoted_to_node  accept_rate  overrides
//   ----------  ------  ---------  ------------------  ----------------  -----------  ---------
//   2026-05-10  canvas  0          0                   0                 —            1
//
//   canvas overrides (last 7d): 1
//
// The regex below targets the 7d-rollup footer line (last non-empty stdout row). Format:
// `canvas overrides (last <days>d): <N>` where the closure requirement is N >= 1. The
// rollup line is the most stable assertion target — the table header / row would also
// match but couples the assertion to column alignment. Regex written to be insensitive
// to whitespace count / `--days` value but strict about the non-zero count tail.
//
// GOATIDE_NOW_OVERRIDE_ISO pins both daemon and CLI clocks to 2026-05-10T12:00:00Z so
// the UTC date the daemon writes (`dateUtcFromMs(now)` in metrics.ts) matches the UTC
// date the CLI reads (`queryLastDays(days, now)`). Without this pin, a test running
// across local-midnight would see the daemon write to tomorrow's UTC row while the CLI
// reads today's window — exactly the H2 hypothesis the plan calls out.

import { describe, it, beforeEach, afterEach, beforeAll, expect } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import * as net from 'node:net';
import * as rpc from 'vscode-jsonrpc/node.js';
import { openDatabase } from '../../graph/db.js';
import { GraphDAO } from '../../graph/dao.js';
import {
	AuthenticateRequest,
	RecordContractOverrideRequest,
} from '../../rpc/methods.js';

/** dist artifacts the test depends on. Kernel build must run before vitest. */
const KERNEL_DIST_DIR = resolve(__dirname, '..', '..', '..', 'dist');
const DAEMON_ENTRY = join(KERNEL_DIST_DIR, 'main.js');
const CLI_ENTRY = join(KERNEL_DIST_DIR, 'cli', 'index.js');

/** Fixed wall-clock reference so daemon + CLI agree on `dateUtcFromMs(now)`. */
const PINNED_NOW_ISO = '2026-05-10T12:00:00Z';

beforeAll(() => {
	if (!existsSync(DAEMON_ENTRY)) {
		throw new Error(`daemon entry missing at ${DAEMON_ENTRY}; run 'npm run build' before vitest.`);
	}
	if (!existsSync(CLI_ENTRY)) {
		throw new Error(`CLI entry missing at ${CLI_ENTRY}; run 'npm run build' before vitest.`);
	}
});

interface DaemonLockfile {
	pid: number;
	rpc_port: number;
	auth_token: string;
	started_at: string;
	version: string;
}

/**
 * Poll the lockfile path until a complete JSON payload is readable. Bounded by `timeoutMs`
 * (default 15s — cold-start budget per BRIDGE-RT-03). Throws on timeout so the test fails
 * with a clear "daemon didn't come up" signal instead of a downstream socket error.
 */
async function waitForLockfile(path: string, timeoutMs: number): Promise<DaemonLockfile> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (existsSync(path)) {
			try {
				const raw = readFileSync(path, 'utf8');
				const parsed = JSON.parse(raw) as Partial<DaemonLockfile>;
				if (
					typeof parsed.pid === 'number' &&
					typeof parsed.rpc_port === 'number' &&
					typeof parsed.auth_token === 'string'
				) {
					return parsed as DaemonLockfile;
				}
			} catch {
				// File may be mid-write; retry.
			}
		}
		await new Promise<void>((r) => setTimeout(r, 50));
	}
	throw new Error(`waitForLockfile: timeout after ${timeoutMs}ms at ${path}`);
}

/**
 * Wait for the lockfile to disappear after SIGTERM so we know the daemon released its
 * DB lock before the CLI subprocess opens it (Pitfall 4 from 10-RESEARCH: concurrent DB
 * opens land in SQLite SQLITE_BUSY territory under load).
 */
async function waitForLockfileGone(path: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!existsSync(path)) {
			return;
		}
		await new Promise<void>((r) => setTimeout(r, 50));
	}
	// Non-fatal: daemon may have left a stale lockfile on a hard kill; the CLI is read-only
	// so SQLite WAL mode tolerates it.
}

/**
 * Hand-seed a ContractNode directly via the GraphDAO (no RPC round-trip). The kernel daemon
 * holds the DB connection open during its lifetime; we open a SEPARATE connection here to
 * insert the contract row BEFORE starting the daemon. SQLite WAL mode permits this — the
 * daemon will see the row on first query because it opens after our handle closes.
 *
 * Returns the contract node id (ULID) the test will pass as `contract_node_id` to
 * graph.recordContractOverride.
 */
function seedContractNodeDirect(dbPath: string): string {
	const handle = openDatabase(dbPath);
	try {
		const dao = new GraphDAO(handle.db);
		const { id } = dao.seed({
			payload: {
				kind: 'ContractNode',
				body: '# Test contract\n\nfor BRIDGE-POLISH-04 e2e wire-path verification.',
				anchor: { file: 'src/test/fixtures/contract.md' },
				contract_path: 'src/test/fixtures/contract.md',
				patterns: [],
			},
			provenance: {
				source: 'cli',
				actor: 'bridge-polish-04-e2e-test',
			},
		});
		return id;
	} finally {
		handle.close();
	}
}

describe('BRIDGE-POLISH-04: harvest metrics shows non-zero contract_overrides after RPC', () => {
	let scratch: string;
	let dbPath: string;
	let lockfilePath: string;
	let daemon: ChildProcess | undefined;

	beforeEach(() => {
		scratch = mkdtempSync(join(tmpdir(), 'goatide-e2e-'));
		dbPath = join(scratch, 'graph.db');
		lockfilePath = join(scratch, 'kernel.lock');
	});

	afterEach(async () => {
		if (daemon && !daemon.killed) {
			daemon.kill('SIGTERM');
			// Best-effort wait for exit so the DB lock is released before scratch cleanup.
			await new Promise<void>((r) => {
				if (!daemon) {
					r();
					return;
				}
				daemon.once('exit', () => r());
				setTimeout(() => r(), 3000);
			});
			daemon = undefined;
		}
		if (scratch && existsSync(scratch)) {
			try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort */ }
		}
	});

	it('end-to-end: bridge RPC -> metric write -> CLI surfaces non-zero count', async () => {
		// 1. Seed the ContractNode BEFORE daemon start (separate DB handle; closes
		//    before daemon opens its own).
		const contractNodeId = seedContractNodeDirect(dbPath);

		// 2. Spawn the kernel daemon. cwd=homedir() to satisfy validateCwdForDaemon —
		//    we ALSO set GOATIDE_TEST_OVERRIDE_CWD=1 as belt-and-suspenders in case the
		//    test runner's homedir happens to contain `.git` (e.g. dotfiles repo).
		daemon = spawn(process.execPath, [DAEMON_ENTRY, '--daemon'], {
			cwd: homedir(),
			env: {
				...process.env,
				GOATIDE_DB: dbPath,
				GOATIDE_LOCKFILE_PATH: lockfilePath,
				GOATIDE_TEST_OVERRIDE_CWD: '1',
				GOATIDE_NOW_OVERRIDE_ISO: PINNED_NOW_ISO,
				// Opt out of MCP HTTP listener — we don't need MCP for this test and the
				// constitutional port 7345 may already be bound.
				GOATIDE_MCP_DISABLED: '1',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		// Capture daemon stderr for diagnostics if the test fails (helps debug spawn issues).
		const daemonStderr: string[] = [];
		daemon.stderr?.on('data', (chunk: Buffer) => {
			daemonStderr.push(chunk.toString('utf8'));
		});

		// 3. Wait for the lockfile.
		let lock: DaemonLockfile;
		try {
			lock = await waitForLockfile(lockfilePath, 15_000);
		} catch (e) {
			throw new Error(
				`Daemon failed to write lockfile within 15s. Daemon stderr:\n${daemonStderr.join('')}\n` +
				`Original error: ${e instanceof Error ? e.message : String(e)}`,
			);
		}

		// 4. Open TCP socket + vscode-jsonrpc connection.
		const socket = await new Promise<net.Socket>((res, rej) => {
			const s = net.createConnection({ port: lock.rpc_port, host: '127.0.0.1' });
			s.once('connect', () => res(s));
			s.once('error', rej);
		});
		const connection = rpc.createMessageConnection(
			new rpc.StreamMessageReader(socket),
			new rpc.StreamMessageWriter(socket),
		);
		connection.listen();

		try {
			// 5. Authenticate.
			const authResult = await connection.sendRequest(AuthenticateRequest, { token: lock.auth_token });
			expect(authResult.ok).toBe(true);

			// 6. Send graph.recordContractOverride — this is the production RPC the bridge
			//    save-gate override flow invokes. The handler:
			//      (a) seeds an Attempt(attempt_kind='contract_override') node,
			//      (b) writes a 'references' edge Attempt -> ContractNode,
			//      (c) bumps harvest_metrics_daily.contract_overrides for source='canvas'
			//          on today's UTC date — but ONLY IF ctx.metrics is wired (H1 hypothesis).
			const overrideResult = await connection.sendRequest(RecordContractOverrideRequest, {
				change_id: 'test-change-' + Date.now(),
				contract_node_id: contractNodeId,
				section_name: 'security',
				note: 'BRIDGE-POLISH-04 e2e: override fired to verify metric increments end-to-end.',
			});
			expect(typeof overrideResult.attempt_node_id).toBe('string');
			expect(overrideResult.attempt_node_id.length).toBeGreaterThan(0);
		} finally {
			// 7. Close the RPC channel.
			try { connection.dispose(); } catch { /* best-effort */ }
			try { socket.destroy(); } catch { /* best-effort */ }
		}

		// 8. SIGTERM the daemon + wait for it to exit + lockfile to be removed. This
		//    releases the SQLite write lock so the CLI subprocess can open the DB.
		if (daemon && !daemon.killed) {
			daemon.kill('SIGTERM');
			await new Promise<void>((r) => {
				if (!daemon) {
					r();
					return;
				}
				daemon.once('exit', () => r());
				setTimeout(() => r(), 5_000);
			});
		}
		await waitForLockfileGone(lockfilePath, 3_000);

		// 9. spawnSync goatide-cli harvest metrics against the same GOATIDE_DB. Same
		//    GOATIDE_NOW_OVERRIDE_ISO so the CLI reads the same UTC date the daemon wrote.
		const cliResult = spawnSync(process.execPath, [CLI_ENTRY, 'harvest', 'metrics', '--days', '7'], {
			env: {
				...process.env,
				GOATIDE_DB: dbPath,
				GOATIDE_NOW_OVERRIDE_ISO: PINNED_NOW_ISO,
			},
			encoding: 'utf8',
		});

		// 10. Closure assertion. Regex derived from the verbatim CLI output captured during
		//     Task 1 sub-step 0 reconnaissance (see top-of-file comment block). Matches the
		//     7d-rollup footer line `canvas overrides (last 7d): <N>` where N >= 1.
		//
		//     If this assertion FAILS, the closure path forks to Task 2 path-b (a real wire-
		//     level bug exists — most-likely H1 per 10-RESEARCH).
		const SEVEN_DAY_ROLLUP_NONZERO = /canvas overrides \(last 7d\):\s*[1-9][0-9]*/;
		expect({
			code: cliResult.status,
			stdoutHas7dRollupNonZero: SEVEN_DAY_ROLLUP_NONZERO.test(cliResult.stdout ?? ''),
		}).toEqual({
			code: 0,
			stdoutHas7dRollupNonZero: true,
		});
	}, 30_000);
});
