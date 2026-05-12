/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// scripts/test/freshclone-smoke-vscode-dev-default.cjs
//
// Phase 12 Plan 12-06 — Companion assertion for `freshclone-smoke.sh`.
//
// Verifies that launching the Electron binary WITHOUT an explicit `VSCODE_DEV`
// env var still loads `workbench-dev.html` from a dev checkout, thanks to the
// `process.env.VSCODE_DEV ??= '1'` default landed in `src/main.ts` by
// Task 12-06-01.
//
// The Phase 9 sibling harness (`freshclone-smoke-cdp.cjs`) explicitly injects
// `VSCODE_DEV: '1'` via Playwright `env:` — that's why it works even WITHOUT
// the source-level default. This companion proves the default is reachable by
// scrubbing VSCODE_DEV from the env before the launch.
//
// Single assertion: `page.url()` contains `workbench-dev.html` within 30s. The
// rest of the workbench-bootstrap assertions (title, kernel.lock, cmd palette)
// are already covered by the sibling harness — duplicating them here would
// only slow the smoke without adding signal.
//
// Exit codes:
//   0 = workbench-dev.html observed without explicit VSCODE_DEV
//   1 = bind/launch failure OR url never matched (default missing or wrong)
//   2 = harness deadline exceeded

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const playwright = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const product = require(path.join(ROOT, 'product.json'));

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

function sleep(ms) {
	return new Promise(resolve => { setTimeout(resolve, ms); });
}

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

async function main() {
	const electronPath = resolveElectronPath();

	if (!fs.existsSync(electronPath)) {
		throw new Error('Plan 12-06 pre-flight: electron binary not found at ' + electronPath
			+ ' — run `npm install && npm run compile` before invoking this smoke stage.');
	}

	// Build a CLEAN env: copy process.env then scrub anything that would mask
	// the src/main.ts default. The whole point of this stage is to launch with
	// no explicit dev-mode signal and confirm the source-level default lights up.
	const env = Object.assign({}, process.env);
	delete env.VSCODE_DEV;
	delete env.VSCODE_CLI;

	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goatide-smoke12-06-userdata-'));
	const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goatide-smoke12-06-ext-'));
	console.log('[freshclone-smoke 12-06] userDataDir=' + userDataDir);
	console.log('[freshclone-smoke 12-06] extensionsDir=' + extDir);
	console.log('[freshclone-smoke 12-06] env.VSCODE_DEV scrubbed (was: ' + (process.env.VSCODE_DEV || '<unset>') + ')');

	const args = [
		ROOT,
		'--user-data-dir=' + userDataDir,
		'--extensions-dir=' + extDir,
		'--no-cached-data',
	];

	console.log('[freshclone-smoke 12-06] launching ' + electronPath + ' WITHOUT explicit VSCODE_DEV');
	const electron = await playwright._electron.launch({
		executablePath: electronPath,
		args,
		env,
		timeout: 60_000,
	});

	let urlObserved = '';
	try {
		const window = await electron.firstWindow({ timeout: 60_000 });
		try {
			await window.waitForLoadState('load', { timeout: 60_000 });
		} catch (_err) {
			// Fall through — poll for url-string match below.
		}

		const url = await waitForCondition(
			() => window.url(),
			u => typeof u === 'string' && u.includes('workbench-dev.html'),
			30_000,
			250,
		);
		urlObserved = (typeof url === 'string') ? url : String(url);

		if (!urlObserved.includes('workbench-dev.html')) {
			throw new Error('Plan 12-06 FAIL: VSCODE_DEV-less launch produced url '
				+ JSON.stringify(urlObserved) + ' (expected substring "workbench-dev.html"). '
				+ 'src/main.ts VSCODE_DEV default did not apply — verify '
				+ 'import.meta.dirname includes "out" and excludes ".asar" at runtime.');
		}

		console.log('[freshclone-smoke 12-06] VSCODE_DEV-less launch produces workbench-dev.html PASS (' + urlObserved + ')');
	} finally {
		try {
			await Promise.race([
				electron.close(),
				new Promise(resolve => setTimeout(resolve, 10_000)),
			]);
		} catch (err) {
			console.warn('[freshclone-smoke 12-06] electron.close() threw (non-fatal): ' + err.message);
		}
	}
}

const HARNESS_TIMEOUT_MS = parseInt(process.env.HARNESS_TIMEOUT_MS || '180000', 10);
const hardDeadline = setTimeout(() => {
	console.error('[freshclone-smoke 12-06] FAIL (harness deadline): exceeded ' + HARNESS_TIMEOUT_MS + 'ms — killing process tree');
	process.exit(2);
}, HARNESS_TIMEOUT_MS);
hardDeadline.unref();

main().then(() => {
	clearTimeout(hardDeadline);
	process.exit(0);
}).catch(err => {
	clearTimeout(hardDeadline);
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
});
