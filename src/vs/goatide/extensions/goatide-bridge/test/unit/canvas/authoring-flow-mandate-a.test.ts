/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 20 Plan 20-01 AUTH-01 SC#1c -- Wave-0 Mandate A RED stub. Flips GREEN when
// Plan 20-03 (Wave 2) lands canvas/authoring-flow.ts with verbatim `value: ''` on
// the rationale showInputBox call. Mandate A: rationale textarea is NEVER pre-populated.
//
// Research source: 20-RESEARCH.md Wave-0 Imperative #4 + Code Example 2 lines 446-453.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

describe('Phase 20 AUTH-01 SC#1c -- authoring-flow Mandate A (textarea empty)', () => {

	it('authoring-flow.textarea.empty: showInputBox called with opts.value === "" (Mandate A)', async () => {
		// Spy: capture opts.value on every showInputBox call. We assert the FIRST call
		// (the rationale prompt) had value === ''. Subsequent calls (e.g. optional line
		// number) may also have value === '' per Code Example 2 lines 524-534; the
		// contract is that NO call ever pre-populates from kernel or LLM data.
		const captured: Array<string | undefined> = [];
		const origShowInputBox = vscode.window.showInputBox.bind(vscode.window);
		(vscode.window as unknown as Record<string, unknown>)['showInputBox'] =
			async (opts?: vscode.InputBoxOptions): Promise<string | undefined> => {
				captured.push(opts?.value);
				return undefined; // user cancels -- short-circuits the flow
			};

		try {
			let runAddDecisionNodeFlow: ((...args: unknown[]) => Promise<void>) | undefined;
			try {
				const mod = await import('../../../src/canvas/authoring-flow.js');
				runAddDecisionNodeFlow = (mod as Record<string, unknown>)['runAddDecisionNodeFlow'] as never;
			} catch (e) {
				assert.fail(
					'canvas/authoring-flow.js module not found -- Plan 20-03 (Wave 2) must create it. ' +
					'Error: ' + (e instanceof Error ? e.message : String(e)),
				);
			}
			if (!runAddDecisionNodeFlow) {
				assert.fail('runAddDecisionNodeFlow not exported from canvas/authoring-flow.ts');
			}

			// Minimal mock context/kernel/panel -- the test only needs to reach the
			// showInputBox call site. If the flow throws before that, the test fails
			// (which is acceptable -- it still surfaces a Mandate A gap).
			await runAddDecisionNodeFlow(
				{} as never,                              // context
				{ createDecisionNode: async () => ({}) } as never, // kernel stub
				{} as never,                              // panel
				{ prefilledAnchorPath: '/tmp/x.ts' },     // opts -- prefilled so anchor picker auto-selects
			);

			assert.ok(captured.length > 0,
				'Expected at least one showInputBox call; flow short-circuited too early.');
			assert.strictEqual(captured[0], '',
				'Mandate A: first showInputBox (rationale prompt) must have opts.value === "" (empty string). ' +
				'Any non-empty value indicates LLM-generated or kernel-data pre-population.');
		} finally {
			(vscode.window as unknown as Record<string, unknown>)['showInputBox'] = origShowInputBox;
		}
	});

});
