/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 12 Plan 12-03 — RED stub for the canvas-panel recreation guard.
//
// CONTEXT.md decision: Wave-3 single-launch failure is rooted in the panel-hide-vs-dispose
// asymmetry across accept/reject branches in tier-dispatch.ts:382/384/393. Plan 12-03 H1
// switches reject branches from `panel.hide()` to `panel.dispose()` so the iframe tears down
// cleanly; CanvasPanel.getOrCreate(context) at extension.ts:98 then re-establishes a fresh,
// non-disposed panel on the next save invocation.
//
// This stub is the bridge-side unit assertion that pins the recreate-after-dispose invariant.
// Plan 12-03 will flip it GREEN once the dispose() change lands.
//
// The it() body throws via `assert.fail('NOT IMPLEMENTED — Plan 12-03 Task 03')` so the stub
// is observably RED until Plan 12-03 wires the assertion.
//
// Wave-0 invariant: the existing 53 bridge mocha tests stay green; only the 1 new it() block
// below adds to the RED column.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

// TODO Plan 12-03: import CanvasPanel.getOrCreate from '../../src/canvas/panel.js' and a
// minimal vscode ExtensionContext stub. Until then the stub references only the Stub interface
// below.
interface Stub {
	readonly note: string;
}

const STUB: Stub = { note: 'Plan 12-03 RED scaffolding — replace assertion with a getOrCreate→dispose→getOrCreate round-trip asserting the second returned panel.disposed === false (fresh panel, not a reused-and-dead reference).' };

describe('panel', () => {
	it('getOrCreate-after-dispose-reject yields fresh, non-disposed panel', () => {
		// 12-03-03 — round-trip assertion:
		//   1. const a = CanvasPanel.getOrCreate(context);
		//   2. a.dispose();                                       // simulates reject-tier teardown
		//   3. const b = CanvasPanel.getOrCreate(context);
		//   4. assert.strictEqual(b.disposed, false);             // fresh panel
		//   5. assert.notStrictEqual(b, a);                       // not the same disposed reference
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-03 Task 03');
	});
});
