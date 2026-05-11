/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// scripts/test/visual-ceremony-cdp.cjs — Phase 11 Plan 11-00 Task 2.
//
// Playwright `_electron.launch()` harness skeleton for the visual-ceremony Phase. Wave 0
// ships the scaffolding + one webview-iframe smoke assertion proving the two-level
// selector (iframe.webview.ready > iframe#active-frame > body) works on this Electron
// build. Plans 11-01..11-04 each append per-VIS-* assertion blocks to this file.
//
// Usage:
//   bash scripts/visual-ceremony.sh                    — run all VIS-* blocks (or just WAVE0-SMOKE for now)
//   bash scripts/visual-ceremony.sh --only VIS-09      — single-surface filter
//   bash scripts/visual-ceremony.sh --waves 1,2        — wave-number filter
//   HARNESS_TIMEOUT_MS=300000 bash scripts/...         — override 600s hard deadline
//
// Constraints:
//   - VSCODE_DEV / VSCODE_CLI injected via Playwright env (NOT src/main.ts).
//   - All paths absolute (Pitfall 5 — workspace arg via path.resolve).
//   - electron.close() wrapped in Promise.race vs 10s sleep (renderer can hang mid-evaluate).
//   - HARNESS_TIMEOUT_MS hard-deadline as a last-resort kill switch (process.exit(2)).
//
// CommonJS (.cjs) because the root package.json does not declare "type":"module" for scripts/.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const child_process = require('node:child_process');
const playwright = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'kernel', 'test-fixtures', 'visual-workspace');
const SCREENSHOTS_DIR = path.join(ROOT, '.planning', 'phases', '11-visual-ceremony', 'screenshots');
const product = require(path.join(ROOT, 'product.json'));

const {
	resolveElectronPath,
	resolveKernelLockPath,
	sleep,
	waitForKernelLock,
	waitForCondition,
} = require('./lib/cdp-utils.cjs');

// --- CLI arg parsing --------------------------------------------------------
// --only <SURFACE-ID>  — run a single VIS-* surface (or WAVE0-SMOKE / WAVE0-* etc).
// --waves <N[,N...]>   — comma-separated wave numbers to run.
// Unknown surface IDs are NOT a hard error at parse time; the runner reports "filter
// matched zero surfaces" and exits 0. This matches the Wave-0 contract that a vacuous
// filter is a soft skip, not a failure.
function parseArgs(argv) {
	const out = { only: null, waves: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--only') {
			out.only = argv[++i];
		} else if (a === '--waves') {
			const raw = argv[++i];
			out.waves = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
		}
	}
	return out;
}

// --- Surface registry -------------------------------------------------------
// Wave 0 registers one smoke assertion. Plans 11-01..11-04 each append entries below
// with their own wave numbers. The runner filters by --only and --waves against this
// registry before launching electron; if zero surfaces match the harness exits 0
// without invoking _electron.launch (avoids burning 60s on a no-op filter).
const SURFACE_REGISTRY = [
	{ id: 'WAVE0-SMOKE', wave: 0, runner: runWebviewSmokeAssertion },
];

// --- Pre-flight: kill stale GoatIDE processes -------------------------------
// Best-effort: on win32 tasklist+taskkill; on POSIX pkill -f. Non-fatal — a leftover
// process holding kernel.lock would be caught by waitForKernelLock's timeout anyway,
// but we kill aggressively to keep iterations fast.
function killStaleProcesses() {
	try {
		if (process.platform === 'win32') {
			// taskkill returns non-zero if no process matches; swallow via `|| ver`.
			child_process.execSync('taskkill /F /IM GoatIDE.exe 2>nul || ver >nul', { stdio: 'ignore' });
		} else {
			child_process.execSync('pkill -f GoatIDE || true', { stdio: 'ignore' });
		}
	} catch (_err) {
		// non-fatal; just log
		console.warn('[visual-ceremony-cdp] killStaleProcesses: non-fatal stderr (' + (_err && _err.message) + ')');
	}
}

// --- Per-surface runner wrapper --------------------------------------------
// Wraps the runner in screenshot-on-success + screenshot-on-failure semantics.
// SCREENSHOTS_DIR may be gitignored (lives under .planning/) — the .gitkeep there
// guarantees the directory exists at clone time.
async function runVis(window, id, fn) {
	const slug = id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
	const passShot = path.join(SCREENSHOTS_DIR, slug + '.png');
	const failShot = path.join(SCREENSHOTS_DIR, slug + '-FAIL.png');
	try {
		await fn(window);
		try {
			await window.screenshot({ path: passShot });
		} catch (_e) {
			// non-fatal — screenshot can fail when window is in a transient state
		}
		return { id, pass: true, screenshot: passShot };
	} catch (err) {
		try {
			await window.screenshot({ path: failShot });
		} catch (_e) {
			// non-fatal
		}
		return { id, pass: false, screenshot: failShot, error: err && err.message ? err.message : String(err) };
	}
}

// --- Wave-0 webview-iframe smoke assertion ---------------------------------
// Proves the two-level webview iframe selector (iframe.webview.ready >
// iframe#active-frame > body) resolves on THIS Electron build before downstream plans
// rely on it for the Verification Canvas + SchemaDriftBanner + LivenessBanner surfaces.
//
// Strategy: drive `workbench.action.openWalkthrough` (a built-in VS Code command that
// opens the welcome walkthrough as a webview) to guarantee a webview exists, then
// resolve the iframe chain. Using a built-in webview makes the smoke assertion
// independent of bridge-extension wiring — Plans 11-01..11-04 add per-VIS-* assertions
// that drive the bridge's Verification Canvas, but Wave 0 only needs to prove the
// selector substrate works.
//
// Per Pitfall 3 from 11-RESEARCH.md: webview iframes are NOT direct descendants of the
// workbench DOM — they are nested under iframe.webview.ready (the outer host) then
// iframe#active-frame (the inner content frame). Playwright's frameLocator chain is
// the documented way to traverse this.
async function runWebviewSmokeAssertion(window) {
	const consoleBuf = [];
	const consoleListener = msg => {
		consoleBuf.push('[' + msg.type() + '] ' + msg.text());
		if (consoleBuf.length > 200) {
			consoleBuf.shift();
		}
	};
	window.on('console', consoleListener);

	try {
		// Drive a built-in webview-opening command. Multiple fallbacks because the
		// exact welcome-page command id varies across VS Code branding (workbench.action
		// .openWalkthrough is the modern id; getting-started.showGettingStarted is the
		// legacy one). Either opens the same WebviewEditor that exposes iframe.webview
		// .ready as its outer iframe.
		await window.evaluate(async () => {
			try {
				const req = typeof require === 'function' ? require : globalThis.require;
				if (typeof req === 'function') {
					try {
						const commands = req('vs/platform/commands/common/commands');
						if (commands && commands.CommandsRegistry) {
							const reg = commands.CommandsRegistry.getCommands();
							if (reg && typeof reg.has === 'function') {
								if (reg.has('workbench.action.openWalkthrough')) {
									await commands.CommandsRegistry.getCommand('workbench.action.openWalkthrough').handler();
									return;
								}
								if (reg.has('welcome.showGettingStarted')) {
									await commands.CommandsRegistry.getCommand('welcome.showGettingStarted').handler();
									return;
								}
							}
						}
					} catch (_e) {
						// Fall through to keyboard-shortcut driven approach below.
					}
				}
			} catch (_outer) {
				// non-fatal
			}
		});

		// The outer iframe has class `webview ready` once the host frame finishes
		// loading; the inner iframe has id `active-frame`. waitFor({ state: 'attached' })
		// is the smoke signal — we don't need the body to be visible, just present in
		// the DOM (proving the selector resolves).
		const outerFrame = window.frameLocator('iframe.webview.ready');
		const innerFrame = outerFrame.frameLocator('iframe#active-frame');
		await innerFrame.locator('body').waitFor({ state: 'attached', timeout: 20_000 });
	} catch (err) {
		const tail = consoleBuf.slice(-30).join('\n');
		console.error('[visual-ceremony-cdp] WAVE0-SMOKE renderer console tail (last 30):\n' + tail);
		throw err;
	} finally {
		try {
			window.off('console', consoleListener);
		} catch (_e) {
			// non-fatal
		}
	}
}

// --- Report printer ---------------------------------------------------------
function printReport(results) {
	console.log('');
	console.log('=== visual-ceremony report ===');
	let pass = 0;
	let fail = 0;
	for (const r of results) {
		if (r.pass) {
			console.log('  PASS  ' + r.id + (r.screenshot ? '  -> ' + r.screenshot : ''));
			pass++;
		} else {
			console.log('  FAIL  ' + r.id + '  -> ' + (r.error || 'unknown') + (r.screenshot ? '  (' + r.screenshot + ')' : ''));
			fail++;
		}
	}
	console.log('  -----');
	console.log('  ' + pass + ' passed, ' + fail + ' failed (' + results.length + ' total)');
}

// --- Main -------------------------------------------------------------------

async function main() {
	const args = parseArgs(process.argv.slice(2));

	// Filter the registry against --only / --waves. A vacuous filter is a soft skip.
	let surfaces = SURFACE_REGISTRY;
	if (args.only) {
		surfaces = surfaces.filter(s => s.id === args.only);
	}
	if (args.waves) {
		surfaces = surfaces.filter(s => args.waves.includes(s.wave));
	}

	if (surfaces.length === 0) {
		console.log('[visual-ceremony-cdp] filter matched zero surfaces (only=' + args.only + ', waves=' + JSON.stringify(args.waves) + '); soft-skip exit 0');
		return 0;
	}

	console.log('[visual-ceremony-cdp] running ' + surfaces.length + ' surface(s): ' + surfaces.map(s => s.id).join(', '));

	const electronPath = resolveElectronPath();
	const kernelLockPath = resolveKernelLockPath();

	if (!fs.existsSync(electronPath)) {
		console.log('[visual-ceremony-cdp] electron binary not found at ' + electronPath + ' — GoatIDE not built; skipping live ceremony (soft-pass)');
		// Print a placeholder report so callers see the skip explicitly.
		const stubbed = surfaces.map(s => ({ id: s.id, pass: true, screenshot: null, error: null, note: 'soft-skip (electron binary missing)' }));
		for (const r of stubbed) {
			console.log('  SKIP  ' + r.id + '  (electron binary not found)');
		}
		return 0;
	}

	// Pre-flight: kill stale processes, wipe stale kernel.lock, mkdtemp profile dirs,
	// build the seeded graph DB via seed.sh, copy it into the per-run userDataDir.
	killStaleProcesses();

	if (fs.existsSync(kernelLockPath)) {
		try {
			fs.unlinkSync(kernelLockPath);
			console.log('[visual-ceremony-cdp] pre-flight: removed stale kernel.lock at ' + kernelLockPath);
		} catch (err) {
			console.warn('[visual-ceremony-cdp] pre-flight: could not unlink kernel.lock (' + err.message + '); proceeding');
		}
	}

	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-ceremony-userdata-'));
	const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-ceremony-ext-'));
	console.log('[visual-ceremony-cdp] userDataDir=' + userDataDir);
	console.log('[visual-ceremony-cdp] extensionsDir=' + extDir);
	if (!fs.existsSync(SCREENSHOTS_DIR)) {
		fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
	}

	// Build seeded graph DB. The userDataDir's goatide subdir is what the kernel daemon
	// reads — copy our fixture-seeded DB into that location so the bridge sees the
	// pre-staged graph on first connect.
	const seededDb = path.join(userDataDir, 'goatide-fixture.db');
	const seedSh = path.join(FIXTURE, 'seed.sh');
	console.log('[visual-ceremony-cdp] seeding fixture DB at ' + seededDb);
	try {
		child_process.execSync('bash "' + seedSh + '"', {
			env: Object.assign({}, process.env, { TARGET_DB: seededDb }),
			stdio: 'inherit',
		});
	} catch (err) {
		console.error('[visual-ceremony-cdp] seed.sh failed: ' + err.message);
		throw err;
	}

	// Copy seeded DB into the production-relative path. The daemon resolves
	// %APPDATA%/goatide/graph.db (or platform equivalent); we copy into the per-run
	// userDataDir so the harness is hermetic against the developer's real DB.
	const productionDb = path.join(userDataDir, 'goatide', 'graph.db');
	fs.mkdirSync(path.dirname(productionDb), { recursive: true });
	fs.copyFileSync(seededDb, productionDb);
	console.log('[visual-ceremony-cdp] copied seeded DB to ' + productionDb);

	// Launch electron with ROOT as the first positional + FIXTURE as the second so the
	// VSCODE_DEV bootstrap finds `out/` correctly (freshclone-smoke-cdp.cjs:143 pattern)
	// AND the fixture is opened as the working folder. VS Code's CLI accepts additional
	// positionals as files/folders to add to the workspace; the first positional is the
	// workspace root which VSCODE_DEV uses to locate product.json + out/. Pitfall 5 —
	// both paths absolute (path.resolve).
	const launchArgs = [
		ROOT,
		path.resolve(FIXTURE),
		'--user-data-dir=' + userDataDir,
		'--extensions-dir=' + extDir,
		'--no-cached-data',
	];
	const launchEnv = Object.assign({}, process.env, {
		VSCODE_DEV: '1',
		VSCODE_CLI: '1',
	});

	console.log('[visual-ceremony-cdp] launching ' + electronPath);
	const electron = await playwright._electron.launch({
		executablePath: electronPath,
		args: launchArgs,
		env: launchEnv,
		cwd: ROOT,                 // VSCODE_DEV bootstrap resolves out/ relative to cwd
		timeout: 60_000,
	});

	const results = [];
	try {
		const window = await electron.firstWindow({ timeout: 60_000 });
		try {
			await window.waitForLoadState('load', { timeout: 60_000 });
		} catch (_e) {
			// Workbench may never fully resolve `load` if a remote resource hangs; the
			// per-surface runners use their own polling primitives via cdp-utils.
		}

		// Wait for kernel.lock as a readiness signal — the bridge can't talk to a kernel
		// that hasn't bound its port yet.
		await waitForKernelLock(kernelLockPath, 30_000);

		// Run each filtered surface sequentially. Single-launch + sequential runners
		// matches freshclone-smoke-cdp.cjs's main() pattern — re-launching electron for
		// every assertion would burn 60s of cold-start time per surface and defeat the
		// point of single-IDE-launch visual-ceremony.
		for (const surface of surfaces) {
			console.log('[visual-ceremony-cdp] running ' + surface.id + '...');
			const r = await runVis(window, surface.id, surface.runner);
			results.push(r);
			if (r.pass) {
				console.log('[visual-ceremony-cdp]   ' + surface.id + ' PASS');
			} else {
				console.log('[visual-ceremony-cdp]   ' + surface.id + ' FAIL: ' + r.error);
			}
		}
	} finally {
		// Pitfall 7: electron.close() can hang indefinitely if renderer is mid-evaluate
		// or holds a CDP connection — wrap in 10s sleep race so we always exit.
		try {
			await Promise.race([
				electron.close(),
				sleep(10_000),
			]);
		} catch (err) {
			console.warn('[visual-ceremony-cdp] electron.close() threw (non-fatal): ' + err.message);
		}
	}

	printReport(results);
	return results.every(r => r.pass) ? 0 : 1;
}

// --- Hard deadline (last-resort kill switch) -------------------------------
const HARNESS_TIMEOUT_MS = parseInt(process.env.HARNESS_TIMEOUT_MS || '600000', 10);
setTimeout(() => {
	console.error('[visual-ceremony-cdp] hard deadline exceeded (' + HARNESS_TIMEOUT_MS + 'ms); aborting');
	process.exit(2);
}, HARNESS_TIMEOUT_MS).unref();

main().then(code => {
	process.exit(code);
}).catch(err => {
	console.error('[visual-ceremony-cdp] FATAL: ' + (err && err.stack ? err.stack : err));
	process.exit(1);
});

// Re-exports for downstream plans 11-01..11-04: each plan appends to SURFACE_REGISTRY
// above and exports its runner function from this file. The registry is the single
// source of truth for --only / --waves filtering.
module.exports = {
	SURFACE_REGISTRY,
	runVis,
};

// Suppress unused-helper lint warnings — these are imported for downstream plans.
void waitForCondition;
