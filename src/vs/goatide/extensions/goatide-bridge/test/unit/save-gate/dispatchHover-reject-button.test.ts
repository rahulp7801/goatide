/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 20 Plan 20-01 AUTH-02 SC#2a -- Wave-0 RED stub. Asserts dispatchHover passes
// BOTH 'Reject' AND 'Open full receipt' to showInformationMessage.
//
// AUTHORING-TIME NOTE (2026-05-18 retroactive Plan 20-01 closure):
// Plan 20-04 already landed the Reject button (commit 61bb7a1973a). This file is
// therefore IMMEDIATELY GREEN as a regression gate: if a future refactor removes
// either 'Reject' or 'Open full receipt' from the showInformationMessage action list,
// this test RED-flips and blocks the regression.
//
// Research source: 20-RESEARCH.md Code Example 3 lines 561-565.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

// Helper -- mirror mandate-d-destructive-no-hover.test.ts buildMockCanvasMod pattern.
async function buildMockCanvasMod(tier: 'silent' | 'inline' | 'modal', isDestructive: boolean) {
	const { __setCanvasModuleForTests } = await import('../../../src/save-gate/canvas-module.js');
	const mockMod = {
		classifyTier: () => tier,
		detectDestructive: () => isDestructive,
		destructiveVerbForConfirmation: () => 'delete',
		DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES: [] as readonly string[],
		AnchorResultCache: class {
			get(_key: string): readonly unknown[] | undefined { return undefined; }
			set(_key: string, _val: readonly unknown[]): void { }
			invalidateByAnchorPath(_p: string): number { return 0; }
			clear(): void { }
			size(): number { return 0; }
		},
		DEFAULT_MAX_ENTRIES: 100,
		DEFAULT_TTL_MS: 60000,
	};
	__setCanvasModuleForTests(mockMod as unknown as Parameters<typeof __setCanvasModuleForTests>[0]);
}

describe('Phase 20 AUTH-02 SC#2a -- dispatchHover Reject button presence', () => {

	it('dispatchHover.Reject.button: showInformationMessage called with both "Reject" and "Open full receipt" actions', async () => {
		const { dispatchTier } = await import('../../../src/save-gate/tier-dispatch.js');
		const { __resetCanvasModuleForTests } = await import('../../../src/save-gate/canvas-module.js');

		await buildMockCanvasMod('silent', false);

		// Spy on showInformationMessage -- capture (msg, ...actions) tuples.
		const showInfoCalls: Array<{ msg: string; actions: string[] }> = [];
		const origShowInfo = vscode.window.showInformationMessage.bind(vscode.window);
		(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] =
			async (msg: string, ...actions: string[]) => {
				showInfoCalls.push({ msg, actions });
				return undefined; // user dismisses
			};

		// Fake config: benignSetting='hover' to route into dispatchHover.
		const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);
		const fakeConfig = {
			get: (key2: string, defaultValue?: unknown) => {
				if (key2 === 'benign') { return 'hover'; }
				if (key2 === 'destructive') { return 'confirm'; }
				if (key2 === 'highImpact') { return 'confirm'; }
				return defaultValue;
			},
			has: (_k: string) => false,
			inspect: (_k: string) => undefined,
			update: async () => { },
		} as unknown as vscode.WorkspaceConfiguration;
		const fakeOtherConfig = {
			get: (_k: string, defaultValue?: unknown) => defaultValue,
			has: (_k: string) => false,
			inspect: (_k: string) => undefined,
			update: async () => { },
		} as unknown as vscode.WorkspaceConfiguration;
		(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = (section: unknown) => {
			if (section === 'goatide.saveGate') { return fakeConfig; }
			return fakeOtherConfig;
		};

		// Also silence setStatusBarMessage (dispatchHover Step 3 emits one).
		const origSetStatusBar = vscode.window.setStatusBarMessage.bind(vscode.window);
		(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = () => ({
			dispose: () => { },
		});

		try {
			const panel = {
				showAndAwait: async () => ({ kind: 'accept', accept_latency_ms: 0 }),
				registerOverrideHandler: () => { },
				registerRationaleHandler: () => { },
				dispose: async () => { },
				postComplianceReportPartial: async () => { },
				postComplianceReportFull: async () => { },
			} as unknown as Parameters<typeof dispatchTier>[0]['panel'];

			const kernel = {
				queryNodes: async () => ({ nodes: [] }),
				atomicAccept: async () => ({ attempt_node_id: 'test-attempt' }),
				proposeEdit: async () => { throw new Error('should not be called'); },
				recordRejection: async () => { },
				recordContractOverride: async () => ({ attempt_node_id: 'test-override' }),
				onDriftProgress: () => () => { },
				runRippleProgressive: async () => ({ report: { contract_node_id: '', max_hops: 1, definitely_affected: [], potentially_affected: [], truncated: false, generated_at: '' } }),
				isConnected: () => true,
			} as unknown as Parameters<typeof dispatchTier>[0]['kernel'];

			const docUri = vscode.Uri.file('/tmp/reject-button-test.ts');
			const doc = {
				uri: docUri,
				getText: () => '',
				fileName: '/tmp/reject-button-test.ts',
				languageId: 'typescript',
				version: 1,
				isDirty: false,
				isUntitled: false,
				isClosed: false,
				save: async () => true,
				lineCount: 1,
				eol: 1,
			} as unknown as Parameters<typeof dispatchTier>[0]['doc'];

			const inputs = {
				kernel,
				panel,
				doc,
				original: '',
				modified: '// change',
				diff: '+// change',
				receipt: {
					id: 'receipt-reject-button-test',
					change_id: 'change-reject-button-test',
					citations: [],
					graph_snapshot_tx_time: null,
					drill_chain: [],
				} as unknown as Parameters<typeof dispatchTier>[0]['receipt'],
				startMs: Date.now(),
				driftFindings: [],
				lockTrigger: null,
			};

			try {
				await dispatchTier(inputs as unknown as Parameters<typeof dispatchTier>[0]);
			} catch {
				// Some downstream paths (applyEditAtomically) may throw in the test environment.
				// The Step 4 showInformationMessage call we care about happens AFTER Step 1,
				// so we tolerate the throw and inspect what was captured.
			}

			const hoverCall = showInfoCalls.find(c => c.msg === 'GoatIDE: benign save accepted');
			assert.ok(hoverCall,
				'Expected showInformationMessage call with "GoatIDE: benign save accepted". ' +
				`Calls captured: ${JSON.stringify(showInfoCalls.map(c => c.msg))}.`);
			assert.ok(hoverCall.actions.includes('Reject'),
				'AUTH-02: dispatchHover must pass "Reject" as an action to showInformationMessage. ' +
				'Plan 20-04 lands the Reject button (commit 61bb7a1973a). ' +
				`Captured actions: ${JSON.stringify(hoverCall.actions)}.`);
			assert.ok(hoverCall.actions.includes('Open full receipt'),
				'dispatchHover must preserve the existing "Open full receipt" action. ' +
				`Captured actions: ${JSON.stringify(hoverCall.actions)}.`);
		} finally {
			(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = origShowInfo;
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
			(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = origSetStatusBar;
			__resetCanvasModuleForTests();
		}
	});

});
