/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// scripts/test/freshclone-smoke-cdp.cjs
//
// Phase 9 Plan 09-05 — Fresh-clone CDP smoke harness for BUILD-RT-* SC #5.
//
// Asserts 4 conditions against a Playwright `_electron.launch()` of the dev build:
//   1. page.title() contains "GoatIDE Dev"
//   2. page.url() contains "workbench-dev.html"
//   3. ~/AppData/Roaming/goatide/kernel.lock (or platform equivalent) appears within 30s
//   4. Cmd palette displays "GoatIDE: Set Session Priority"
//
// Source pattern: test/automation/src/playwrightElectron.ts:33-43 (verified by RESEARCH.md
// §Example-4). CommonJS (.cjs) because the root package.json does not declare "type":"module"
// for scripts/ and `_electron` is the same import in both CJS and ESM playwright entry points.
//
// Constraints (RESEARCH.md §Open-Question-4):
//   - VSCODE_DEV / VSCODE_CLI are injected via Playwright `env:` option, NOT via src/main.ts.
//   - No new npm dependency: playwright resolves transitively from @playwright/test ^1.56.1
//     which is already in root devDependencies.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const playwright = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const product = require(path.join(ROOT, 'product.json'));

// --- Platform-resolved Electron binary path (RESEARCH.md §Example-4) ---------
function resolveElectronPath() {
	switch (process.platform) {
		case 'win32':
			return path.join(ROOT, '.build', 'electron', product.nameShort + '.exe');
		case 'darwin':
			return path.join(ROOT, '.build', 'electron', product.nameLong + '.app', 'Contents', 'MacOS', product.nameShort);
		default:
			// linux + other POSIX
			return path.join(ROOT, '.build', 'electron', product.applicationName);
	}
}

// --- Platform-resolved kernel.lock path (XDG-flavored, matches kernel's data-dir resolver) -
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

// --- Main -------------------------------------------------------------------

async function main() {
	const electronPath = resolveElectronPath();
	const kernelLockPath = resolveKernelLockPath();

	// Pre-flight 1: binary must exist (contract: `npm install && npm run compile` ran first).
	if (!fs.existsSync(electronPath)) {
		throw new Error('SC#5 pre-flight: electron binary not found at ' + electronPath
			+ ' — run `npm install && npm run compile` (or `npm run electron`) before invoking the smoke.');
	}

	// Pre-flight 2: delete pre-existing kernel.lock so assertion #3 measures a NEW launch.
	if (fs.existsSync(kernelLockPath)) {
		try {
			fs.unlinkSync(kernelLockPath);
			console.log('[freshclone-smoke-cdp] pre-flight: removed stale kernel.lock at ' + kernelLockPath);
		} catch (err) {
			// Non-fatal — if the lock is held by a running daemon, the harness will still observe its presence post-launch.
			console.warn('[freshclone-smoke-cdp] pre-flight: could not unlink kernel.lock (' + err.message + '); proceeding');
		}
	}

	// Pre-flight 3: isolated user-data-dir + extensions-dir (Pitfall 5 from clean-profile-launch.sh).
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goatide-smoke-userdata-'));
	const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goatide-smoke-ext-'));
	console.log('[freshclone-smoke-cdp] userDataDir=' + userDataDir);
	console.log('[freshclone-smoke-cdp] extensionsDir=' + extDir);

	const args = [
		ROOT,
		'--user-data-dir=' + userDataDir,
		'--extensions-dir=' + extDir,
		'--no-cached-data',
	];

	const env = Object.assign({}, process.env, {
		VSCODE_DEV: '1',
		VSCODE_CLI: '1',
	});

	console.log('[freshclone-smoke-cdp] launching ' + electronPath);
	const electron = await playwright._electron.launch({
		executablePath: electronPath,
		args,
		env,
		timeout: 60_000,
	});

	let assertionsPassed = 0;
	try {
		const window = await electron.firstWindow({ timeout: 60_000 });
		// Wait for the renderer to settle so title/url are stable.
		await window.waitForLoadState('domcontentloaded');

		// --- Assertion 1: title contains "GoatIDE" and "Dev" ----------------
		const title = await window.title();
		if (!title.includes('GoatIDE') || !title.includes('Dev')) {
			throw new Error('SC#5 fail (title): expected title containing "GoatIDE" and "Dev", got ' + JSON.stringify(title));
		}
		console.log('[freshclone-smoke-cdp] SC#5 assert 1/4: title PASS (' + title + ')');
		assertionsPassed++;

		// --- Assertion 2: url contains workbench-dev.html -------------------
		const url = window.url();
		if (!url.includes('workbench-dev.html')) {
			throw new Error('SC#5 fail (url): expected url containing "workbench-dev.html", got ' + JSON.stringify(url));
		}
		console.log('[freshclone-smoke-cdp] SC#5 assert 2/4: workbench-dev.html PASS (' + url + ')');
		assertionsPassed++;

		// --- Assertion 3: kernel.lock appears within 30s --------------------
		console.log('[freshclone-smoke-cdp] waiting up to 30s for kernel.lock at ' + kernelLockPath);
		const lockAppeared = await waitForKernelLock(kernelLockPath, 30_000);
		if (!lockAppeared) {
			throw new Error('SC#5 fail (kernel.lock): expected kernel.lock at ' + kernelLockPath + ' within 30s, never appeared');
		}
		console.log('[freshclone-smoke-cdp] SC#5 assert 3/4: kernel.lock PASS');
		assertionsPassed++;

		// --- Assertion 4: cmd palette contains "Set Session Priority" -------
		// Standard VS Code keybindings: Ctrl+Shift+P (or Cmd+Shift+P on macOS). F1 is a documented fallback.
		const paletteShortcut = process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P';
		await window.keyboard.press(paletteShortcut);
		// Quick-input widget standard selector in VS Code workbench.
		const quickInput = window.locator('.quick-input-widget input');
		try {
			await quickInput.waitFor({ state: 'visible', timeout: 5_000 });
		} catch (_err) {
			// Fallback: F1 also opens the cmd palette in VS Code.
			console.log('[freshclone-smoke-cdp] palette shortcut did not surface quick-input; trying F1 fallback');
			await window.keyboard.press('F1');
			await quickInput.waitFor({ state: 'visible', timeout: 5_000 });
		}
		await quickInput.fill('Set Session Priority');
		// Match either the command id literal or its title-cased label.
		const paletteEntry = window.locator('text=/GoatIDE.*Set Session Priority|goatide\\.setSessionPriority/').first();
		await paletteEntry.waitFor({ state: 'visible', timeout: 5_000 });
		console.log('[freshclone-smoke-cdp] SC#5 assert 4/4: cmd palette contains goatide.setSessionPriority PASS');
		assertionsPassed++;

		// Close the cmd palette to leave the workbench in a sane state for any follow-on automation.
		await window.keyboard.press('Escape');
	} finally {
		// Pitfall 6: do NOT force-kill the kernel daemon; it persists per Mandate-A.
		try {
			await electron.close();
		} catch (err) {
			console.warn('[freshclone-smoke-cdp] electron.close() threw (non-fatal): ' + err.message);
		}
	}

	if (assertionsPassed !== 4) {
		throw new Error('SC#5 fail: only ' + assertionsPassed + '/4 assertions passed before exit');
	}

	console.log('[freshclone-smoke-cdp] SC#5: all 4 assertions PASS');
}

main().catch(err => {
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
