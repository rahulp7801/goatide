/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/graphInspectorPanel-viewtype.test.ts — Phase 15 Plan 15-01 (Wave-0).
//
// VIEW_TYPE invariants for GraphInspectorPanel:
//   1. byte-equal 'goatide.graphInspector'
//   2. != CanvasPanel.VIEW_TYPE ('goatide.canvas') — distinct panel registration
//   3. getOrCreate() throws the Wave-0 stub error (Plan 15-03 will replace the body and
//      rewrite this case to assert success behavior)

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
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

	it('getOrCreate throws Wave-0 stub error (RED - Plan 15-03 GREEN-flips)', () => {
		const fakeContext = {} as vscode.ExtensionContext;
		assert.throws(
			() => GraphInspectorPanel.getOrCreate(fakeContext),
			/Wave 2 implements/,
		);
	});
});
