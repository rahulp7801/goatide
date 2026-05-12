/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 12 Plan 12-02 — RED stubs for the 1750ms event.waitUntil budget fix.
//
// CONTEXT.md decision: reject event.waitUntil() SYNCHRONOUSLY with a Promise.reject(new
// SaveDeferredError(...)); run readFile + handleProposedSave in a void (async () => {})()
// fire-and-forget IIFE. The waitUntil call must be made within the synchronous listener body
// (per src/vs/workbench/api/common/extHostDocumentSaveParticipant.ts:111-131 — the promises
// array is frozen AFTER the synchronous listener call).
//
// Each it() body throws via `assert.fail('NOT IMPLEMENTED — Plan 12-02 Task NN')` so the stubs
// are observably RED until Plan 12-02 flips them GREEN. NO production-code imports yet —
// Plan 12-02 will reshape on-will-save.ts:81-94.
//
// Wave-0 invariant: the existing 53 bridge mocha tests stay green; only the 4 new it() blocks
// below add to the RED column.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

// TODO Plan 12-02: import on-will-save listener + SaveDeferredError once the implementation
// lands. Until then the stubs reference only the Stub interface below (no production-code
// coupling — Plan 12-02 is free to reshape internals without breaking this RED scaffolding).
interface Stub {
	readonly note: string;
}

const STUB: Stub = { note: 'Plan 12-02 RED scaffolding — replace assertions when implementing sync-veto + fire-and-forget IIFE for readFile + handleProposedSave.' };

describe('save-gate-budget', () => {
	it('sync-reject-microtask rejects vetoPromise within 50ms', () => {
		// 12-02-01 — under simulated slow fs.readFile (3000ms delay), event.waitUntil's promise
		// must reject within 50ms with a SaveDeferredError (microtask-fast). The current
		// implementation awaits readFile BEFORE rejecting, so reject is delayed by the readFile
		// duration; the fix is to reject synchronously while the readFile runs in a
		// fire-and-forget IIFE.
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-02 Task 01');
	});

	it('panel-show-after-readfile-delay invoked from IIFE', () => {
		// 12-02-02 — even though waitUntil rejects within 50ms, panel.show() must STILL be
		// invoked once the async readFile + handleProposedSave path resolves inside the
		// fire-and-forget IIFE. Asserts the panel surface still reveals the canvas to the user
		// despite the sync-veto fast-path.
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-02 Task 02');
	});

	it('no-illegalState-log under sync waitUntil call', () => {
		// 12-02-03 — extHostDocumentSaveParticipant throws `illegalState('waitUntil can not be
		// called async')` if waitUntil is called after the promises array freezes. This test
		// asserts that the v3 implementation calls waitUntil SYNCHRONOUSLY (within the listener
		// body) — no illegalState log message appears in extension-host stderr / dev-tools
		// console.
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-02 Task 03');
	});

	it('no-1750ms-abort under simulated slow readFile', () => {
		// 12-02-04 — under simulated slow fs.readFile (3000ms), mainThreadSaveParticipant's
		// 1750ms timeout race must NOT fire `Aborted onWillSaveTextDocument-event after 1750ms`.
		// The sync-reject ends the participant well within budget; the readFile completion
		// happens out-of-band in the IIFE.
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-02 Task 04');
	});
});
