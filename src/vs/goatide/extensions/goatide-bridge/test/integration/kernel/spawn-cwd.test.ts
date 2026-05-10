/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 spike: SINON_RESOLVES=true
//
// src/vs/goatide/extensions/goatide-bridge/test/integration/kernel/spawn-cwd.test.ts
//
// Phase 8 Plan 08-00 (Wave 0) — RED stub for BRIDGE-RT-02.
//
// Defensive spawn(cwd=resolveGoatideConfigDir()) with sentinel env so the kernel daemon
// never inherits a workspace cwd that contains a `.git` folder (Pitfall 10: spawning with
// `cwd: homedir()` collides with `~/.git` and the kernel refuses to start). Two layers:
//
//   1. UNIT (sinon stubs `node:child_process.spawn`) — pure shape-of-arguments assertions:
//      cwd, env.GOATIDE_TEST_OVERRIDE_CWD=1, env.GOATIDE_DB_PATH/LOCKFILE_PATH preservation.
//   2. META (real-spawn) — exercises the daemon under a workspace-looking cwd. Pattern
//      mirrors kernel/src/test/harvester/daemon/ide-close-survival.spec.ts:31-77 (boots a
//      throwaway `~/.goatide-fake-cwd/.git/` skeleton, spawns the bridge ensureKernel path
//      against it, asserts daemon comes up).
//
// Plan 08-02 (Wave 1) lands the production change in src/kernel/client.ts and flips these
// `it.skip` placeholders to real `it()` tests.

import * as assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import sinon from 'sinon';

import { resolveGoatideConfigDir } from '../../../src/kernel/lockfile-reader.js';

// Reference imports so tsc/eslint don't drop them while the body is still TODO.
if (false) { void assert; void childProcess; void sinon; void resolveGoatideConfigDir; }

describe('BRIDGE-RT-02 unit: defensive spawn shape', () => {

	it.skip('passes cwd=resolveGoatideConfigDir() to spawn()', () => {
		// TODO Wave 1 (Plan 08-02):
		//   const spawnStub = sinon.stub(childProcess, 'spawn').returns({ unref() {}, on() {}, pid: 99999 } as never);
		//   try {
		//     const client = new KernelClient();
		//     await client.ensureKernel({ kernelPath: '/fake/main.js' }).catch(() => {});
		//     const args = spawnStub.firstCall.args;
		//     const opts = args[2] as childProcess.SpawnOptions;
		//     assert.equal(opts.cwd, resolveGoatideConfigDir());
		//   } finally { spawnStub.restore(); }
	});

	it.skip('passes env.GOATIDE_TEST_OVERRIDE_CWD=1 to spawn()', () => {
		// TODO Wave 1 (Plan 08-02):
		//   const spawnStub = sinon.stub(childProcess, 'spawn').returns(...);
		//   ...
		//   const opts = spawnStub.firstCall.args[2] as childProcess.SpawnOptions;
		//   assert.equal((opts.env as NodeJS.ProcessEnv).GOATIDE_TEST_OVERRIDE_CWD, '1');
	});

	it.skip('preserves dbPath/lockfilePath env vars when present', () => {
		// TODO Wave 1 (Plan 08-02):
		//   await client.ensureKernel({ kernelPath: '/fake/main.js', dbPath: '/tmp/g.db', lockfilePath: '/tmp/g.lock' });
		//   const opts = spawnStub.firstCall.args[2] as childProcess.SpawnOptions;
		//   const env = opts.env as NodeJS.ProcessEnv;
		//   assert.equal(env.GOATIDE_DB_PATH, '/tmp/g.db');
		//   assert.equal(env.GOATIDE_LOCKFILE_PATH, '/tmp/g.lock');
	});
});

describe('BRIDGE-RT-02 meta: real-spawn with workspace-looking cwd', () => {

	it.skip('daemon comes up when ~/.goatide-fake-cwd/.git exists', () => {
		// TODO Wave 1 (Plan 08-02):
		//   Pattern: see kernel/src/test/harvester/daemon/ide-close-survival.spec.ts:31-77
		//   for the real-spawn harness shape (mkdtempSync `.git/` skeleton, set process.cwd
		//   to it via spawn opts, ensureKernel against the real kernel/dist/main.js, assert
		//   client.heartbeat().ok === true within 8s, then SIGTERM the daemon pid).
		//   The pre-fix cwd-collision reproduces a kernel-side refusal-to-start in this
		//   harness; the post-fix code passes opts.cwd=resolveGoatideConfigDir() and the
		//   daemon starts cleanly.
	});
});
