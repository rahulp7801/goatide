/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/inspector-app-header.test.tsx — Phase 15 Plan 15-04 (Wave 3 GREEN
// flip from the Plan 15-01 Wave-0 RED stub).
//
// Verifies the App.tsx top-level component renders the locked SC#2 header literal
// 'Viewing snapshot — graph is read-only' (byte-equal including em-dash U+2014) with the
// data-testid='inspector-header-readonly' query handle.
//
// The describe block name is preserved verbatim from the Wave-0 stub for VALIDATION.md
// grep continuity. The Cytoscape mount inside <Graph/> is allowed to fail under jsdom
// (spike outcome from Plan 15-01 Task 8) — the React tree completes its initial render
// pass before the Cytoscape effect throws, so the header element is mounted in the DOM
// regardless. We assert ONLY on the header, not on Graph.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';
import { App } from '../../../src/inspector/webview/App.js';
import type { WebviewRpc } from '../../../src/inspector/rpc.js';

function makeStubRpc(): WebviewRpc {
	const stub = {
		subscribe: () => () => { /* unsubscribe noop */ },
		postReady: () => { /* noop */ },
		postRequestSnapshot: (_asOf: string) => { /* noop */ },
	};
	return stub as unknown as WebviewRpc;
}

describe('inspector header read-only', () => {
	afterEach(() => cleanup());

	it('App renders literal "Viewing snapshot — graph is read-only" in the header', () => {
		const rpc = makeStubRpc();
		// Render inside try/catch: Cytoscape's getContext('2d') throws under jsdom; the React
		// commit completes before the layout effect fires so the header IS in the DOM by then.
		try {
			render(React.createElement(App, { rpc }));
		} catch {
			// Spike-fail expected when Cytoscape mount fires; header was already painted.
		}
		const header = document.querySelector('[data-testid="inspector-header-readonly"]');
		assert.ok(header, 'header element exists with data-testid="inspector-header-readonly"');
		assert.strictEqual(
			header?.textContent,
			'Viewing snapshot — graph is read-only',
			'header literal must be byte-equal to ROADMAP SC#2 — including em-dash U+2014',
		);
	});
});
