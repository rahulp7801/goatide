/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/graphInspectorPanel-viewtype.test.ts —
// Phase 15 Plan 15-01 (Wave-0) + Plan 15-03 (Wave-2 — Test 3 removed).
//
// VIEW_TYPE invariants for GraphInspectorPanel:
//   1. byte-equal 'goatide.graphInspector'
//   2. != CanvasPanel.VIEW_TYPE ('goatide.canvas') — distinct panel registration
//
// Plan 15-03 (Wave-2) removed the Wave-0 Test 3 throw-stub assertion: GraphInspectorPanel
// .getOrCreate now has a real body (createWebviewPanel + singleton), so the throw-stub
// test would fail with a different error. Coverage for the new behavior is provided by
// test/integration/inspector/command-registration.test.ts (Plan 15-03 Task 3) which
// asserts the command callback invokes getOrCreate when the kernel is connected.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { GraphInspectorPanel } from '../../../src/inspector/panel.js';
import { CanvasPanel } from '../../../src/canvas/panel.js';

describe('GraphInspectorPanel VIEW_TYPE', () => {
	it('VIEW_TYPE equals string literal "goatide.graphInspector"', () => {
		assert.strictEqual(GraphInspectorPanel.VIEW_TYPE, 'goatide.graphInspector');
	});

	it('VIEW_TYPE differs from CanvasPanel.VIEW_TYPE', () => {
		// CanvasPanel.VIEW_TYPE is a module-private const 'goatide.canvas'; assert via byte
		// literal here rather than reaching into the canvas/panel.ts internals.
		void CanvasPanel;
		assert.notStrictEqual(GraphInspectorPanel.VIEW_TYPE, 'goatide.canvas');
	});
});
