/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 20 Plan 20-01 AUTH-02 SC#2c -- Wave-0 RED stub. Asserts the Reject branch
// wiring: click Reject -> modal confirm -> kernel.recordRejection({receipt_id, change_id, note}).
//
// AUTHORING-TIME NOTE (2026-05-18 retroactive Plan 20-01 closure):
// Plan 20-04 already landed the Reject branch (commit 61bb7a1973a). This file is
// therefore IMMEDIATELY GREEN as a regression gate.
//
// Research source: 20-RESEARCH.md Code Example 3 lines 566-583 + OQ#1 resolution
// (reuse existing recordRejection RPC verbatim; note literal verbatim).

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

describe('Phase 20 AUTH-02 SC#2c -- dispatchHover Reject click + confirm wiring', () => {

	it('dispatchHover.Reject.confirm.recordRejection: click Reject + confirm modal fires kernel.recordRejection with note="user_post_hoc_reject_benign_hover"', async () => {
		const { dispatchTier } = await import('../../../src/save-gate/tier-dispatch.js');
		const { __resetCanvasModuleForTests } = await import('../../../src/save-gate/canvas-module.js');

		await buildMockCanvasMod('silent', false);

		// Mock showInformationMessage -> 'Reject', showWarningMessage -> 'Reject'.
		// Note: showWarningMessage may not be defined natively on vscode.window in the
		// electron-as-node test harness (mirror Phase 14 mcp/liveness-banner-ext.test.ts pattern).
		const origShowInfo = vscode.window.showInformationMessage.bind(vscode.window);
		const origShowWarn = (vscode.window as unknown as { showWarningMessage?: unknown }).showWarningMessage;
		(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] =
			async (_msg: string, ..._actions: string[]) => 'Reject';
		(vscode.window as unknown as Record<string, unknown>)['showWarningMessage'] =
			async (_msg: string, ..._actions: unknown[]) => 'Reject';

		// Silence setStatusBarMessage.
		const origSetStatusBar = vscode.window.setStatusBarMessage.bind(vscode.window);
		(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = () => ({
			dispose: () => { },
		});

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

		const recordRejectionCalls: Array<Record<string, unknown>> = [];

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
				recordRejection: async (params: Record<string, unknown>) => {
					recordRejectionCalls.push(params);
				},
				recordContractOverride: async () => ({ attempt_node_id: 'test-override' }),
				onDriftProgress: () => () => { },
				runRippleProgressive: async () => ({ report: { contract_node_id: '', max_hops: 1, definitely_affected: [], potentially_affected: [], truncated: false, generated_at: '' } }),
				isConnected: () => true,
			} as unknown as Parameters<typeof dispatchTier>[0]['kernel'];

			const docUri = vscode.Uri.file('/tmp/reject-confirm-test.ts');
			const doc = {
				uri: docUri,
				getText: () => '',
				fileName: '/tmp/reject-confirm-test.ts',
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
					id: 'receipt-reject-confirm-test',
					change_id: 'change-reject-confirm-test',
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
				// Tolerate downstream throws -- Step 4 happens after Step 1.
			}

			assert.strictEqual(recordRejectionCalls.length, 1,
				'AUTH-02: clicking Reject + confirming must trigger exactly 1 kernel.recordRejection call. ' +
				`Captured ${recordRejectionCalls.length} calls. Plan 20-04 lands the Reject branch (commit 61bb7a1973a).`);
			const call = recordRejectionCalls[0];
			assert.strictEqual(call.note, 'user_post_hoc_reject_benign_hover',
				'OQ#1 resolution: note must equal "user_post_hoc_reject_benign_hover" verbatim. ' +
				`Got: ${JSON.stringify(call.note)}.`);
			assert.strictEqual(call.receipt_id, 'receipt-reject-confirm-test',
				'recordRejection.receipt_id must match the receipt id from DispatchInputs.');
			assert.strictEqual(call.change_id, 'change-reject-confirm-test',
				'recordRejection.change_id must match the change_id from DispatchInputs.');
		} finally {
			(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = origShowInfo;
			if (origShowWarn === undefined) {
				delete (vscode.window as unknown as { showWarningMessage?: unknown }).showWarningMessage;
			} else {
				(vscode.window as unknown as Record<string, unknown>)['showWarningMessage'] = origShowWarn;
			}
			(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = origSetStatusBar;
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
			__resetCanvasModuleForTests();
		}
	});

});
