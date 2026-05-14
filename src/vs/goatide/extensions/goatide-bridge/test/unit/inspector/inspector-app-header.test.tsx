/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// RED stub for Plan 15-04 - Wave-0-first per Nyquist Dim 8d. GREEN-flips when Wave 3 lands
// the App.tsx header element with literal text "Viewing snapshot - graph is read-only".
//
// Loading App.tsx must use require() (not import) — the file does not exist yet at Wave 0,
// so a static import would break tsc. require() defers resolution to runtime, producing the
// clean RED at test execution (MODULE_NOT_FOUND) rather than a compile error that blocks
// every other inspector test.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

describe('inspector header read-only', () => {
	it('App renders literal "Viewing snapshot - graph is read-only" in the header', () => {
		// Wave 3 (Plan 15-04) creates src/inspector/webview/App.tsx with the header literal
		// "Viewing snapshot - graph is read-only" (SC#2 — inspector header must literally
		// display the read-only label at all times). At Wave 0 the source file does not
		// exist; this is RED by design.
		//
		// On Wave 3 GREEN-flip, this body becomes:
		//   const { App } = require('../../../src/inspector/webview/App.js');
		//   render(React.createElement(App, { payload: { snapshot } }));
		//   assert.ok(document.body.textContent?.includes('Viewing snapshot - graph is read-only'));
		assert.fail('Wave 3 implements - Plan 15-04 GREEN-flips (SC#2 read-only header literal)');
	});
});
