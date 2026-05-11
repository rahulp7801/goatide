/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// scripts/test/lib/cdp-utils.cjs — Phase 11 Plan 11-00 Task 2.
//
// Extracted byte-identically from scripts/test/freshclone-smoke-cdp.cjs:41-112 so the
// visual-ceremony harness (Plan 11-00) and any future CDP harness can share the platform
// resolvers + polling primitives without duplicating them. The freshclone harness is the
// reference implementation — it predates this extraction and continues to inline its own
// copies of these functions (the bytes are identical; no behavior changes).
//
// Helpers provided:
//   resolveElectronPath()           — platform switch reading product.json for the binary
//   resolveKernelLockPath()         — XDG-flavored kernel.lock path resolver
//   sleep(ms)                       — Promise + setTimeout one-liner
//   waitForKernelLock(path, timeout) — fs.existsSync polling
//   waitForCondition(getValue, predicate, timeoutMs, intervalMs)
//                                   — per-call timeout + deadline-bounded poll
//
// CommonJS (.cjs) because the root package.json does not declare "type":"module" for
// scripts/ — same constraint as freshclone-smoke-cdp.cjs.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const product = require(path.join(ROOT, 'product.json'));

// --- Platform-resolved Electron binary path ---------------------------------
// Byte-identical to freshclone-smoke-cdp.cjs:41-51. Win32 reads product.nameShort+'.exe'
// (e.g. GoatIDE.exe), darwin reads product.nameLong+'.app' (e.g. GoatIDE.app), linux
// reads product.applicationName (e.g. goatide). ROOT is resolved one level deeper than
// freshclone-smoke-cdp.cjs because this file lives under scripts/test/lib/ vs scripts/test/.
function resolveElectronPath() {
	switch (process.platform) {
		case 'win32':
			return path.join(ROOT, '.build', 'electron', product.nameShort + '.exe');
		case 'darwin':
			return path.join(ROOT, '.build', 'electron', product.nameLong + '.app', 'Contents', 'MacOS', product.nameShort);
		default:
			return path.join(ROOT, '.build', 'electron', product.applicationName);
	}
}

// --- Platform-resolved kernel.lock path -------------------------------------
// Byte-identical to freshclone-smoke-cdp.cjs:54-62. Matches kernel's data-dir resolver
// at kernel/src/cli/db-path.ts: %APPDATA%/goatide on Windows, ~/Library/Application
// Support/goatide on macOS, ~/.config/goatide elsewhere.
function resolveKernelLockPath() {
	switch (process.platform) {
		case 'win32':
			return path.join(os.homedir(), 'AppData', 'Roaming', 'goatide', 'kernel.lock');
		case 'darwin':
			return path.join(os.homedir(), 'Library', 'Application Support', 'goatide', 'kernel.lock');
		default:
			return path.join(os.homedir(), '.config', 'goatide', 'kernel.lock');
	}
}

// --- Helpers ----------------------------------------------------------------

function sleep(ms) {
	return new Promise(resolve => { setTimeout(resolve, ms); });
}

// Byte-identical to freshclone-smoke-cdp.cjs:71-80.
async function waitForKernelLock(lockPath, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (fs.existsSync(lockPath)) {
			return true;
		}
		await sleep(500);
	}
	return false;
}

// Poll until the predicate is truthy or the deadline lapses. Returns the predicate's
// last value (truthy on success, falsy on timeout). Each getValue() call is wrapped in
// a per-call timeout so a hung evaluate against an unresponsive renderer cannot block
// the whole poll. The per-call timeout defaults to max(intervalMs*4, 1500).
//
// Byte-identical to freshclone-smoke-cdp.cjs:90-112.
async function waitForCondition(getValue, predicate, timeoutMs, intervalMs) {
	const deadline = Date.now() + timeoutMs;
	const perCallTimeoutMs = Math.max(intervalMs * 4, 1500);
	let last;
	while (Date.now() < deadline) {
		try {
			last = await Promise.race([
				Promise.resolve().then(() => getValue()),
				new Promise((_resolve, reject) => {
					setTimeout(() => { reject(new Error('per-call timeout (' + perCallTimeoutMs + 'ms)')); }, perCallTimeoutMs);
				}),
			]);
		} catch (_err) {
			last = undefined;
		}
		if (predicate(last)) {
			return last;
		}
		await sleep(intervalMs);
	}
	return last;
}

module.exports = {
	resolveElectronPath,
	resolveKernelLockPath,
	sleep,
	waitForKernelLock,
	waitForCondition,
};
