/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 spike: SINON_RESOLVES=true (with caveat — see require-vs-import note below)
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
//
// NOTE: Task 1 of this plan flips the 3 unit-test stubs; Task 2 flips the meta stub. The
// meta block remains it.skip in this commit and is filled in separately.

import * as assert from 'node:assert/strict';
import sinon from 'sinon';

import { KernelClient } from '../../../src/kernel/client.js';
import { resolveGoatideConfigDir } from '../../../src/kernel/lockfile-reader.js';

// Use CommonJS require to align with client.ts — sinon needs a mutable property
// descriptor, which only the require-wrapped namespace exposes (the ESM-namespace wrapper
// from `import * as cp` is frozen and not stubbable). Wave-0 spike confirmed sinon resolves
// from root hoisting, but did not test the stub-on-namespace path; switching both client.ts
// and this test to require() side-steps the frozen-namespace block.
const childProcess: typeof import('node:child_process') = require('node:child_process');

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

	it.skip('daemon comes up when ~/.goatide-fake-cwd/.git exists', () => {
		// TODO Task 2 of Plan 08-02:
		//   Pattern: see kernel/src/test/harvester/daemon/ide-close-survival.spec.ts:31-77
		//   for the real-spawn harness shape (mkdtempSync `.git/` skeleton, override
		//   HOME/USERPROFILE/APPDATA/XDG_CONFIG_HOME so resolveGoatideConfigDir lands inside
		//   tmpHome, ensureKernel against the real kernel/dist/main.js, assert lockfile
		//   appears, then SIGTERM the spawned pid). Skip-with-reason on missing
		//   kernel/dist/main.js OR on the better-sqlite3 NODE_MODULE_VERSION mismatch.
	});
});
