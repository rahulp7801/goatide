/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/editor-events.test.ts
//
// Phase 5 Plan 04 — TELE-02 (debounced editor-save watcher; Mandate-A coarse observations
// only). Tests Plan 05-04's registerEditorEventWatcher contract:
//   - onDidSaveTextDocument fires ONE observation per debounce window (collapses
//     format-on-save bursts).
//   - onDidChangeTextDocument NEVER fires observations (Mandate-A invariant).
//   - workingSet evicts oldest entry once size exceeds WORKING_SET_MAX (Pitfall 6 LRU bound).
//   - working_set_size is reflected in the emitted observation's detail field.

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'node:assert';
import {
	registerEditorEventWatcher,
	SAVE_DEBOUNCE_MS,
	WORKING_SET_MAX,
} from '../../../src/harvester/editor-events.js';
import {
	resetEditorEventEmitters,
	fireDidSaveTextDocument,
	fireDidChangeTextDocument,
	type MockTextDocument,
} from '../../setup/vscode-stub.js';

interface SubmittedObservation {
	id: string;
	source: string;
	body?: string;
	file_path?: string;
	language?: string;
	line_count?: number;
	ts: string;
	detail?: { working_set_size?: number };
}

interface MockKernel {
	calls: SubmittedObservation[];
	harvesterSubmitObservation: (obs: SubmittedObservation) => Promise<{ ok: true }>;
}

function makeMockKernel(): MockKernel {
	const calls: SubmittedObservation[] = [];
	return {
		calls,
		harvesterSubmitObservation: async (obs: SubmittedObservation): Promise<{ ok: true }> => {
			calls.push(obs);
			return { ok: true };
		},
	};
}

function makeMockContext(): { subscriptions: { dispose: () => void }[] } {
	return { subscriptions: [] };
}

function makeMockDoc(uri: string, languageId = 'typescript', lineCount = 10): MockTextDocument {
	return {
		uri: { toString: () => uri, fsPath: uri },
		languageId,
		lineCount,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

describe('TELE-02: editor-event watcher (debounced; coarse-only)', () => {
	beforeEach(() => {
		resetEditorEventEmitters();
	});

	it('onDidSaveTextDocument debounce collapses format-on-save burst into ONE observation', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		registerEditorEventWatcher(ctx as never, kernel);

		const doc = makeMockDoc('file:///work/foo.ts');
		// Burst of 3 saves within 50ms — emulates format-on-save + manual save collapse.
		fireDidSaveTextDocument(doc);
		await sleep(15);
		fireDidSaveTextDocument(doc);
		await sleep(15);
		fireDidSaveTextDocument(doc);

		// Wait beyond the debounce window for the timer to fire.
		await sleep(SAVE_DEBOUNCE_MS + 80);

		assert.equal(kernel.calls.length, 1, 'expected exactly ONE observation after debounce window');
		assert.equal(kernel.calls[0].source, 'editor_save');
		assert.equal(kernel.calls[0].file_path, 'file:///work/foo.ts');
		assert.equal(kernel.calls[0].language, 'typescript');
		assert.equal(kernel.calls[0].line_count, 10);
	});

	it('onDidChangeTextDocument does NOT emit observations (Mandate-A coarse-only)', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		registerEditorEventWatcher(ctx as never, kernel);

		const doc = makeMockDoc('file:///work/bar.ts');
		// Fire many change events — none should produce an observation.
		for (let i = 0; i < 100; i++) {
			fireDidChangeTextDocument(doc);
		}
		// Generous wait so any erroneously-scheduled timer would have fired.
		await sleep(SAVE_DEBOUNCE_MS + 200);

		assert.equal(kernel.calls.length, 0, 'Mandate-A: change events MUST NOT produce observations');
	});

	it('workingSet evicts oldest entry past WORKING_SET_MAX (Pitfall 6 LRU bound)', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		registerEditorEventWatcher(ctx as never, kernel);

		// Fire 60 distinct uris in increasing-ts order (each Date.now() advances at least 1ms
		// because we await sleep(1) between fires). After 50 entries the oldest should evict.
		for (let i = 0; i < 60; i++) {
			fireDidChangeTextDocument(makeMockDoc(`file:///work/file${i}.ts`));
			// 1ms tick to keep monotonic insertion order.
			await sleep(1);
		}

		// Trigger one save so we can inspect working_set_size in the resulting observation.
		const probe = makeMockDoc('file:///work/probe.ts');
		// First, push probe into the working-set so its detail field is meaningful.
		fireDidChangeTextDocument(probe);
		fireDidSaveTextDocument(probe);
		await sleep(SAVE_DEBOUNCE_MS + 80);

		assert.equal(kernel.calls.length, 1);
		// After 60 distinct change uris + 1 probe-change = 61 inserts. With LRU bound = 50,
		// working-set size should be exactly WORKING_SET_MAX after eviction settles.
		assert.equal(
			kernel.calls[0].detail?.working_set_size,
			WORKING_SET_MAX,
			`expected working_set_size === WORKING_SET_MAX (${WORKING_SET_MAX}); got ${kernel.calls[0].detail?.working_set_size}`,
		);
	});

	it('working_set_size in observation detail reflects pre-save change-event count', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		registerEditorEventWatcher(ctx as never, kernel);

		// Fire 5 distinct change events (5 entries in working set), then one save.
		for (let i = 0; i < 5; i++) {
			fireDidChangeTextDocument(makeMockDoc(`file:///work/x${i}.ts`));
			await sleep(1);
		}
		const saveDoc = makeMockDoc('file:///work/x0.ts');  // Already in working-set.
		fireDidSaveTextDocument(saveDoc);
		await sleep(SAVE_DEBOUNCE_MS + 80);

		assert.equal(kernel.calls.length, 1);
		assert.equal(kernel.calls[0].detail?.working_set_size, 5);
	});
});
