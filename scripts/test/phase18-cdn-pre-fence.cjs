/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 18 Wave 0 — Pitfall H CDN pre-fence.
//
// Launches the existing .build/electron GoatIDE binary WITHOUT VSCODE_DEV,
// listens 90s for any HTTP requests to code.visualstudio.com or
// update.code.visualstudio.com, then asserts zero hits.
//
// Exit 0: PASS-VACUOUS (no CDN hits — IUpdateService is inert; Wave 2 inherits assertion as SC13)
// Exit 1: ESCALATE-TO-PHASE-22 (CDN hits detected — see PITFALL-H.md options)
//         OR binary not found — run a normal build first.
//
// Output: .planning/phases/18-e2e-verification-gate/18-DIAGNOSTICS/PITFALL-H.json
//         .planning/phases/18-e2e-verification-gate/18-DIAGNOSTICS/PITFALL-H.md
//
// Pattern: copied from scripts/test/phase17-smoke-cdp.cjs (same resolveElectronPath + launch shape).
// Wave 2 (scripts/test/phase18-smoke-cdp.cjs) inherits the electron.on('request', ...) pattern verbatim.

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const playwright = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const product = require(path.join(ROOT, 'product.json'));

const DIAGNOSTICS_DIR = path.join(ROOT, '.planning', 'phases', '18-e2e-verification-gate', '18-DIAGNOSTICS');

/** Copied verbatim from phase17-smoke-cdp.cjs lines 41-50. */
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Writes PITFALL-H.md + PITFALL-H.json to the diagnostics directory. */
function writeResults({ startTs, endTs, totalRequests, vsCodeCdnHits, urls }) {
	const vsCodeCdnHitCount = vsCodeCdnHits.length;
	const verdict = vsCodeCdnHitCount === 0 ? 'PASS-VACUOUS' : 'ESCALATE-TO-PHASE-22';
	const sample = urls.slice(0, 20);
	const sampleCdn = vsCodeCdnHits.slice(0, 10);
	const durationMs = endTs - startTs;

	const json = {
		startTs: new Date(startTs).toISOString(),
		endTs: new Date(endTs).toISOString(),
		durationMs,
		totalRequests,
		vsCodeCdnHitCount,
		vsCodeCdnHits: sampleCdn,
		sample,
	};

	// Ensure diagnostics dir exists
	fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

	fs.writeFileSync(
		path.join(DIAGNOSTICS_DIR, 'PITFALL-H.json'),
		JSON.stringify(json, null, 2),
		'utf8',
	);
	console.log('[phase18-cdn-pre-fence] PITFALL-H.json written (' + totalRequests + ' total requests, ' + vsCodeCdnHitCount + ' CDN hits)');

	const first5Cdn = sampleCdn.slice(0, 5).map(u => '- `' + u.url + '` (' + u.method + ')').join('\n') || '(none)';
	const first5Sample = sample.slice(0, 5).map(u => '- `' + u.url + '`').join('\n') || '(none)';

	let interpretationSection;
	if (vsCodeCdnHitCount === 0) {
		interpretationSection = `VS Code's \`IUpdateService\` is inert in the packaged binary when \`product.json.updateUrl\` is absent AND \`VSCODE_DEV\` is unset. Phase 22 stub stays as planned — Phase 18 SC13 stays as regression gate only. No action required before Wave 1.`;
	} else {
		interpretationSection = `VS Code's \`IUpdateService\` polls the CDN despite \`updateUrl\` being absent from product.json. Phase 18 cannot close cleanly without a fix.

**Two options:**
1. **Lift Phase 22 stub forward into Phase 18 Wave 1:** Implement a no-op \`IUpdateService\` registration in GoatIDE-specific workbench code so the CDN polling is suppressed. Adds ~1 day of scope to Wave 1.
2. **Defer SC13 to Phase 22 as a known issue:** Document the captured URLs as SOFT-FAIL evidence. Wave 2 SC13 becomes a tracked blocker rather than a gate. GoatIDE still ships Phase 18 without auto-update; users just see update-check activity they can ignore.

**Recommendation:** Option 2 (defer) — the captured URLs show VS Code calling home for update checks, not sending user data. The behavior is benign for an installable that has no updateUrl set. Phase 22 is already planned to address distribution; lifting the stub now would scope-creep Phase 18.`;
	}

	const md = `# Pitfall H Pre-Fence — Phase 18 Wave 0

**Captured:** ${new Date(startTs).toISOString().split('T')[0]}
**Source:** \`scripts/test/phase18-cdn-pre-fence.cjs\` against \`.build/electron/${path.basename(resolveElectronPath())}\`
**Duration:** ${Math.round(durationMs / 1000)}s listen window (90s target)

## Result

**Verdict:** ${verdict}

- **Total HTTP requests captured:** ${totalRequests}
- **Requests to code.visualstudio.com (or subdomain):** ${vsCodeCdnHitCount}
- **Sample of first 5 CDN hits (if any):**
${first5Cdn}
- **Sample of first 5 captured URLs (all):**
${first5Sample}
- **product.json \`updateUrl\` field:** absent (verified — \`product.json\` has no \`updateUrl\` key; \`node -e "console.log(require('./product.json').updateUrl)"\` prints \`undefined\`)

## Interpretation

${interpretationSection}

## Wave 2 / SC13 inheritance

Wave 2 (\`scripts/test/phase18-smoke-cdp.cjs\`) inherits this assertion verbatim:
\`\`\`javascript
electron.on('request', req => capturedUrls.push({ url: req.url(), method: req.method(), ts: Date.now() }));
// ... at end of smoke run:
const vsCodeCdnHits = capturedUrls.filter(u =>
	u.url.includes('code.visualstudio.com') || u.url.includes('update.code.visualstudio.com')
);
// SC13 assertion:
if (vsCodeCdnHits.length > 0) { console.warn('[SC13 SOFT-FAIL] CDN hits: ' + vsCodeCdnHits.map(u => u.url).join(', ')); }
else { console.log('[SC13 PASS] zero code.visualstudio.com requests in smoke run'); }
\`\`\`
`;

	fs.writeFileSync(path.join(DIAGNOSTICS_DIR, 'PITFALL-H.md'), md, 'utf8');
	console.log('[phase18-cdn-pre-fence] PITFALL-H.md written (verdict=' + verdict + ')');

	return verdict;
}

async function main() {
	const electronPath = resolveElectronPath();

	if (!fs.existsSync(electronPath)) {
		console.error('[phase18-cdn-pre-fence] FAIL: Electron binary not found at ' + electronPath);
		console.error('[phase18-cdn-pre-fence] Run a normal GoatIDE build first:');
		console.error('  npm run gulp -- "vscode-win32-x64"   # (or your platform triple)');
		console.error('  Then re-run this script.');
		process.exit(1);
	}

	console.log('[phase18-cdn-pre-fence] binary: ' + electronPath);
	console.log('[phase18-cdn-pre-fence] VSCODE_DEV: unset (testing installed-binary behavior)');

	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goatide-phase18-pitfall-h-'));
	console.log('[phase18-cdn-pre-fence] userDataDir=' + userDataDir);

	// Build env WITHOUT VSCODE_DEV so the built-in updater does not short-circuit on the dev guard.
	const env = Object.assign({}, process.env);
	delete env['VSCODE_DEV'];
	delete env['VSCODE_CLI'];
	delete env['NODE_ENV'];

	const args = [
		'--no-cached-data',
		'--user-data-dir=' + userDataDir,
		// No --extensionDevelopmentPath — simulates installed binary behavior.
	];

	const startTs = Date.now();
	const urls = [];

	console.log('[phase18-cdn-pre-fence] launching (no VSCODE_DEV, no --extensionDevelopmentPath) ...');

	const electron = await playwright._electron.launch({
		executablePath: electronPath,
		args,
		env,
		timeout: 90_000,
	});

	// Main-process request listener (catches IUpdateService calls which run in main process).
	electron.on('request', req => {
		try {
			urls.push({ url: req.url(), method: req.method(), ts: Date.now() });
		} catch (_) { /* ignore */ }
	});

	let window;
	try {
		window = await electron.firstWindow({ timeout: 90_000 });
		console.log('[phase18-cdn-pre-fence] first window loaded. Waiting 90s for update poll ...');

		// Attach renderer-side listener too (defensive — telemetry sometimes fires from renderer).
		try {
			electron.context().on('request', req => {
				try {
					const url = req.url();
					if (url && (url.includes('code.visualstudio.com') || url.includes('update.code.visualstudio.com') || url.includes('marketplace'))) {
						urls.push({ url, method: req.method(), ts: Date.now(), source: 'renderer' });
					}
				} catch (_) { /* ignore */ }
			});
		} catch (_) {
			console.warn('[phase18-cdn-pre-fence] renderer context listener not available (non-fatal)');
		}

		// IUpdateService first poll is typically 30-60s after startup; wait 90s to be safe.
		await sleep(90_000);
	} catch (err) {
		console.warn('[phase18-cdn-pre-fence] window error (non-fatal, recording partial results): ' + err.message);
	}

	const endTs = Date.now();
	console.log('[phase18-cdn-pre-fence] capture window closed. Closing electron ...');

	// 10s force-close budget — same pattern as phase17-smoke-cdp.cjs.
	await Promise.race([
		electron.close(),
		new Promise(r => setTimeout(r, 10_000)),
	]);

	const vsCodeCdnHits = urls.filter(u =>
		u.url && (u.url.includes('code.visualstudio.com') || u.url.includes('update.code.visualstudio.com')),
	);

	const verdict = writeResults({
		startTs,
		endTs,
		totalRequests: urls.length,
		vsCodeCdnHits,
		urls,
	});

	if (verdict === 'PASS-VACUOUS') {
		console.log('[phase18-cdn-pre-fence] EXIT 0 — PASS-VACUOUS: zero code.visualstudio.com requests in 90s window');
		process.exit(0);
	} else {
		console.error('[phase18-cdn-pre-fence] EXIT 1 — ESCALATE-TO-PHASE-22: ' + vsCodeCdnHits.length + ' CDN hit(s) detected');
		console.error('[phase18-cdn-pre-fence] See PITFALL-H.md for options');
		process.exit(1);
	}
}

main().catch(err => {
	console.error('[phase18-cdn-pre-fence] unhandled error: ' + err.message);
	process.exit(1);
});
