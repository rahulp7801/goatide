/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
//
// Kernel vitest runner — invokes vitest under Electron-as-Node so it matches the
// NODE_MODULE_VERSION of the kernel's better-sqlite3 binary.
//
// Why: kernel/scripts/install-electron-prebuild.cjs (Phase 9 BUILD-RT-04) builds
// better-sqlite3 for Electron's ABI (NODE_MODULE_VERSION 140 on Electron 39) and
// wipes the default Node-ABI binary. Kernel tests that touch openDatabase() fail under
// plain `vitest` (system Node, ABI 127) with "NODE_MODULE_VERSION 140 vs 127". Running
// vitest under ELECTRON_RUN_AS_NODE=1 + the bundled Electron binary makes the ABI match.
//
// Fallback: if the Electron binary is absent (CI build hasn't materialized .build/ yet),
// fall back to plain `node` vitest. Tests touching the DB layer will fail, but pure-
// function tests still run.

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const KERNEL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(KERNEL_DIR, '..');

const VITEST_BIN = path.join(KERNEL_DIR, 'node_modules', 'vitest', 'vitest.mjs');

const electronCandidates = [
	path.join(REPO_ROOT, '.build', 'electron', 'GoatIDE.exe'),
	path.join(REPO_ROOT, '.build', 'electron', 'GoatIDE.app', 'Contents', 'MacOS', 'GoatIDE'),
	path.join(REPO_ROOT, '.build', 'electron', 'goatide'),
];
const electronBin = electronCandidates.find((p) => fs.existsSync(p));

const passthroughArgs = process.argv.slice(2);

let runner;
let runnerArgs;
let runnerEnv;

if (electronBin) {
	console.log('[run-vitest-electron] Running vitest under Electron-as-Node: ' + electronBin);
	runner = electronBin;
	runnerArgs = [VITEST_BIN, ...passthroughArgs];
	runnerEnv = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
} else {
	console.warn('[run-vitest-electron] No Electron binary found in .build/electron/; falling back to plain node. better-sqlite3 ABI-dependent tests will fail.');
	runner = process.execPath;
	runnerArgs = [VITEST_BIN, ...passthroughArgs];
	runnerEnv = process.env;
}

const result = spawnSync(runner, runnerArgs, {
	stdio: 'inherit',
	cwd: KERNEL_DIR,
	env: runnerEnv,
});

if (result.error) {
	console.error('[run-vitest-electron] spawn failed:', result.error);
	process.exit(1);
}
process.exit(result.status ?? 1);
