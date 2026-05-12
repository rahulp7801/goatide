/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
//
// kernel/scripts/install-electron-prebuild.cjs
//
// Phase 9 Plan 09-04 — BUILD-RT-04 implementation.
// Phase 13 Plan 13-01 — CLOSE-01 enhancements: idempotency guard + fallback version.
//
// Postinstall hook for kernel/ that ensures better-sqlite3's native binary is
// built against Electron's ABI (NODE_MODULE_VERSION 140 for Electron 39), not
// Node's default (ABI 127 for Node 22). The IDE launches under Electron, so
// the Node-ABI binary that npm install produces by default crashes with a
// "NODE_MODULE_VERSION 140 vs 127" error on first `require('better-sqlite3')`.
//
// Single source of truth for the Electron version is the root package.json's
// devDependencies.electron — bumps to that field auto-track here. Falls back
// to kernel/package.json devDependencies.electron with a warning if the root
// field is absent.
//
// Defensive details:
//   - CLOSE-01 idempotency: before fetching a new prebuild, load the existing
//     binary and parse its NODE_MODULE_VERSION from the error message. If the
//     compiled ABI is >= 128 (Electron-range) and higher than the current Node
//     ABI, the binary is already a correct Electron prebuild — skip download.
//   - Pitfall 3 fix: move any stale better_sqlite3.node aside before fetching,
//     so prebuild-install performs the download. On Windows, rename() works even
//     after a failed require() that holds a file handle; unlink() does not.
//   - Skip silently if better-sqlite3 hasn't been installed yet (Pitfall 2).
//   - `.cjs` extension is required because kernel/package.json declares
//     `"type": "module"` — without `.cjs`, `require` is undefined.

const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const KERNEL_DIR = path.join(__dirname, '..');
const ROOT_PKG_PATH = path.join(KERNEL_DIR, '..', 'package.json');
const KERNEL_PKG_PATH = path.join(KERNEL_DIR, 'package.json');

// CLOSE-01: read Electron version with root-first fallback.
let electronTarget;
let electronVersionSource;

const rootPkg = fs.existsSync(ROOT_PKG_PATH) ? JSON.parse(fs.readFileSync(ROOT_PKG_PATH, 'utf8')) : null;
if (rootPkg && rootPkg.devDependencies && rootPkg.devDependencies.electron) {
	electronTarget = rootPkg.devDependencies.electron;
	electronVersionSource = 'root';
} else {
	// Fallback: kernel's own devDependencies (may be stale — warn loudly).
	const kernelPkg = fs.existsSync(KERNEL_PKG_PATH) ? JSON.parse(fs.readFileSync(KERNEL_PKG_PATH, 'utf8')) : null;
	electronTarget = kernelPkg && kernelPkg.devDependencies && kernelPkg.devDependencies.electron;
	electronVersionSource = 'kernel-fallback';
	if (electronTarget) {
		console.warn('[kernel/postinstall] WARN: root package.json devDependencies.electron missing; falling back to kernel package.json (' + electronTarget + '). Consider adding electron to root devDependencies.');
	}
}

if (!electronTarget) {
	console.error('[kernel/postinstall] FATAL: Electron version not found in root or kernel package.json devDependencies.electron; cannot determine Electron target ABI.');
	process.exit(1);
}

console.log('[kernel/postinstall] Electron version: ' + electronTarget + ' (source: ' + electronVersionSource + ')');

const moduleDir = path.join(KERNEL_DIR, 'node_modules', 'better-sqlite3');

if (!fs.existsSync(moduleDir)) {
	console.log('[kernel/postinstall] better-sqlite3 not yet installed; skipping (next install will fire postinstall)');
	process.exit(0);
}

const binaryPath = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');

// CLOSE-01 idempotency guard: inspect the existing binary's NODE_MODULE_VERSION.
// We try to require() it and parse the ABI from the error message when there's
// a mismatch. If the binary's "compiled against" ABI is >= 128 (Electron range)
// and higher than the current Node ABI, it's already a correct Electron prebuild.
//
// Regex: "NODE_MODULE_VERSION <N>." appears first for the compiled ABI,
//        "requires NODE_MODULE_VERSION <M>" for the current runtime ABI.
if (fs.existsSync(binaryPath)) {
	try {
		require(binaryPath);
		// If require succeeds: binary is compatible with the current runtime.
		// Under Electron with matching ABI → already correct; done.
		// Under Node with Node-ABI binary → wrong for Electron; skip this branch.
		// In practice, this script runs under Node (from postinstall), so a
		// successful load means the binary is Node-compiled → fall through to rebuild.
		if (process.versions.electron) {
			// Running under Electron — a successful load is the correct state.
			console.log('[kernel/postinstall] Binary loads under Electron ' + process.versions.electron + ' — already correct; skipping rebuild.');
			process.exit(0);
		}
		// Running under Node and binary loaded → compiled for this Node ABI → wrong for Electron.
		console.log('[kernel/postinstall] Binary is Node-ABI (loaded under Node ' + process.versions.node + '); rebuilding for Electron ' + electronTarget);
	} catch (err) {
		const msg = (err && err.message) || '';
		// Parse ABI values from the mismatch message.
		// Message format (newlines between parts):
		//   "was compiled against ... using\nNODE_MODULE_VERSION <N>. This version..."
		//   "requires\nNODE_MODULE_VERSION <M>."
		// First occurrence of "NODE_MODULE_VERSION <N>." is the compiled-against ABI.
		const abiMatches = msg.match(/NODE_MODULE_VERSION (\d+)/g);
		if (abiMatches && abiMatches.length >= 2) {
			const compiledAbi = parseInt(abiMatches[0].replace('NODE_MODULE_VERSION ', ''), 10);
			const requiresAbi = parseInt(abiMatches[1].replace('NODE_MODULE_VERSION ', ''), 10);
			// Electron prebuilds have ABI >= 128 (Electron 26+). Node 22 ABI is 127.
			// If compiled ABI is >= 128 and higher than the Node runtime ABI,
			// the binary is already a correct Electron prebuild — skip rebuild.
			if (compiledAbi >= 128 && compiledAbi > requiresAbi) {
				console.log('[kernel/postinstall] Binary compiled for Electron ABI ' + compiledAbi + ' (running under Node ABI ' + requiresAbi + ') — already correct; skipping rebuild.');
				process.exit(0);
			}
			console.log('[kernel/postinstall] Binary ABI ' + compiledAbi + ' is not Electron-range or is lower than expected; rebuilding for Electron ' + electronTarget);
		} else {
			// Non-ABI error (corrupt binary, missing dependency, etc.) — fall through to rebuild.
			console.log('[kernel/postinstall] Binary load error (non-ABI mismatch): ' + String(msg).substring(0, 120));
		}
	}

	// Move stale binary aside. On Windows, rename() works even after a failed
	// require() that holds a read-only file handle. unlink() does NOT work on
	// Windows when the file is held open (EPERM). The renamed stale file is
	// left for the OS to clean up; prebuild-install will write the new binary
	// to the original path.
	try {
		fs.renameSync(binaryPath, binaryPath + '.stale');
		console.log('[kernel/postinstall] Moved stale better_sqlite3.node aside (replacing with Electron-ABI prebuild for ' + electronTarget + ')');
	} catch (renameErr) {
		// Last resort: try unlink (may work if OS cleaned up the handle).
		try {
			fs.unlinkSync(binaryPath);
			console.log('[kernel/postinstall] Removed stale better_sqlite3.node (replacing with Electron-ABI prebuild for ' + electronTarget + ')');
		} catch (unlinkErr) {
			console.warn('[kernel/postinstall] WARN: could not move or remove stale binary (' + renameErr.code + '/' + unlinkErr.code + '); prebuild-install will attempt overwrite.');
		}
	}
}

// Plan 09-06 phase-verify Rule-1 auto-fix:
//   The original invocation used `--module-dir <better-sqlite3>` with `cwd: KERNEL_DIR`.
//   prebuild-install resolved the WRONG package metadata (the cwd's package.json,
//   i.e. the `kernel` root pkg), producing requests for
//   `kernel-v0.0.1-electron-v140-...tar.gz` (404). The correct invocation runs
//   prebuild-install FROM WITHIN the dependent package's directory so it reads
//   the target package's name/version from its own package.json — yielding
//   `better-sqlite3-v12.9.0-electron-v140-win32-x64.tar.gz` which actually exists
//   in the better-sqlite3 GitHub releases. See `prebuild-install --verbose` output
//   for the metadata difference.
const cmd = 'npx prebuild-install --runtime electron --target ' + electronTarget;
console.log('[kernel/postinstall] Fetching Electron-ABI prebuild for better-sqlite3 (Electron ' + electronTarget + ')');
console.log('[kernel/postinstall] $ ' + cmd + '   (cwd: ' + moduleDir + ')');

execSync(cmd, { stdio: 'inherit', cwd: moduleDir });

console.log('[kernel/postinstall] Done');
