/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/editor-events.test.ts
//
// Phase 5 Wave-0 refusal stub for TELE-02 (debounced editor-save watcher; Mandate-A coarse
// observations only). Plan 05-04 will flip these.

describe('TELE-02: editor-event watcher (debounced; coarse-only)', () => {
	it.skip('onDidSaveTextDocument debounce collapses format-on-save burst into ONE observation', () => {
		throw new Error('Plan 05-04 has not yet implemented registerEditorEventWatcher');
	});

	it.skip('onDidChangeTextDocument does NOT emit observations (Mandate-A coarse-only)', () => {
		throw new Error('Plan 05-04 has not yet implemented registerEditorEventWatcher (no fine-grained change events)');
	});

	it.skip('workingSet evicts oldest entry past WORKING_SET_MAX=50 (Pitfall 6 LRU bound)', () => {
		throw new Error('Plan 05-04 has not yet implemented registerEditorEventWatcher (LRU bound)');
	});
});
