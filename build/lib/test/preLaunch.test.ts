/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 9 Plan 09-01 — BUILD-RT-01 GREEN tests.
//
// CHOSEN APPROACH: dependency-injected runner (preferred over OPTION A's child_process.spawn
// mock because ESM `import { spawn } from 'child_process'` produces a read-only const binding
// that mock.method cannot rewrite — and an earlier attempt to mutate cp.spawn via createRequire
// fired the REAL `npm run compile` because preLaunch.ts captures the binding at module-eval).
//
// Test 1 (findMissingSentinels): deterministic tmpdir with 2-of-3 sentinels present;
//   asserts the 3rd is returned in the missing list. Pure I/O, no subprocess, no rootDir touch.
// Test 2 (ensureCompiled): pass a stub runner that records arguments and resolves immediately.
//   Forces the missing-sentinel path by passing a runner that records spawn calls; ensureCompiled
//   defaults to the real runProcess only when no runner is injected. Real child_process is never
//   touched. The test runs in well under 100ms.
//
// Why DI > mock.method: ESM read-only bindings (Node 22 strict ESM); zero risk of real
// `npm run compile` ever running; the test exercises the EXACT public contract callers
// depend on (ensureCompiled spawns compile + transpile in order when sentinels missing).

import assert from 'node:assert';
import { promises as fs, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ensureCompiled, findMissingSentinels, type RunProcess } from '../preLaunch.ts';

test('findMissingSentinels returns sentinels absent in the given dir (BUILD-RT-01)', async () => {
	// Deterministic: build a tmpdir with 2 of 3 sentinels present; assert the 3rd
	// is reported missing. No environment coupling — works on any machine regardless
	// of whether the real repo's out/ is complete.
	const tmp = mkdtempSync(path.join(os.tmpdir(), 'goatide-prelaunch-'));
	await fs.mkdir(path.join(tmp, 'out', 'vs', 'base', 'common'), { recursive: true });
	await fs.writeFile(path.join(tmp, 'out', 'main.js'), '');
	await fs.writeFile(path.join(tmp, 'out', 'vs', 'base', 'common', 'arrays.js'), '');
	// Intentionally do NOT create out/vs/code/electron-main/main.js — that one must be reported.

	const missing = await findMissingSentinels(tmp);

	assert.deepStrictEqual(missing, ['out/vs/code/electron-main/main.js']);
});

test('ensureCompiled invokes compile + transpile exactly twice when sentinels missing (BUILD-RT-01)', async () => {
	// Deterministic: inject a stub runner so ensureCompiled cannot fire the real `npm run compile`.
	// We force the missing-sentinel path by renaming the rootDir's out/main.js sentinel (or
	// accepting that on a cold tree the sentinel is already missing). Both paths produce
	// the same assertion: exactly 2 runner calls in compile -> transpile-client order.
	const calls: string[][] = [];
	const stubRunner: RunProcess = async (cmd, args) => {
		calls.push([cmd, ...args]);
	};

	// repoRoot resolution mirrors preLaunch.ts's `rootDir = resolve(import.meta.dirname, '..', '..')`:
	// this test file lives at build/lib/test/, so 3 levels up is the repo root.
	const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
	const victim = path.join(repoRoot, 'out', 'main.js');
	const backup = victim + '.bak-prelaunch-test';
	let renamed = false;
	try {
		try {
			await fs.rename(victim, backup);
			renamed = true;
		} catch {
			// Sentinel already missing on cold tree — missing-path is forced regardless;
			// no rename needed. The assertion below still holds because ensureCompiled
			// runs the runner exactly twice for ANY missing-sentinel state.
		}

		await ensureCompiled(stubRunner);

		// DETERMINISTIC contract: exactly 2 runner calls, in compile -> transpile-client order.
		assert.strictEqual(calls.length, 2, `expected exactly 2 runner calls, got ${calls.length}: ${JSON.stringify(calls)}`);
		assert.ok(calls[0].includes('compile'), `first call should be 'npm run compile', got: ${calls[0].join(' ')}`);
		assert.ok(calls[1].includes('transpile-client'), `second call should be 'npm run transpile-client', got: ${calls[1].join(' ')}`);
	} finally {
		if (renamed) {
			try {
				await fs.rename(backup, victim);
			} catch {
				// Best effort — leave a .bak file behind rather than fail the test on cleanup.
			}
		}
	}
});
