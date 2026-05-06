/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plan 04-03 (CANV-01 + CANV-02 + REC-04 + CANV-08): React canvas UI rendering tests.
// jsdom + @testing-library/react + DiffPane prop-injection (Monaco doesn't render under jsdom).

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from '../../src/canvas/webview/App.js';
import { WebviewRpc, type VsCodeApi } from '../../src/canvas/rpc.js';
import type { CanvasShowPayload, HostToWebview } from '../../src/canvas/messages.js';

const FIXED_CHANGE_ID = '01J' + 'X'.repeat(23);
const FIXED_CITATION_ID = '01J' + 'C'.repeat(23);
const FIXED_VERSION = '01J' + 'V'.repeat(23);

function makeShowPayload(opts?: Partial<CanvasShowPayload>): CanvasShowPayload {
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
				snippet: 'auth required',
				body_preview: 'auth required',
				successor_id: null,
			},
		],
		drill_chain: ['parent_of:0'],
		...opts,
	};
}

function makeStubVsCodeApi(): { api: VsCodeApi; sent: unknown[] } {
	const sent: unknown[] = [];
	const api: VsCodeApi = {
		postMessage: (m: unknown) => { sent.push(m); },
		getState: () => null,
		setState: () => { /* noop */ },
	};
	return { api, sent };
}

const StubDiff = ({ language }: { original: string; modified: string; language: string }) =>
	React.createElement('div', { 'data-testid': 'diff-mock', 'data-language': language }, 'DIFF MOCK');

function dispatchHostMessage(msg: HostToWebview): void {
	window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

describe('CANV-01 + CANV-02 - Canvas React UI', () => {
	afterEach(() => cleanup());

	it('renders DiffPane (mock) + CitationList + 3 buttons on canvas.show', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		// Initially nothing visible.
		assert.equal(screen.queryByTestId('canvas-accept'), null);

		// Dispatch a show message.
		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload: makeShowPayload() });
		});

		assert.ok(screen.getByTestId('diff-mock'), 'DiffPane mock rendered');
		assert.ok(screen.getByTestId('canvas-accept'), 'Accept button rendered');
		assert.ok(screen.getByTestId('canvas-reject'), 'Reject button rendered');
		assert.ok(screen.getByTestId('canvas-reject-with-note-toggle'), 'Reject-with-Note toggle rendered');
		assert.equal(screen.getByTestId('diff-mock').getAttribute('data-language'), 'typescript');
	});

	it('CitationList renders Explicit + Inferred sections separately (REC-04)', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		const payload = makeShowPayload({
			citations: [
				{
					node_id: '01J' + 'A'.repeat(23), version: '01J' + 'A'.repeat(23),
					confidence: 'Explicit', edge_path: 'parent_of:0', snippet: 'rule A', body_preview: 'rule A',
					successor_id: null,
				},
				{
					node_id: '01J' + 'B'.repeat(23), version: '01J' + 'B'.repeat(23),
					confidence: 'Inferred', edge_path: 'references:1', snippet: 'rule B', body_preview: 'rule B',
					successor_id: null,
				},
			],
		});

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload });
		});

		assert.ok(screen.getByTestId('citation-section-explicit'), 'Explicit section rendered');
		assert.ok(screen.getByTestId('citation-section-inferred'), 'Inferred section rendered');
		const rows = screen.getAllByTestId('citation-row');
		assert.equal(rows.length, 2);
	});

	it('Reject-with-Note submit is disabled until note has >=1 non-whitespace char', async () => {
		const { api, sent } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload: makeShowPayload() });
		});
		await act(async () => {
			fireEvent.click(screen.getByTestId('canvas-reject-with-note-toggle'));
		});
		const input = screen.getByTestId('canvas-reject-note-input') as HTMLTextAreaElement;
		const submit = screen.getByTestId('canvas-reject-with-note-submit') as HTMLButtonElement;
		assert.equal(submit.disabled, true);

		await act(async () => {
			fireEvent.change(input, { target: { value: 'because A' } });
		});
		assert.equal(submit.disabled, false);

		await act(async () => {
			fireEvent.click(submit);
		});
		const last = sent[sent.length - 1] as { type: string; payload: { note: string } };
		assert.equal(last.type, 'canvas.reject_with_note');
		assert.equal(last.payload.note, 'because A');
	});

	it('ConfirmationPhrase: Accept disabled on destructive until exact phrase typed (CANV-08)', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		await act(async () => {
			dispatchHostMessage({
				type: 'canvas.show',
				payload: makeShowPayload({ destructive: true, confirmation_phrase: 'drop' }),
			});
		});

		const accept = screen.getByTestId('canvas-accept') as HTMLButtonElement;
		assert.equal(accept.disabled, true);

		const phraseInput = screen.getByTestId('confirmation-phrase-input') as HTMLInputElement;
		const phraseBtn = screen.getByTestId('confirmation-phrase-button') as HTMLButtonElement;
		assert.equal(phraseBtn.disabled, true);

		// Type a wrong phrase first.
		await act(async () => {
			fireEvent.change(phraseInput, { target: { value: 'drip' } });
		});
		assert.equal(phraseBtn.disabled, true);
		assert.equal(accept.disabled, true);

		// Type the right phrase.
		await act(async () => {
			fireEvent.change(phraseInput, { target: { value: 'drop' } });
		});
		assert.equal(phraseBtn.disabled, false);

		await act(async () => {
			fireEvent.click(phraseBtn);
		});
		assert.equal(accept.disabled, false);
	});
});
