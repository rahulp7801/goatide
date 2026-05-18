/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 20 Plan 20-01 AUTH-01 SC#1d -- Wave-0 happy-path RED stub. Asserts the
// full multi-step flow (anchor pick -> rationale input -> confirmation -> kernel write).
// Flips GREEN when Plan 20-03 (Wave 2) lands canvas/authoring-flow.ts.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

describe('Phase 20 AUTH-01 SC#1d -- authoring-flow happy path', () => {

	it('authoring-flow.happy-path: QuickPick -> InputBox -> confirm -> kernel.createDecisionNode', async () => {
		const createDecisionNodeCalls: Array<Record<string, unknown>> = [];
		const kernelStub = {
			createDecisionNode: async (params: Record<string, unknown>) => {
				createDecisionNodeCalls.push(params);
				return { node_id: 'test-node-id-xyz' };
			},
		};

		// Stub the 3 vscode.window APIs the flow uses.
		const origInput = vscode.window.showInputBox.bind(vscode.window);
		const origQuickPick = vscode.window.showQuickPick.bind(vscode.window);
		const origInfo = vscode.window.showInformationMessage.bind(vscode.window);
		const inputResponses = ['human-authored rationale', '']; // rationale, optional line (empty = skip)
		let inputCallIdx = 0;

		(vscode.window as unknown as Record<string, unknown>)['showInputBox'] =
			async () => inputResponses[inputCallIdx++];
		(vscode.window as unknown as Record<string, unknown>)['showQuickPick'] =
			async (items: unknown) => Array.isArray(items) ? items[0] : items;
		(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] =
			async (_msg: string, ..._actions: unknown[]) => 'Create';

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
				{ prefilledAnchorPath: '/tmp/x.ts' },
			);

			assert.strictEqual(createDecisionNodeCalls.length, 1,
				'Expected exactly 1 createDecisionNode call after happy-path flow.');
			const call = createDecisionNodeCalls[0];
			assert.strictEqual(call.body, 'human-authored rationale',
				'createDecisionNode.body must equal the InputBox response verbatim.');
			assert.ok(call.anchor && typeof (call.anchor as { file?: unknown }).file === 'string',
				'createDecisionNode.anchor.file must be present.');
			assert.strictEqual(call.repo_id, 'primary',
				'createDecisionNode.repo_id must default to "primary" (Phase 21 will activate WorkspaceRepoState).');
		} finally {
			(vscode.window as unknown as Record<string, unknown>)['showInputBox'] = origInput;
			(vscode.window as unknown as Record<string, unknown>)['showQuickPick'] = origQuickPick;
			(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = origInfo;
		}
	});

});
