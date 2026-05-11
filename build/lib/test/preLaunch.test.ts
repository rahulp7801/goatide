/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 9 Plan 09-00 (Wave 0) — RED stub for BUILD-RT-01.
//
// Asserts the eventual GREEN contract: when out/ exists but is empty, ensureCompiled()
// MUST repopulate it with the three sentinel files that preLaunch downstream checks
// rely on (out/main.js + out/vs/base/common/arrays.js + out/vs/code/electron-main/main.js).
//
// Current state is intentionally RED-suppressed: ensureCompiled is file-internal in
// build/lib/preLaunch.ts (not exported), so this test is registered with the node:test
// `skip` option per Phase 8 Pattern 1. Plan 09-01 will (a) export ensureCompiled, (b)
// switch the sentinel-presence check from `exists('out')` to a tri-sentinel check, and
// (c) flip the skip option to enable this assertion.

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('ensureCompiled produces sentinel files when out/ is empty (BUILD-RT-01)', { skip: 'Wave 0 RED stub — Plan 09-01 implements' }, async () => {
	// Plan 09-01 will (a) export ensureCompiled from ../preLaunch.ts, (b) flip the
	// `skip` option above to enable this body. The dynamic import is deferred to
	// inside the skipped body so the module-level evaluation stays clean today
	// (a static import would fail with `does not provide an export named ensureCompiled`
	// even with skip set, because node:test evaluates module imports before honoring
	// skip — see Phase 8 Pattern 1 rationale).

	// @ts-expect-error Plan 09-01 will export ensureCompiled from ../preLaunch.ts;
	// the Wave-0 stub keeps tsc clean by suppressing the not-yet-exported import.
	const { ensureCompiled } = await import('../preLaunch.ts');

	const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'goatide-prelaunch-'));
	fs.mkdirSync(path.join(tmpdir, 'out'), { recursive: true });

	// Plan 09-01: pick ONE of the following invocation shapes and uncomment.
	// Variant A — process.chdir based:
	//   const prevCwd = process.cwd();
	//   try { process.chdir(tmpdir); await ensureCompiled(); } finally { process.chdir(prevCwd); }
	// Variant B — parameterized root:
	//   await ensureCompiled(tmpdir);
	await ensureCompiled();

	assert.ok(fs.existsSync(path.join(tmpdir, 'out/main.js')), 'out/main.js sentinel missing — preLaunch.ensureCompiled did not produce out/main.js');
	assert.ok(fs.existsSync(path.join(tmpdir, 'out/vs/base/common/arrays.js')), 'out/vs/base/common/arrays.js sentinel missing — gulp compile did not transpile vs/base');
	assert.ok(fs.existsSync(path.join(tmpdir, 'out/vs/code/electron-main/main.js')), 'out/vs/code/electron-main/main.js sentinel missing — transpile-client did not run');
});
