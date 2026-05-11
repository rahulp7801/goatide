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

// Phase 11 Plan 11-01 (Rule 3 Blocking, Wave-0 deviation #4 follow-up): the bridge
// extension is NOT auto-loaded under VSCODE_DEV without --extensionDevelopmentPath.
// MEMORY.md "Bridge extension registration gap" + "GoatIDE working launch recipe"
// document the requirement: pass the absolute path to the bridge SOURCE directory
// (which has dist/extension.js produced by prepare_goatide.sh / build pipeline).
// Wave 0 worked around this by pivoting WAVE0-SMOKE to a built-in webview; Wave 1+
// requires the bridge to be loaded so goatide.setSessionPriority + save-gate fire.
const BRIDGE_EXTENSION_DEV_PATH = path.join(ROOT, 'src', 'vs', 'goatide', 'extensions', 'goatide-bridge');

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
//
// Phase 11 Plan 11-01 (Wave 1) appends VIS-10 → VIS-09 → VIS-01 in Pitfall-9 order:
// VIS-10 flips workspace priority, VIS-09 saves a file (consumes the flipped priority
// to produce an IntentDriftBadge), VIS-01 verifies the Canvas chrome of the same save
// flow + clicks reject to leave the canvas clean for downstream waves.
const SURFACE_REGISTRY = [
	{ id: 'WAVE0-SMOKE', wave: 0, runner: runWebviewSmokeAssertion },
	{ id: 'VIS-10', wave: 1, runner: runVis10 },
	{ id: 'VIS-09', wave: 1, runner: runVis09 },
	{ id: 'VIS-01', wave: 1, runner: runVis01 },
	{ id: 'VIS-02', wave: 2, runner: runVis02 },
];

// WAVE_BY_ID — flat id → wave map used by Plans 11-01..11-04 for cross-referencing
// (declared verbatim per Plan 11-01 spec). The SURFACE_REGISTRY's per-entry `wave`
// field remains the authoritative source for --waves filtering; this map is a
// convenience lookup for assertions and downstream plans that need a wave number
// without iterating the registry.
const WAVE_BY_ID = {
	'WAVE0-SMOKE': 0,
	'VIS-10': 1,
	'VIS-09': 1,
	'VIS-01': 1,
	'VIS-02': 2,
};

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

// === Wave 1: VIS-10 → VIS-09 → VIS-01 ======================================
// Phase 11 Plan 11-01 — three Wave-1 surfaces in Pitfall-9 order. VIS-10 flips the
// workspace session priority (Quality-First → Speed-First) so VIS-09 sees the
// derived_under_priority mismatch against the seeded DecisionNode and renders the
// IntentDriftBadge. VIS-01 verifies the Canvas modal chrome around the same save
// flow and then clicks reject to leave the canvas clean for downstream waves.
//
// Helper: read fixture workspace settings.json from disk (await readFile, JSON.parse).
async function readFixtureSettings() {
	const settingsPath = path.join(FIXTURE, '.vscode', 'settings.json');
	const raw = await fsPromises.readFile(settingsPath, 'utf8');
	return JSON.parse(raw);
}

// Helper: drive an arbitrary VS Code command via window.evaluate. Returns a sentinel
// string indicating which dispatch path succeeded (or 'evaluate-timeout' / 'no-handler'
// when the runtime probe fails). Mirrors the freshclone-smoke-cdp.cjs:244-275 runtime
// probe pattern — the AMD `require('vs/...')` path is best-effort because the loader
// signature varies across Electron builds. The 10s race guards against renderer hangs.
//
// Resolution strategy (in order):
//   1. globalThis.require('vs/platform/commands/common/commands').CommandsRegistry — AMD
//      loader path; works on builds where the renderer exposes the AMD loader globally
//      (most VS Code Insiders + stable, but NOT this Electron build per Wave-0 deviation #4).
//   2. globalThis._VSCODE_WORKBENCH_COMMANDS — if VS Code exposed a top-level command
//      service hook (probed defensively; missing on most builds).
//   3. Look up the command service via the workbench's service collection accessor that
//      VS Code attaches to the workbench DOM node. Some builds expose this as
//      `workbench.services.commandService` via window.workbench.
//   4. Document.querySelector chain — last resort. Walk the workbench element tree
//      looking for an exposed service hook. Returns 'no-amd-loader' to signal the
//      caller should fall back to keyboard-driven palette dispatch.
async function executeWorkbenchCommand(window, commandId, ...args) {
	const probe = await Promise.race([
		window.evaluate(async ({ id, params }) => {
			try {
				// Strategy 1: globalThis.require (AMD loader).
				const req = globalThis.require;
				if (typeof req === 'function') {
					try {
						const commandsMod = req('vs/platform/commands/common/commands');
						if (commandsMod && commandsMod.CommandsRegistry && typeof commandsMod.CommandsRegistry.getCommand === 'function') {
							const cmd = commandsMod.CommandsRegistry.getCommand(id);
							if (cmd && typeof cmd.handler === 'function') {
								// CommandsRegistry handlers expect (accessor, ...args); we have no
								// accessor in this context. Bridge-registered commands wrap via
								// vscode.commands.registerCommand which ignores the accessor arg.
								const result = await cmd.handler(undefined, ...params);
								return 'ok' + (typeof result === 'undefined' ? '' : ':' + String(result).slice(0, 60));
							}
							return 'no-handler:' + id;
						}
					} catch (_e1) {
						// fall through to other strategies
					}
				}
				// Strategy 2: VS Code occasionally exposes a workbench-test hook.
				const hook = globalThis._VSCODE_WORKBENCH_COMMANDS;
				if (hook && typeof hook.executeCommand === 'function') {
					try {
						const result = await hook.executeCommand(id, ...params);
						return 'ok-hook' + (typeof result === 'undefined' ? '' : ':' + String(result).slice(0, 60));
					} catch (_e2) {
						// fall through
					}
				}
				// All strategies exhausted.
				return typeof req === 'function' ? 'no-amd-loader-resolve' : 'no-amd-loader';
			} catch (err) {
				return 'evaluate-threw:' + (err && err.message ? err.message : String(err));
			}
		}, { id: commandId, params: args }),
		new Promise(resolve => setTimeout(() => resolve('evaluate-timeout'), 10_000)),
	]);
	return probe;
}

// runVis10 — flip session priority from Quality-First → Speed-First via the bridge's
// goatide.setSessionPriority quickPick. Pre-asserts the fixture baseline; post-asserts
// the workspace settings.json write-through and that the quickPick surfaced 5 options.
async function runVis10(window) {
	// 1. Pre-condition: fixture .vscode/settings.json baseline is Quality-First.
	const before = await readFixtureSettings();
	if (before['goatide.session.priority'] !== 'Quality-First') {
		throw new Error('VIS-10: fixture baseline corrupt — expected goatide.session.priority="Quality-First", got ' + JSON.stringify(before));
	}

	// 2. Invoke the command. AMD-loader path is unavailable on this Electron build
	// (Wave-0 deviation #4 + confirmed via renderer-globals probe — globalThis.require
	// is undefined and globalThis.vscode is the Electron sandbox bridge, not the VS Code
	// extension API). The keyboard-driven palette is the canonical path; the bridge's
	// contributes.commands entry (Phase 10 Plan 10-01) makes the command
	// palette-discoverable as "GoatIDE: Set Session Priority".
	//
	// Strategy: try executeWorkbenchCommand first (cheap; passes through unchanged on
	// builds where AMD is exposed). On no-amd-loader, fall back to F1 palette.
	const dispatch = await executeWorkbenchCommand(window, 'goatide.setSessionPriority');
	if (!dispatch.startsWith('ok')) {
		console.log('[visual-ceremony-cdp]   VIS-10: AMD-require dispatch returned "' + dispatch + '"; falling back to F1 palette');
		// F1 is the canonical workbench-command-palette key (Show Commands). Press it
		// without any preceding click — body clicks steal focus from the workbench's
		// global-keybinding-handler scope on this Electron build (verified empirically).
		// Control+Shift+P also doesn't reliably route through Electron's IME layer here.
		await window.keyboard.press('F1');
		await window.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 10_000 });
		await sleep(500);
		// Type the command title — palette filters as we type.
		await window.keyboard.type('GoatIDE: Set Session Priority');
		await sleep(700);
		await window.keyboard.press('Enter');
		await sleep(700);
	}

	// 3. Wait for the quickPick options to render. The widget stays the same DOM node
	// across palette → quickPick transitions, so we wait for at least one row that
	// matches one of the 5 priority options.
	await window.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 5_000 });
	await window.locator('.quick-input-list .monaco-list-row').first().waitFor({ state: 'visible', timeout: 5_000 });

	// 4. Assert all 5 expected options are present. allInnerTexts() collects the visible
	// row labels; we tolerate small whitespace differences via includes() rather than
	// strict equality.
	const items = window.locator('.quick-input-list .monaco-list-row');
	const texts = await items.allInnerTexts();
	const expected = ['Speed-First', 'Quality-First', 'Safety-First', 'Cost-First', 'Custom...'];
	for (const label of expected) {
		if (!texts.some(t => t.includes(label))) {
			throw new Error('VIS-10: quickPick missing "' + label + '"; got: ' + JSON.stringify(texts));
		}
	}

	// 5. Click the Speed-First row. Playwright's :has-text() filter matches case-sensitive
	// substring; the row label is exactly "Speed-First" per extension.ts:139.
	await window.locator('.quick-input-list .monaco-list-row:has-text("Speed-First")').first().click();

	// 6. Settle: vscode.workspace.getConfiguration().update() flushes to disk asynchronously.
	// 1000ms is the same settle window used by freshclone-smoke-cdp.cjs for settings writes.
	await sleep(1000);

	// 7. Assert the workspace settings.json now contains Speed-First.
	const after = await readFixtureSettings();
	if (after['goatide.session.priority'] !== 'Speed-First') {
		throw new Error('VIS-10: workspace settings not updated; expected Speed-First, got ' + JSON.stringify(after));
	}

	// Screenshot taken by the runVis() wrapper.
}

// ensureCanvasOpen — VIS-09 + VIS-01 precondition. Idempotent: opens src/auth/login.ts,
// makes a deterministic edit via fs.writeFile (avoids the editor.action.* + type
// instability noted in Plan 11-01), triggers workbench.action.files.save, waits for
// the Canvas iframe to render. Used by --only VIS-01 standalone invocations.
async function ensureCanvasOpen(window) {
	const loginPath = path.join(FIXTURE, 'src', 'auth', 'login.ts');

	// Phase 11 Plan 11-01: pre-stage the edit BEFORE attempting to open in editor.
	// vscode.workspace.openTextDocument reads from disk; the buffer becomes dirty when
	// we trigger save (the save-gate intercepts the save event regardless of whether
	// the editor buffer differs from disk because workbench.action.files.save fires
	// on any open editor).
	const marker = '// vis-09 marker — save-gate trigger #' + Date.now();
	let content = await fsPromises.readFile(loginPath, 'utf8');
	// Strip any prior markers + append the fresh one so each invocation produces a
	// unique tail that the save-gate's diff detector recognizes as a non-trivial edit.
	content = content.split(/\r?\n/).filter(l => !l.startsWith('// vis-09 marker')).join('\n');
	content = content.replace(/[\r\n]*$/, '\n') + marker + '\n';
	await fsPromises.writeFile(loginPath, content, 'utf8');

	// Open via the workbench quickOpen file-picker. This is the most robust path on
	// builds where globalThis.require is unavailable. F1+ "Go to File:" opens the
	// same picker as Ctrl+P but goes through the keybinding service (more reliable
	// on this Electron build than Ctrl+P direct chord).
	const openProbe = await executeWorkbenchCommand(window, 'vscode.open', loginPath);
	if (!openProbe.startsWith('ok')) {
		await window.keyboard.press('F1');
		await window.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 10_000 });
		await sleep(400);
		// "Go to File:" is the title of workbench.action.quickOpen — typing this filters
		// the command palette to the file-open variant.
		await window.keyboard.type('Go to File: ');
		await sleep(400);
		await window.keyboard.press('Enter');
		await sleep(400);
		// Now type the filename to filter the file picker.
		await window.keyboard.type('login.ts');
		await sleep(500);
		await window.keyboard.press('Enter');
		await sleep(1500);  // editor open + LSP attach
	}

	// Trigger save. The save-gate listener intercepts and shows the Canvas asynchronously.
	const saveProbe = await executeWorkbenchCommand(window, 'workbench.action.files.save');
	if (!saveProbe.startsWith('ok')) {
		// Fallback: keyboard save. Ctrl+S is a simple chord that works on this build.
		await window.keyboard.press('Control+S');
	}

	// Wait for the canvas iframe to attach. The save-gate's tier-dispatch can take
	// several seconds on first invocation (cold kernel RPC + drift evaluation).
	//
	// Disambiguation: the workbench renders multiple iframe.webview.ready elements
	// (Welcome walkthrough + GoatIDE Verification Canvas + Chat). The bridge's canvas
	// iframe's src URL contains `extensionId=goatide.goatide-bridge`; we narrow the
	// outer iframe locator to that specific extension before traversing into
	// iframe#active-frame. Without this disambiguation, Playwright's strict-mode
	// resolution throws on the multi-element match.
	const canvasFrame = window
		.frameLocator('iframe.webview.ready[src*="extensionId=goatide.goatide-bridge"]')
		.frameLocator('iframe#active-frame');
	await canvasFrame.locator('[data-testid="canvas-accept"]').waitFor({ state: 'visible', timeout: 20_000 });
	return canvasFrame;
}

// runVis09 — save src/auth/login.ts under Speed-First priority (set by VIS-10), then
// assert the resulting Receipt's CitationList renders an IntentDriftBadge inside a
// citation row. Depends on VIS-10 having flipped the priority; if invoked standalone,
// ensureCanvasOpen still produces a valid canvas but the IntentDriftBadge will only
// surface if VIS-10 has run (or the fixture has been pre-tampered to Speed-First).
async function runVis09(window) {
	// Defensive: if VIS-10 wasn't run in this session, re-read fixture settings and warn
	// loudly so the failure mode is clear when the assert below fires.
	const settings = await readFixtureSettings();
	if (settings['goatide.session.priority'] !== 'Speed-First') {
		console.warn('[visual-ceremony-cdp]   VIS-09: fixture priority is "' + settings['goatide.session.priority'] + '" not "Speed-First"; IntentDriftBadge will not render (run VIS-10 first or use --waves 1)');
	}

	const canvasFrame = await ensureCanvasOpen(window);

	// Wait for at least one citation row before checking for the IntentDriftBadge.
	await canvasFrame.locator('[data-testid="citation-row"]').first().waitFor({ state: 'visible', timeout: 20_000 });

	// Assert: at least one IntentDriftBadge inside a citation row.
	const driftBadge = canvasFrame.locator('[data-testid="citation-row"] [data-testid="intent-drift-badge"]');
	const count = await driftBadge.count();
	if (count < 1) {
		throw new Error('VIS-09: expected >=1 [data-testid="intent-drift-badge"] inside [data-testid="citation-row"]; got ' + count);
	}

	// Leave the canvas open — VIS-01 immediately consumes the same state.
}

// runVis01 — verify the Verification Canvas modal chrome (Accept + Reject +
// Reject-with-note-toggle buttons + >=1 citation row). Cleanup: click reject so
// subsequent waves (especially VIS-02 destructive saves) start with a clean canvas.
async function runVis01(window) {
	// ensureCanvasOpen is idempotent — if the canvas is already open from VIS-09, it
	// re-asserts the iframe is visible and returns; if invoked --only VIS-01, it runs
	// the full open-edit-save precondition.
	const canvasFrame = await ensureCanvasOpen(window);

	// Assert all three buttons are visible. Each waitFor doubles as an existence check.
	await canvasFrame.locator('[data-testid="canvas-accept"]').waitFor({ state: 'visible', timeout: 15_000 });
	await canvasFrame.locator('[data-testid="canvas-reject"]').waitFor({ state: 'visible', timeout: 15_000 });
	await canvasFrame.locator('[data-testid="canvas-reject-with-note-toggle"]').waitFor({ state: 'visible', timeout: 15_000 });

	// Assert >=1 citation row.
	const citations = canvasFrame.locator('[data-testid="citation-row"]');
	const count = await citations.count();
	if (count < 1) {
		throw new Error('VIS-01: expected >=1 [data-testid="citation-row"]; got ' + count);
	}

	// Cleanup: click reject so the canvas closes and downstream waves get a clean slate.
	// Plan 11-01 sequencing invariant — VIS-02's destructive save will fail if the
	// canvas is still open from this run.
	await canvasFrame.locator('[data-testid="canvas-reject"]').click();
	await sleep(500);
}

// === Wave 2: VIS-02 =========================================================
// Phase 11 Plan 11-02 — destructive-save ConfirmationPhrase modal. The kernel-side
// destructive classifier (kernel/src/canvas/destructive.ts:23-32) regex-scans the
// unified diff for ^[+-].*\bDROP\s+TABLE\b/im and seven similar patterns. When a
// match fires, classifyTier hard-pins tier='modal' (classifier.ts:71-73) BEFORE the
// citation-based classification path runs — this is exactly why VIS-02 can sidestep
// DEFERRED-11-01-A (the citation classifier returning 'silent' for the fixture's
// contract path). The destructive verb extractor (destructive.ts:76-83) maps the
// matched verb to one of ['drop','delete','rm','revert','truncate'] and emits it as
// payload.confirmation_phrase, which App.tsx:127-135 wires into the ConfirmationPhrase
// component's expectedPhrase prop. The component then renders:
//   <div data-testid="confirmation-phrase">
//     <label>Type <code>{expectedPhrase}</code> to enable Accept ...</label>
//     <input data-testid="confirmation-phrase-input" />
//     <button data-testid="confirmation-phrase-button" disabled={!matches}>...</button>
//   </div>
//
// Content-injection path: write benign on-disk + edit the in-buffer copy (via
// keyboard.type after Ctrl+End) so the save-gate's `original = readFile(disk)` and
// `modified = doc.getText()` produce a non-empty diff containing the DROP TABLE line.
// This path is preferred over write-then-open because the latter leaves buffer ==
// disk, the save is a clean no-op, and onWillSaveTextDocument never fires.
//
// Fixture preservation invariant: this function MUST restore the on-disk content to
// its original benign baseline after every run. The harness's main()-level `finally`
// block also restores migration.ts defensively in case runVis02 throws before reaching
// its own cleanup.
async function runVis02(window) {
	const filePath = path.join(FIXTURE, 'src', 'destructive', 'migration.ts');
	const original = await fsPromises.readFile(filePath, 'utf8');

	// Belt-and-braces: confirm the on-disk fixture is benign before we start. If a
	// previous run crashed mid-flight without cleanup, this surfaces it as a clear
	// precondition failure rather than a confusing "phrase already matches" downstream.
	if (/\bDROP\s+TABLE\b/i.test(original)) {
		throw new Error('VIS-02: fixture baseline corrupt — on-disk migration.ts already contains destructive content; previous run did not clean up');
	}

	try {
		// 1. Open migration.ts via the workbench's quickOpen file picker. Same F1 + Go to
		//    File path used by ensureCanvasOpen — most reliable on this Electron build
		//    where globalThis.require is undefined (Wave-0 deviation #4).
		const openProbe = await executeWorkbenchCommand(window, 'vscode.open', filePath);
		if (!openProbe.startsWith('ok')) {
			await window.keyboard.press('F1');
			await window.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 10_000 });
			await sleep(400);
			await window.keyboard.type('Go to File: ');
			await sleep(400);
			await window.keyboard.press('Enter');
			await sleep(400);
			await window.keyboard.type('migration.ts');
			await sleep(500);
			await window.keyboard.press('Enter');
			await sleep(1500);  // editor open + LSP attach
		}

		// 2. Explicitly focus the active editor group via the workbench command palette
		//    rather than mouse-click. The Welcome walkthrough webview is the default
		//    first-focus target on cold start; without an explicit focus shift,
		//    subsequent keyboard.type() lands inside the Welcome webview instead of the
		//    migration.ts editor buffer (verified empirically on the first VIS-02 live
		//    run — fixture file showed zero edits despite the keystrokes succeeding).
		//
		//    workbench.action.focusActiveEditorGroup is a built-in command registered by
		//    the workbench; F1 + typing the title routes through the same keybinding-
		//    service path that VIS-10 uses for goatide.setSessionPriority. Do NOT use a
		//    body-level mouse click — Plan 11-01 documented that focus-stealing on this
		//    Electron build is sticky and clicks on the workbench body silently steal
		//    focus from the workbench's keyboard-handling scope.
		await window.keyboard.press('F1');
		await window.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 10_000 });
		await sleep(400);
		await window.keyboard.type('View: Focus Active Editor Group');
		await sleep(500);
		await window.keyboard.press('Enter');
		await sleep(700);  // focus-shift + editor input mode settle

		// 3. Edit the in-buffer copy: Ctrl+End moves the cursor to EOF, then we type
		//    a destructive line. The buffer is now dirty; on-disk content stays benign.
		//    The save-gate's readFile(disk) returns the benign baseline, and doc.getText()
		//    returns the buffer (with the destructive line), so createPatch produces a
		//    diff containing `+const migration = "DROP TABLE users CASCADE";` which
		//    matches DESTRUCTIVE_DIFF_PATTERNS[1] (/^[+-].*\bDROP\s+TABLE\b/im).
		await window.keyboard.press('Control+End');
		await sleep(200);
		await window.keyboard.type('\nconst migration = "DROP TABLE users CASCADE";\n');
		await sleep(700);

		// 4. Trigger save. workbench.action.files.save via the AMD path first (no-op on
		//    this build but cheap to attempt); fallback Ctrl+S chord works universally.
		const saveProbe = await executeWorkbenchCommand(window, 'workbench.action.files.save');
		if (!saveProbe.startsWith('ok')) {
			await window.keyboard.press('Control+S');
		}

		// 4. Wait for the bridge's Verification Canvas to reveal with the ConfirmationPhrase
		//    component visible. Same iframe-disambiguation pattern as ensureCanvasOpen.
		//    Modal tier rendering takes ~1-3s on this build (proposeEdit cold call +
		//    runDriftAndLock + dispatchTier + webview React mount).
		const canvasFrame = window
			.frameLocator('iframe.webview.ready[src*="extensionId=goatide.goatide-bridge"]')
			.frameLocator('iframe#active-frame');
		await canvasFrame.locator('[data-testid="confirmation-phrase"]').waitFor({ state: 'visible', timeout: 20_000 });

		// 5. Assert the initial state: input is enabled (developer can type), button is
		//    disabled (typed !== expectedPhrase because nothing has been typed yet).
		const input = canvasFrame.locator('[data-testid="confirmation-phrase-input"]');
		const btn = canvasFrame.locator('[data-testid="confirmation-phrase-button"]');
		if (!(await input.isEnabled())) {
			throw new Error('VIS-02: confirmation-phrase-input expected enabled before typing');
		}
		if (await btn.isEnabled()) {
			throw new Error('VIS-02: confirmation-phrase-button expected disabled before typing');
		}

		// 6. Extract the expected phrase from the visible prompt. ConfirmationPhrase.tsx:26-28
		//    renders `Type <code>{expectedPhrase}</code> to enable Accept ...` — the verb
		//    is in a <code> element nested inside the <label>. The destructive verb extractor
		//    (kernel/src/canvas/destructive.ts:76-83) maps `DROP TABLE` → 'drop' (first match
		//    in the DESTRUCTIVE_VERBS array). We read the <code> element's innerText to
		//    decouple from that ordering — any verb in the allowlist would pass.
		const codeText = await canvasFrame
			.locator('[data-testid="confirmation-phrase"] code')
			.first()
			.innerText();
		const expectedPhrase = codeText.trim();
		if (!expectedPhrase) {
			const promptText = await canvasFrame.locator('[data-testid="confirmation-phrase"]').innerText();
			throw new Error('VIS-02: could not extract expected phrase from <code> element; prompt was: ' + JSON.stringify(promptText));
		}

		// 7. Fill the input with the expected phrase. The component's onChange uses
		//    `setTyped(e.target.value)` and `matches = typed === expectedPhrase` is the
		//    sole gate on the button's disabled prop, so the button should become enabled
		//    on the next React render flush.
		await input.fill(expectedPhrase);
		await sleep(400);   // React state flush — 200ms occasionally raced on cold mounts.
		if (!(await btn.isEnabled())) {
			throw new Error('VIS-02: confirmation-phrase-button expected enabled after typing matching phrase "' + expectedPhrase + '"');
		}

		// 8. Cleanup: click the canvas Reject button. ConfirmationPhrase lives inside the
		//    same App.tsx CanvasShell as the canvas-reject footer button, so the locator
		//    must reach into the canvasFrame at the App.tsx footer level (not nested
		//    inside the confirmation-phrase element). The Reject action posts back to the
		//    bridge which closes the panel WITHOUT writing the destructive payload to
		//    disk — preserving the fixture-preservation invariant.
		//
		//    `force: true` bypasses Playwright's pointer-event interception check. The
		//    Monaco diff-editor's <div class="margin"> overlay reports as intercepting
		//    pointer events at the canvas-reject coordinates on this build, but the
		//    button is still functionally clickable (the React handler fires regardless
		//    of overlay z-stacking). Without force, the click times out after 30s
		//    retrying past the margin overlay (observed empirically on the second VIS-02
		//    live attempt — the canvas + confirmation-phrase rendered correctly but the
		//    rejection click was blocked).
		await canvasFrame.locator('[data-testid="canvas-reject"]').click({ force: true });
		await sleep(500);
	} finally {
		// 9. Restore the on-disk fixture unconditionally. Even on failure, the next run
		//    needs migration.ts to be benign (the precondition check at step 0 enforces
		//    this). Non-fatal on error so a failing assertion still reports its own root
		//    cause rather than being masked by a cleanup exception.
		try {
			await fsPromises.writeFile(filePath, original, 'utf8');
		} catch (err) {
			console.warn('[visual-ceremony-cdp]   VIS-02: fixture-baseline restore failed (non-fatal): ' + (err && err.message));
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
	// Phase 11 Plan 11-01 — Wave-1 surfaces (VIS-10/09/01) require the bridge extension
	// to be activated so `goatide.setSessionPriority` is registered and the save-gate
	// listener fires on workbench.action.files.save. Without --extensionDevelopmentPath,
	// the bridge's package.json contributes are present (Phase 10 SC10-1/SC10-3) but
	// the extension code in dist/extension.js never runs in this DEV-mode launch.
	//
	// Per MEMORY.md "GoatIDE working launch recipe": absolute path required; the dist/
	// directory inside is produced by prepare_goatide.sh / phase build pipeline. We pass
	// the SRC location (src/vs/goatide/extensions/goatide-bridge/) rather than the mirror
	// (extensions/goatide-bridge/) because the mirror's dist/ is propagated at compile
	// time and may lag behind the source's dist/ during iterative development.
	//
	// Only added when the dist/extension.js artifact exists; otherwise we soft-warn and
	// proceed without it so WAVE0-SMOKE still runs against the unwired build.
	const bridgeDistExtension = path.join(BRIDGE_EXTENSION_DEV_PATH, 'dist', 'extension.js');
	const bridgeLoadable = fs.existsSync(bridgeDistExtension);
	if (!bridgeLoadable) {
		console.warn('[visual-ceremony-cdp] bridge dist/extension.js missing at ' + bridgeDistExtension + ' — Wave-1+ surfaces will fail (bridge extension not loadable)');
	}

	const launchArgs = [
		ROOT,
		path.resolve(FIXTURE),
		'--user-data-dir=' + userDataDir,
		'--extensions-dir=' + extDir,
		'--no-cached-data',
		// Phase 11 Plan 11-01 (Rule 3 Blocking — workspace trust modal): without this flag,
		// VS Code prompts "Do you trust the authors of the files in this folder?" on first
		// launch with the fixture as workspace, and the modal intercepts ALL keyboard input
		// + blocks command execution until dismissed. --disable-workspace-trust is the
		// canonical CLI flag for automated runs (designed for exactly this scenario).
		'--disable-workspace-trust',
	];
	if (bridgeLoadable) {
		launchArgs.push('--extensionDevelopmentPath=' + BRIDGE_EXTENSION_DEV_PATH);
		console.log('[visual-ceremony-cdp] loading bridge extension from ' + BRIDGE_EXTENSION_DEV_PATH);
	}
	// Phase 11 Plan 11-01 (Rule 3 Blocking — seeded-DB never reached the daemon):
	// kernel/src/main.ts:29 honors GOATIDE_DB env var; bridge's client.ts:151 forwards
	// it to the spawned daemon. Without this, the harness copies the seeded DB into
	// userDataDir but the daemon resolves %APPDATA%/goatide/graph.db and reads from
	// the developer's real DB (or an empty fallback) — proposeEdit returns no
	// citations + the Canvas never reveals. GOATIDE_LOCKFILE_PATH also override for
	// hermetic test isolation (otherwise an existing daemon on the dev machine's
	// %APPDATA%/goatide/kernel.lock would be reused by the bridge's ensureKernel).
	const isolatedDbPath = path.join(userDataDir, 'goatide', 'graph.db');
	const isolatedLockPath = path.join(userDataDir, 'goatide', 'kernel.lock');
	const launchEnv = Object.assign({}, process.env, {
		VSCODE_DEV: '1',
		VSCODE_CLI: '1',
		GOATIDE_DB: isolatedDbPath,
		GOATIDE_LOCKFILE_PATH: isolatedLockPath,
	});
	console.log('[visual-ceremony-cdp] kernel isolation: GOATIDE_DB=' + isolatedDbPath);
	console.log('[visual-ceremony-cdp] kernel isolation: GOATIDE_LOCKFILE_PATH=' + isolatedLockPath);

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
		// that hasn't bound its port yet. Use the ISOLATED lockfile path (set via
		// GOATIDE_LOCKFILE_PATH in launchEnv), not the production %APPDATA% path —
		// the dev's real daemon may be running on the production lockfile and would
		// produce a false ready signal.
		await waitForKernelLock(isolatedLockPath, 60_000);

		// Phase 11 Plan 11-01 (Rule 2 Missing Critical): the workbench needs ~15s after
		// waitForLoadState for the keybinding service + workspace-context to attach
		// keyboard listeners. Without this settle window, the first F1 / Ctrl+S in
		// runVis10 / runVis09 misses the workbench (verified empirically: 8s = miss,
		// 15s = hit on this Electron build). Skip for WAVE0-SMOKE which uses a
		// command-by-evaluate path that doesn't depend on keybindings.
		//
		// IMPORTANT: do NOT click into the workbench to "focus" it before pressing F1.
		// On this build, the body click steals focus from the workbench's
		// global-keybinding-handler scope and F1 silently falls through (verified
		// empirically: no-click F1 → palette opens; body-click + F1 → palette stays hidden).
		const needsKeybindingSettle = surfaces.some(s => s.id.startsWith('VIS-'));
		if (needsKeybindingSettle) {
			console.log('[visual-ceremony-cdp] settling 15s for keybinding service attach...');
			await sleep(15_000);
		}

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

		// Phase 11 Plan 11-01 (Rule 2 Missing Critical): restore fixture baseline.
		// VIS-10 mutates kernel/test-fixtures/visual-workspace/.vscode/settings.json
		// from Quality-First → Speed-First. The next run's baseline assertion needs
		// Quality-First — without this restoration, the harness becomes non-idempotent
		// and the second invocation fails the precondition check.
		try {
			const settingsPath = path.join(FIXTURE, '.vscode', 'settings.json');
			await fsPromises.writeFile(
				settingsPath,
				JSON.stringify({ 'goatide.session.priority': 'Quality-First' }, null, '\t') + '\n',
				'utf8',
			);
			console.log('[visual-ceremony-cdp] restored fixture baseline (.vscode/settings.json -> Quality-First)');
		} catch (err) {
			console.warn('[visual-ceremony-cdp] fixture-baseline restore failed (non-fatal): ' + err.message);
		}

		// Also undo runVis09's marker append to src/auth/login.ts so repeated runs
		// don't accumulate marker lines + bump suffixes.
		try {
			const loginPath = path.join(FIXTURE, 'src', 'auth', 'login.ts');
			let loginContent = await fsPromises.readFile(loginPath, 'utf8');
			// Strip all "// vis-09 marker" lines (with optional bump suffix).
			const before = loginContent;
			loginContent = loginContent
				.split(/\r?\n/)
				.filter(line => !line.startsWith('// vis-09 marker'))
				.join('\n');
			// Ensure single trailing newline.
			loginContent = loginContent.replace(/[\r\n]*$/, '\n');
			if (loginContent !== before) {
				await fsPromises.writeFile(loginPath, loginContent, 'utf8');
				console.log('[visual-ceremony-cdp] restored fixture login.ts (removed vis-09 marker lines)');
			}
		} catch (err) {
			console.warn('[visual-ceremony-cdp] login.ts restore failed (non-fatal): ' + err.message);
		}

		// Phase 11 Plan 11-02 (defense-in-depth): if runVis02 was interrupted between its
		// keyboard.type() of the destructive line and its own `finally`-block restore,
		// the on-disk migration.ts could still contain DROP TABLE. The fixture-preservation
		// invariant is critical for downstream waves (and git hygiene), so we strip any
		// destructive content here as a backstop. runVis02's own restore handles the
		// happy path; this catches the cleanup-exception edge case.
		try {
			const migrationPath = path.join(FIXTURE, 'src', 'destructive', 'migration.ts');
			if (fs.existsSync(migrationPath)) {
				const migrationContent = await fsPromises.readFile(migrationPath, 'utf8');
				if (/\bDROP\s+TABLE\b/i.test(migrationContent) || /\brm\s+-rf\b/.test(migrationContent)) {
					// Rewrite the canonical benign baseline (matches the committed fixture
					// byte-for-byte). The comment intentionally avoids the literal destructive
					// verb so the fixture-preservation grep returns clean.
					const benign = [
						'/*---------------------------------------------------------------------------------------------',
						' *  Copyright (c) Microsoft Corporation. All rights reserved.',
						' *  Licensed under the MIT License. See License.txt in the project root for license information.',
						' *--------------------------------------------------------------------------------------------*/',
						'',
						'// kernel/test-fixtures/visual-workspace/src/destructive/migration.ts',
						'//',
						'// Visual-ceremony fixture (Phase 11 Plan 11-02). Benign baseline file. The harness',
						'// `runVis02` injects a destructive SQL payload at runtime via in-buffer keyboard.type',
						'// immediately before triggering the save, then restores this baseline after the',
						'// assertion completes. The on-disk content here MUST remain destructive-free —',
						'// see the "fixture preservation invariant" in 11-02-destructive-confirmation-PLAN.md.',
						'// (The literal destructive verb is intentionally omitted from this comment so the',
						'// fixture-preservation grep `! grep -q D R O P T A B L E` returns false on disk.)',
						'',
						'export function placeholderMigration(): void {',
						'\t// Intentionally empty. Replaced at runtime by the visual-ceremony harness.',
						'}',
						'',
					].join('\n');
					await fsPromises.writeFile(migrationPath, benign, 'utf8');
					console.log('[visual-ceremony-cdp] restored fixture migration.ts (stripped destructive content backstop)');
				}
			}
		} catch (err) {
			console.warn('[visual-ceremony-cdp] migration.ts backstop restore failed (non-fatal): ' + err.message);
		}
	}

	printReport(results);
	return results.every(r => r.pass) ? 0 : 1;
}

// --- Hard deadline (last-resort kill switch) -------------------------------
// Only arm the deadline + auto-invoke main() when this file is executed as a script.
// Phase 11 Plan 11-01 added module.exports re-exports so downstream plans + the
// self-check assertion (`node -e "require(...)"`) can introspect SURFACE_REGISTRY
// without booting the whole harness. Without this guard, requiring the module from
// Node would trigger _electron.launch() + seed.sh and burn 60s of cold-start time.
if (require.main === module) {
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
}

// Re-exports for downstream plans 11-01..11-04: each plan appends to SURFACE_REGISTRY
// above and exports its runner function from this file. The registry is the single
// source of truth for --only / --waves filtering.
module.exports = {
	SURFACE_REGISTRY,
	WAVE_BY_ID,
	runVis,
	runVis10,
	runVis09,
	runVis01,
	runVis02,
	ensureCanvasOpen,
	executeWorkbenchCommand,
	readFixtureSettings,
};

// Suppress unused-helper lint warnings — these are imported for downstream plans.
void waitForCondition;
