/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 12 Plan 12-01 — RED stubs for the auto-save bypass fix (Option B locked in CONTEXT.md).
//
// Each it() body throws via `assert.fail('NOT IMPLEMENTED — Plan 12-01 Task NN')` so the stubs
// are observably RED until Plan 12-01 flips them GREEN. NO production-code imports yet — this
// file is a planning sentinel; Plan 12-01 will replace each assertion with a real test against
// on-will-save.ts that wires TextDocumentSaveReason.AfterDelay/FocusOut through the listener.
//
// Wave-0 invariant: the existing 53 bridge mocha tests stay green; only the 4 new it() blocks
// below add to the RED column.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

// TODO Plan 12-01: import on-will-save listener + classifier helpers once the implementation
// lands. Until then the stubs reference only the Stub interface below (no production-code
// coupling — Plan 12-01 is free to reshape internals without breaking this RED scaffolding).
interface Stub {
	readonly note: string;
}

const STUB: Stub = { note: 'Plan 12-01 RED scaffolding — replace assertions when implementing Option B (gate destructive + high-impact-citation saves regardless of reason; silent-tier non-Manual passes through).' };

describe('save-gate-auto-save', () => {
	it('AfterDelay-destructive vetoes save and reveals canvas', () => {
		// 12-01-01 — auto-save (TextDocumentSaveReason.AfterDelay) on a destructive change
		// (e.g., file body contains `DROP TABLE`) must invoke event.waitUntil(Promise.reject(...))
		// and reveal the Verification Canvas, NOT short-circuit the way `event.reason !== Manual`
		// currently does at on-will-save.ts:62-65.
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-01 Task 01');
	});

	it('AfterDelay-silent-passes through without veto', () => {
		// 12-01-02 — auto-save on a silent-tier change (no destructive markers, no high-impact
		// contract citation) must STILL pass through without a veto (CONTEXT.md Option B
		// explicitly preserves auto-save UX for trivial changes — only destructive + high-impact
		// saves are gated regardless of reason).
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-01 Task 02');
	});

	it('FocusOut-high-impact opens modal', () => {
		// 12-01-03 — TextDocumentSaveReason.FocusOut on a save citing a high-impact contract
		// anchor (e.g., a path matching `goatide.contracts.highImpactAllowlist`) must open the
		// modal Verification Canvas tier, NOT pass through.
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-01 Task 03');
	});

	it('Manual-destructive-still-vetoed regression guard', () => {
		// 12-01-04 — regression sentinel: TextDocumentSaveReason.Manual on a destructive change
		// must continue to open the modal (the existing Phase-4 behavior preserved across the
		// Option B refactor — guards against accidentally narrowing the manual-save path).
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-01 Task 04');
	});
});
