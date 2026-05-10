/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 spike: SINON_RESOLVES=true
//
// src/vs/goatide/extensions/goatide-bridge/test/integration/kernel/spawn-cwd.test.ts
//
// Phase 8 Plan 08-02 (Wave 1) — BRIDGE-RT-02 defensive-spawn-cwd live tests.
//
// Defensive spawn(cwd=resolveGoatideConfigDir()) with sentinel env so the kernel daemon
// never inherits a workspace cwd that contains a `.git` folder (Pitfall 10: spawning with
// `cwd: homedir()` collides with `~/.git` and the kernel refuses to start). Two layers:
//
//   1. UNIT (sinon stubs `node:child_process.spawn`) — pure shape-of-arguments assertions:
//      cwd, env.GOATIDE_TEST_OVERRIDE_CWD=1, env.GOATIDE_DB/LOCKFILE_PATH preservation.
//   2. META (real-spawn) — exercises the daemon under a workspace-looking cwd. Pattern
//      mirrors kernel/src/test/harvester/daemon/ide-close-survival.spec.ts:31-77 (boots a
//      throwaway `~/.goatide-fake-cwd/.git/` skeleton, spawns the bridge ensureKernel path
//      against it, asserts daemon comes up).

import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import sinon from 'sinon';

import { KernelClient } from '../../../src/kernel/client.js';
import { resolveGoatideConfigDir } from '../../../src/kernel/lockfile-reader.js';

// Use CommonJS require to align with client.ts — sinon needs a mutable property
// descriptor, which only the require-wrapped namespace exposes (the ESM-namespace wrapper
// from `import * as cp` is frozen and not stubbable).
const childProcess: typeof import('node:child_process') = require('node:child_process');

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = path.dirname(__filename_local);

describe('BRIDGE-RT-02 unit: defensive spawn shape', () => {
	let spawnStub: sinon.SinonStub;
	const fakeChild = { unref: () => { /* noop */ }, on: () => { /* noop */ }, pid: 99999 } as unknown as childProcess.ChildProcess;

	beforeEach(() => {
		spawnStub = sinon.stub(childProcess, 'spawn').returns(fakeChild);
	});

	afterEach(() => {
		spawnStub.restore();
	});

	it('passes cwd=resolveGoatideConfigDir() to spawn()', async () => {
		const client = new KernelClient();
		// Drive spawnDetachedKernel directly via cast — bypasses the lockfile poll, which
		// is irrelevant for the spawn-call shape assertion.
		(client as unknown as { kernelPath: string }).kernelPath = '/fake/kernel/main.js';
		await (client as unknown as { spawnDetachedKernel: () => Promise<void> }).spawnDetachedKernel();

		assert.equal(spawnStub.callCount, 1);
		const opts = spawnStub.firstCall.args[2] as childProcess.SpawnOptions;
		assert.equal(opts.cwd, resolveGoatideConfigDir());
	});

	it('passes env.GOATIDE_TEST_OVERRIDE_CWD=1 to spawn()', async () => {
		const client = new KernelClient();
		(client as unknown as { kernelPath: string }).kernelPath = '/fake/kernel/main.js';
		await (client as unknown as { spawnDetachedKernel: () => Promise<void> }).spawnDetachedKernel();

		assert.equal(spawnStub.callCount, 1);
		const opts = spawnStub.firstCall.args[2] as childProcess.SpawnOptions;
		const env = opts.env as NodeJS.ProcessEnv;
		assert.equal(env.GOATIDE_TEST_OVERRIDE_CWD, '1');
	});

	it('preserves GOATIDE_DB and GOATIDE_LOCKFILE_PATH when set, alongside the override', async () => {
		const client = new KernelClient();
		(client as unknown as { kernelPath: string }).kernelPath = '/fake/kernel/main.js';
		(client as unknown as { dbPath: string }).dbPath = '/tmp/g.db';
		(client as unknown as { lockfilePath: string }).lockfilePath = '/tmp/g.lock';
		await (client as unknown as { spawnDetachedKernel: () => Promise<void> }).spawnDetachedKernel();

		assert.equal(spawnStub.callCount, 1);
		const opts = spawnStub.firstCall.args[2] as childProcess.SpawnOptions;
		const env = opts.env as NodeJS.ProcessEnv;
		assert.equal(env.GOATIDE_DB, '/tmp/g.db');
		assert.equal(env.GOATIDE_LOCKFILE_PATH, '/tmp/g.lock');
		assert.equal(env.GOATIDE_TEST_OVERRIDE_CWD, '1');
	});
});

describe('BRIDGE-RT-02 meta: real-spawn with workspace-looking cwd', () => {
	let tmpHome: string;
	let savedHome: string | undefined;
	let savedUserProfile: string | undefined;
	let savedAppData: string | undefined;
	let savedXdgConfigHome: string | undefined;
	let savedLockfilePath: string | undefined;
	let savedDbPath: string | undefined;

	beforeEach(() => {
		tmpHome = mkdtempSync(path.join(tmpdir(), 'goatide-fake-home-'));
		// Workspace-looking dir: a `.git` folder in the would-be cwd.
		mkdirSync(path.join(tmpHome, '.git'), { recursive: true });

		savedHome = process.env.HOME;
		savedUserProfile = process.env.USERPROFILE;
		savedAppData = process.env.APPDATA;
		savedXdgConfigHome = process.env.XDG_CONFIG_HOME;
		savedLockfilePath = process.env.GOATIDE_LOCKFILE_PATH;
		savedDbPath = process.env.GOATIDE_DB;

		// Override platform HOME so resolveGoatideConfigDir returns a path UNDER tmpHome.
		if (process.platform === 'win32') {
			process.env.USERPROFILE = tmpHome;
			process.env.APPDATA = path.join(tmpHome, 'AppData', 'Roaming');
		} else {
			process.env.HOME = tmpHome;
			process.env.XDG_CONFIG_HOME = path.join(tmpHome, '.config');
		}
	});

	afterEach(() => {
		const restore = (key: string, val: string | undefined): void => {
			if (val === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = val;
			}
		};
		restore('HOME', savedHome);
		restore('USERPROFILE', savedUserProfile);
		restore('APPDATA', savedAppData);
		restore('XDG_CONFIG_HOME', savedXdgConfigHome);
		restore('GOATIDE_LOCKFILE_PATH', savedLockfilePath);
		restore('GOATIDE_DB', savedDbPath);
		try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('daemon comes up when fake-HOME contains .git (workspace-looking cwd)', async function () {
		this.timeout(30_000);

		// kernel/dist/main.js: walk up from
		//   src/vs/goatide/extensions/goatide-bridge/test/integration/kernel/   (the test dir)
		// to the repo root. That's 8 segments to ascend (integration -> test -> goatide-bridge
		// -> extensions -> goatide -> vs -> src -> <root>), i.e. 8 `..` joins, then into
		// kernel/dist/main.js.
		const kernelMain = path.resolve(
			__dirname_local,
			'..', '..', '..', '..', '..', '..', '..', '..',
			'kernel', 'dist', 'main.js',
		);
		if (!existsSync(kernelMain)) {
			this.skip();
			return;
		}

		// Pre-flight: detect the well-known `better-sqlite3` NODE_MODULE_VERSION mismatch
		// (kernel/node_modules built against Electron's Node ABI ≠ the test runner's Node).
		// When this hits, the daemon dies before writing its lockfile, surfacing as an
		// uninformative pollForLockfile timeout. Skip-with-reason rather than fail — the ABI
		// mismatch is tracked separately as a v1.0 runtime blocker (out of scope for
		// BRIDGE-RT-02, which is about the bridge's spawn-call shape, not kernel runtime).
		// Instantiating Database is what triggers the .node binding's dlopen — bare
		// require('better-sqlite3') succeeds even on ABI mismatch.
		const probeScript = 'const Db = require(\'better-sqlite3\'); const d = new Db(\':memory:\'); d.close();';
		const probe = spawnSync(
			process.execPath,
			['-e', probeScript],
			{
				cwd: path.dirname(kernelMain),
				env: process.env,
				timeout: 5_000,
			},
		);
		if (probe.status !== 0) {
			const probeStderr = (probe.stderr ?? Buffer.from('')).toString();
			if (probeStderr.includes('NODE_MODULE_VERSION') || probeStderr.includes('ERR_DLOPEN_FAILED')) {
				console.warn(`[BRIDGE-RT-02 meta] skipping: better-sqlite3 ABI mismatch (NODE_MODULE_VERSION). Run \`cd kernel && npm rebuild better-sqlite3\` to enable this test.`);
				this.skip();
				return;
			}
		}

		const lockfilePath = path.join(tmpHome, 'kernel.lock');
		const dbPath = path.join(tmpHome, 'graph.db');
		const client = new KernelClient({ lockfilePollTimeoutMs: 15_000 });

		try {
			await client.ensureKernel({
				kernelPath: kernelMain,
				dbPath,
				lockfilePath,
			});
			assert.ok(
				existsSync(lockfilePath),
				`expected lockfile at ${lockfilePath} after ensureKernel`,
			);
		} finally {
			let spawnedPid: number | undefined;
			if (existsSync(lockfilePath)) {
				try {
					const lock = JSON.parse(readFileSync(lockfilePath, 'utf8')) as { pid: number };
					spawnedPid = lock.pid;
				} catch { /* best-effort */ }
			}
			client.dispose();
			if (spawnedPid !== undefined) {
				try { process.kill(spawnedPid, 'SIGTERM'); } catch { /* best-effort */ }
			}
		}
	});
});
