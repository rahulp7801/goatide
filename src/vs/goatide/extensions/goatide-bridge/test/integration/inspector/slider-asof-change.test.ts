/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/integration/inspector/slider-asof-change.test.ts — Phase 15 Plan 15-04 (Wave 3
// GREEN flip from the Plan 15-01 Wave-0 RED stub).
//
// Integration coverage for the slider <-> host RPC round-trip:
//   webview slider drag
//     -> inspector.requestSnapshot({asOf}) [WebviewToHost]
//     -> (host calls KernelClient.queryGraphSnapshot under panel.ts handleMessage in
//         production — here we stub the rpc surface; the host -> kernel half is covered
//         by Plan 15-02 kernel tests + Plan 15-03 panel.ts integration tests)
//     -> host posts inspector.show({nodes, edges, truncated}) [HostToWebview]
//     -> webview re-renders with the new snapshot.
//
// Cytoscape under jsdom is spike-fail (Plan 15-01 Task 8) — the Graph component's mount
// effect throws when getContext('2d') returns null. React's commit phase still completes
// before the effect fires, so the header + slider + truncation banner DOM elements are
// painted regardless. We test ONLY the slider RPC contract; Cytoscape rendering is
// out-of-scope for this test (covered by the playwright Plan 15-05 phase-verify smoke).
//
// describe block name preserved verbatim from Wave-0 stub for VALIDATION.md grep continuity.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { act, fireEvent, render, cleanup } from '@testing-library/react';
import { App } from '../../../src/inspector/webview/App.js';
import type { WebviewRpc } from '../../../src/inspector/rpc.js';
import type { InspectorHostToWebview, InspectorWebviewToHost } from '../../../src/inspector/messages.js';

interface CapturingRpc {
	readonly rpc: WebviewRpc;
	readonly posted: InspectorWebviewToHost[];
	dispatchHostMessage(msg: InspectorHostToWebview): void;
}

function makeCapturingRpc(): CapturingRpc {
	const posted: InspectorWebviewToHost[] = [];
	let subscribedHandler: ((m: InspectorHostToWebview) => void) | undefined;
	const rpc: unknown = {
		subscribe: (handler: (m: InspectorHostToWebview) => void) => {
			subscribedHandler = handler;
			return () => { subscribedHandler = undefined; };
		},
		postReady: () => {
			posted.push({ type: 'inspector.ready' });
		},
		postRequestSnapshot: (asOf: string) => {
			posted.push({ type: 'inspector.requestSnapshot', asOf });
		},
	};
	return {
		rpc: rpc as WebviewRpc,
		posted,
		dispatchHostMessage(msg: InspectorHostToWebview): void {
			if (subscribedHandler) {
				subscribedHandler(msg);
			}
		},
	};
}

describe('inspector slider asOf change', () => {
	afterEach(() => cleanup());

	it('slider drag posts new asOf -> host calls queryGraphSnapshot -> webview re-renders with new snapshot', async () => {
		const cap = makeCapturingRpc();
		// Render the App. Cytoscape mount inside <Graph/> will throw under jsdom; React's
		// commit phase completes before the layout effect fires so the slider DOM IS in
		// place. Wrap in try/catch for the throw.
		try {
			await act(async () => {
				render(React.createElement(App, { rpc: cap.rpc }));
			});
		} catch {
			// Expected: Cytoscape getContext('2d') returns null under jsdom; the header /
			// banner / slider DOM is already painted before the throw.
		}

		// Verify inspector.ready was posted on mount.
		assert.ok(
			cap.posted.some((m) => m.type === 'inspector.ready'),
			'webview posts inspector.ready on mount',
		);

		// Host responds with the initial inspector.show — includes 2 transitions for the slider.
		// Wire-shape uses kernel field names (node_id) — App.tsx translates via the
		// wireToInspectorRow adapter at the dispatch boundary (Issue #1 carry).
		const initialAsOf = '2026-05-01T00:00:00.000Z';
		const nextAsOf = '2026-05-10T00:00:00.000Z';
		try {
			await act(async () => {
				cap.dispatchHostMessage({
					type: 'inspector.show',
					asOf: initialAsOf,
					nodes: [{
						node_id: 'n1',
						kind: 'DecisionNode',
						label: 'd1',
						valid_from: initialAsOf,
						invalidated_at: null,
						repo_id: 'primary', // Phase 17 Plan 17-04 DEEP-06 phase-B Risk §5 fixture extension
					}],
					edges: [],
					truncated: false,
					transitions: [initialAsOf, nextAsOf],
				});
			});
		} catch {
			// Cytoscape mount throws again on the snapshot update — header / slider survive.
		}

		const slider = document.querySelector('input[type="range"]') as HTMLInputElement | null;
		assert.ok(slider, 'slider input rendered after inspector.show with transitions[]');
		assert.strictEqual(slider!.max, '1', 'slider max equals transitions.length - 1');

		// Simulate the user dragging the slider to index 1 (nextAsOf). React listens to the
		// native `input` event for <input type="range"> onChange; @testing-library/react's
		// fireEvent.change synthesises both the value mutation and the React-event dispatch
		// in one call. The act() wrap keeps React's state updates batched.
		try {
			await act(async () => {
				fireEvent.change(slider!, { target: { value: '1' } });
			});
		} catch {
			// Cytoscape mount throws on the requestSnapshot dispatch's state update.
		}

		// Wait > 100ms for the debounce to fire onAsOfChange. Use act around the timer to
		// flush any React state updates that result from the debounced callback.
		await act(async () => {
			await new Promise((r) => setTimeout(r, 150));
		});

		const postedRequest = cap.posted.find((m) => m.type === 'inspector.requestSnapshot');
		assert.ok(postedRequest, 'webview posts inspector.requestSnapshot after slider change');
		assert.strictEqual(
			(postedRequest as { asOf: string }).asOf,
			nextAsOf,
			'requestSnapshot threads transitions[1] verbatim — no Date() math in the RPC path (Pitfall 1)',
		);
	});
});
