/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 20 Plan 20-01 AUTH-01 SC#1e -- Wave-0 anchor auto-populate RED stub. Asserts
// that when the flow is invoked with prefilledAnchorPath (the empty-state CTA path),
// the resulting createDecisionNode anchor.file matches the prefilled path -- i.e. no
// manual picker step is required for the common case.
// Flips GREEN when Plan 20-03 (Wave 2) lands canvas/authoring-flow.ts.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

describe('Phase 20 AUTH-01 SC#1e -- authoring-flow CTA anchor auto-populate', () => {

	it('authoring-flow.auto-populate: prefilledAnchorPath threads through to createDecisionNode.anchor.file', async () => {
		const createDecisionNodeCalls: Array<Record<string, unknown>> = [];
		const kernelStub = {
			createDecisionNode: async (params: Record<string, unknown>) => {
				createDecisionNodeCalls.push(params);
				return { node_id: 'auto-anchor-test-id' };
			},
		};

		const origInput = vscode.window.showInputBox.bind(vscode.window);
		const origQuickPick = vscode.window.showQuickPick.bind(vscode.window);
		const origInfo = vscode.window.showInformationMessage.bind(vscode.window);
		const inputResponses = ['rationale here', ''];
		let inputIdx = 0;
		(vscode.window as unknown as Record<string, unknown>)['showInputBox'] =
			async () => inputResponses[inputIdx++];
		(vscode.window as unknown as Record<string, unknown>)['showQuickPick'] =
			async (items: unknown) => Array.isArray(items) ? items[0] : items;
		(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] =
			async () => 'Create';

		try {
			let runAddDecisionNodeFlow: ((...args: unknown[]) => Promise<void>) | undefined;
			try {
				const mod = await import('../../../src/canvas/authoring-flow.js');
				runAddDecisionNodeFlow = (mod as Record<string, unknown>)['runAddDecisionNodeFlow'] as never;
			} catch (e) {
				assert.fail('canvas/authoring-flow.js module not found -- Plan 20-03 must create it. Error: ' + String(e));
			}
			if (!runAddDecisionNodeFlow) {
				assert.fail('runAddDecisionNodeFlow not exported');
			}
			await runAddDecisionNodeFlow(
				{} as never,
				kernelStub as never,
				{} as never,
				{ prefilledAnchorPath: '/tmp/myfile.ts' },
			);

			assert.strictEqual(createDecisionNodeCalls.length, 1,
				'Expected exactly 1 createDecisionNode call.');
			const anchor = createDecisionNodeCalls[0].anchor as { file?: string };
			assert.strictEqual(anchor?.file, '/tmp/myfile.ts',
				'Auto-populated anchor.file must equal prefilledAnchorPath. ' +
				'OQ#4 resolution: prefill is read from activeTextEditor OR explicit opts.prefilledAnchorPath.');
		} finally {
			(vscode.window as unknown as Record<string, unknown>)['showInputBox'] = origInput;
			(vscode.window as unknown as Record<string, unknown>)['showQuickPick'] = origQuickPick;
			(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = origInfo;
		}
	});

});
