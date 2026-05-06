/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 smoke test (Plan 04-01) — asserts esbuild output exists.
// Always runnable (no tsx, no jsdom) — verifies `npm run build` produced the bundle.
// Plan 04-03 will add a richer smoke test asserting the bundle imports React + Monaco
// without throwing under jsdom.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('CANV-01 — webview build smoke', () => {
	it('dist/canvas/index.js exists after npm run build', () => {
		const out = path.resolve(__dirname, '..', '..', 'dist', 'canvas', 'index.js');
		assert.ok(
			fs.existsSync(out),
			`webview bundle missing at ${out} — run \`npm run build\` first (Plan 04-01 esbuild config).`
		);
		const stat = fs.statSync(out);
		assert.ok(stat.size > 0, `webview bundle is empty at ${out}`);
	});
	it('dist/extension.js exists after npm run build', () => {
		const out = path.resolve(__dirname, '..', '..', 'dist', 'extension.js');
		assert.ok(fs.existsSync(out), `extension bundle missing at ${out}`);
	});
});
