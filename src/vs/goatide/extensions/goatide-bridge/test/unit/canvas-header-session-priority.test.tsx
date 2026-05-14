/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/canvas-header-session-priority.test.tsx — Phase 14 Plan 14-01 (Wave-0) RED stub
// for Plan 14-04 Task 2 — Wave-0-first per Nyquist Dim 8d.
//
// GREEN-flips when:
//   (a) CanvasShowPayloadSchema gains an optional `session_priority_indicator: string |
//       null` field (Plan 14-04 schema migration), AND
//   (b) App.tsx renders an element with `data-testid="canvas-header-session-priority"`
//       inside the Verification Canvas header that prints the indicator string when
//       non-null, and renders nothing when null.
//
// The describe string matches VALIDATION.md --grep "Canvas header session-priority
// indicator" verbatim — Plan 14-04 Task 2 lands the GREEN side and inherits this
// describe block intact.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { App } from '../../src/canvas/webview/App.js';
import { WebviewRpc, type VsCodeApi } from '../../src/canvas/rpc.js';
import type { CanvasShowPayload, HostToWebview } from '../../src/canvas/messages.js';

const FIXED_CHANGE_ID = '01J' + 'X'.repeat(23);
const FIXED_CITATION_ID = '01J' + 'C'.repeat(23);
const FIXED_VERSION = '01J' + 'V'.repeat(23);

function makeShowPayload(extra: Record<string, unknown>): CanvasShowPayload {
	// Cast through `unknown` — Plan 14-04 lands the schema field on CanvasShowPayloadSchema;
	// today CanvasShowPayload's type does not yet declare session_priority_indicator.
	return {
		change_id: FIXED_CHANGE_ID,
		tier: 'modal',
		destructive: false,
		confirmation_phrase: null,
		file_uri: 'src/auth.ts',
		language: 'typescript',
		original_content: 'const a = 1;',
		modified_content: 'const a = 2;',
		citations: [
			{
				node_id: FIXED_CITATION_ID,
				version: FIXED_VERSION,
				confidence: 'Explicit',
				edge_path: 'parent_of:0',
				snippet: 'snippet',
				body_preview: 'body',
				successor_id: null,
			},
		],
		drill_chain: ['parent_of:0'],
		...extra,
	} as unknown as CanvasShowPayload;
}

function makeStubVsCodeApi(): VsCodeApi {
	return {
		postMessage: () => undefined,
		getState: () => null,
		setState: () => undefined,
	};
}

const StubDiff = ({ language }: { original: string; modified: string; language: string }) =>
	React.createElement('div', { 'data-testid': 'diff-mock', 'data-language': language }, 'DIFF MOCK');

function dispatchHostMessage(msg: HostToWebview): void {
	window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

describe('Canvas header session-priority indicator', () => {
	afterEach(() => cleanup());

	it('renders indicator when payload.session_priority_indicator is non-null', async () => {
		const rpc = new WebviewRpc(makeStubVsCodeApi());
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));
		await act(async () => {
			dispatchHostMessage({
				type: 'canvas.show',
				payload: makeShowPayload({
					session_priority_indicator: 'Filtered by session priority: Speed-First',
				}),
			});
		});
		const el = document.querySelector('[data-testid="canvas-header-session-priority"]');
		assert.ok(
			el !== null,
			'Plan 14-04 Task 2 must render <[data-testid="canvas-header-session-priority"]> inside the Canvas header when session_priority_indicator is non-null',
		);
		assert.equal(
			el?.textContent,
			'Filtered by session priority: Speed-First',
			'header element text content must match the session_priority_indicator string verbatim',
		);
	});

	it('hides indicator when payload.session_priority_indicator is null', async () => {
		const rpc = new WebviewRpc(makeStubVsCodeApi());
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));
		await act(async () => {
			dispatchHostMessage({
				type: 'canvas.show',
				payload: makeShowPayload({ session_priority_indicator: null }),
			});
		});
		const el = document.querySelector('[data-testid="canvas-header-session-priority"]');
		assert.equal(
			el,
			null,
			'header element must NOT be rendered when session_priority_indicator is null',
		);
	});
});
