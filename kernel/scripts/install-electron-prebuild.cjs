/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
//
// kernel/scripts/install-electron-prebuild.cjs
//
// Phase 9 Plan 09-04 — BUILD-RT-04 implementation.
//
// Postinstall hook for kernel/ that ensures better-sqlite3's native binary is
// built against Electron's ABI (NODE_MODULE_VERSION 140 for Electron 39), not
// Node's default (ABI 127 for Node 22). The IDE launches under Electron, so
// the Node-ABI binary that npm install produces by default crashes with a
// "NODE_MODULE_VERSION 140 vs 127" error on first `require('better-sqlite3')`.
//
// Single source of truth for the Electron version is the root package.json's
// devDependencies.electron — bumps to that field auto-track here.
//
// Defensive details:
//   - Pitfall 3 fix: wipe any stale better_sqlite3.node before fetching, so
//     prebuild-install actually performs the download instead of treating the
//     existing file as up-to-date.
//   - Skip silently if better-sqlite3 hasn't been installed yet (Pitfall 2).
//   - `.cjs` extension is required because kernel/package.json declares
//     `"type": "module"` — without `.cjs`, `require` is undefined.

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const KERNEL_DIR = path.join(__dirname, '..');
const ROOT_PKG_PATH = path.join(KERNEL_DIR, '..', 'package.json');

const rootPkg = require(ROOT_PKG_PATH);
const electronTarget = rootPkg.devDependencies && rootPkg.devDependencies.electron;

if (!electronTarget) {
	console.error('[kernel/postinstall] FATAL: root package.json devDependencies.electron is undefined; cannot determine Electron target ABI.');
	process.exit(1);
}

const moduleDir = path.join(KERNEL_DIR, 'node_modules', 'better-sqlite3');

if (!fs.existsSync(moduleDir)) {
	console.log('[kernel/postinstall] better-sqlite3 not yet installed; skipping (next install will fire postinstall)');
	process.exit(0);
}

// Pitfall 3 fix: wipe stale binary so prebuild-install actually downloads a fresh one.
const stalePrebuilt = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');
if (fs.existsSync(stalePrebuilt)) {
	fs.unlinkSync(stalePrebuilt);
	console.log('[kernel/postinstall] Removed stale better_sqlite3.node (replacing with Electron-ABI prebuild for ' + electronTarget + ')');
}

const cmd = 'npx prebuild-install --runtime electron --target ' + electronTarget + ' --module-dir ' + JSON.stringify(moduleDir);
console.log('[kernel/postinstall] Fetching Electron-ABI prebuild for better-sqlite3 (Electron ' + electronTarget + ')');
console.log('[kernel/postinstall] $ ' + cmd);

execSync(cmd, { stdio: 'inherit', cwd: KERNEL_DIR });

console.log('[kernel/postinstall] Done');
