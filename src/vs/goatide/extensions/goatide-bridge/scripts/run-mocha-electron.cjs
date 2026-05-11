/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
//
// Bridge mocha runner — invokes mocha under Electron-as-Node so it matches the
// NODE_MODULE_VERSION of the kernel's better-sqlite3 binary.
//
// Why: kernel/scripts/install-electron-prebuild.cjs (Phase 9 BUILD-RT-04) builds
// better-sqlite3 for Electron's ABI (NODE_MODULE_VERSION 140 on Electron 39) and
// wipes the default Node-ABI binary. Bridge integration tests import from kernel/dist,
// which transitively requires better-sqlite3. Under plain `mocha` (system Node, ABI 127)
// the require throws "NODE_MODULE_VERSION 140 vs 127" and 4 tests fail in beforeAll.
// Running mocha under ELECTRON_RUN_AS_NODE=1 + the bundled Electron binary makes the
// ABI match.
//
// Fallback: if the Electron binary is absent (CI build hasn't materialized .build/
// yet), fall back to plain `node` mocha. Those tests will fail, but the rest still run
// — preferable to hard-failing the whole suite when Electron isn't built.

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const BRIDGE_DIR = path.join(__dirname, '..');
// From <repo>/src/vs/goatide/extensions/goatide-bridge → up 5: goatide-bridge → extensions
// → goatide → vs → src → <repo>.
const REPO_ROOT = path.join(BRIDGE_DIR, '..', '..', '..', '..', '..');

const MOCHA_BIN = path.join(BRIDGE_DIR, 'node_modules', 'mocha', 'bin', 'mocha.js');

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
	console.log('[run-mocha-electron] Running mocha under Electron-as-Node: ' + electronBin);
	runner = electronBin;
	runnerArgs = [MOCHA_BIN, ...passthroughArgs];
	runnerEnv = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
} else {
	console.warn('[run-mocha-electron] No Electron binary found in .build/electron/; falling back to plain node. better-sqlite3 ABI-dependent tests will fail.');
	runner = process.execPath;
	runnerArgs = [MOCHA_BIN, ...passthroughArgs];
	runnerEnv = process.env;
}

const result = spawnSync(runner, runnerArgs, {
	stdio: 'inherit',
	cwd: BRIDGE_DIR,
	env: runnerEnv,
});

if (result.error) {
	console.error('[run-mocha-electron] spawn failed:', result.error);
	process.exit(1);
}
process.exit(result.status ?? 1);
