/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/save-gate/save-gate-resource-scope.test.ts — Phase 17 Plan 17-01 (Wave-0) RED suite.
//
// POLISH-02 requirement: dispatchTier MUST read goatide.saveGate settings using the
// resource-scoped overload of vscode.workspace.getConfiguration — i.e., the second
// argument must be the document's URI (vscode.Uri), not undefined/null.
//
// Expected: RED at Wave-0 close (tier-dispatch.ts has no 'goatide.saveGate' read yet).
// Wave 1 Plan 17-02 GREEN-flips these tests.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

describe('save-gate getConfiguration resource-scope (POLISH-02)', () => {

	it('save-gate getConfiguration uses resource-scoped overload — 2nd argument is a vscode.Uri', async () => {
		// Spy on vscode.workspace.getConfiguration to capture calls.
		const configCalls: unknown[][] = [];
		const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);

		// Fake config that returns sensible defaults
		const fakeConfig = {
			get: (key: string, defaultValue?: unknown) => defaultValue,
			has: (_key: string) => false,
			inspect: (_key: string) => undefined,
			update: async () => { },
		} as unknown as vscode.WorkspaceConfiguration;

		(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = (...args: unknown[]) => {
			configCalls.push(args);
			return fakeConfig;
		};

		try {
			// dispatchTier is called lazily; the actual test invokes the function
			// with a minimal inputs set. Since tier-dispatch.ts does NOT yet read
			// 'goatide.saveGate' in Wave 0, this test will fail with assertion error.
			// Wave 1 Plan 17-02 GREEN-flips by adding the resource-scoped read.

			// Import dispatchTier dynamically so the import does not hard-fail if the
			// module has compilation errors before Wave 1 lands.
			const { dispatchTier } = await import('../../../src/save-gate/tier-dispatch.js');

			const doc = {
				uri: vscode.Uri.file('/tmp/test-resource-scope.ts'),
				getText: () => '',
				fileName: '/tmp/test-resource-scope.ts',
				languageId: 'typescript',
				version: 1,
				isDirty: false,
				isUntitled: false,
				isClosed: false,
				save: async () => true,
				lineAt: () => ({ text: '', range: new vscode.Range(0, 0, 0, 0), rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 0), firstNonWhitespaceCharacterIndex: 0, isEmptyOrWhitespace: true }),
				lineCount: 1,
				eol: vscode.EndOfLine.LF,
				encoding: 'utf8',
				offsetAt: () => 0,
				positionAt: () => new vscode.Position(0, 0),
				validateRange: (r: vscode.Range) => r,
				validatePosition: (p: vscode.Position) => p,
				getWordRangeAtPosition: () => undefined,
			} as unknown as vscode.TextDocument;

			// Minimal mocks to prevent actual kernel/panel calls
			const kernel = {
				queryNodes: async () => [],
				atomicAccept: async () => { throw new Error('should not be called'); },
				proposeEdit: async () => { throw new Error('should not be called'); },
			} as unknown as Parameters<typeof dispatchTier>[0]['kernel'];

			const panel = {
				showAndAwait: async () => { throw new Error('Wave 1 Plan 17-02 GREEN-flips — dispatchTier not reached in RED state'); },
				registerOverrideHandler: () => { },
				registerRationaleHandler: () => { },
			} as unknown as Parameters<typeof dispatchTier>[0]['panel'];

			const inputs = {
				kernel,
				panel,
				doc,
				original: '',
				modified: '// change',
				diff: '+// change',
				receipt: {
					id: 'receipt-1',
					change_id: 'change-1',
					citations: [],
					graph_snapshot_tx_time: null,
				} as unknown as Parameters<typeof dispatchTier>[0]['receipt'],
				startMs: Date.now(),
			};

			// This will throw or fail since the real dispatchTier requires kernel etc.
			// The spy assertions below validate the resource-scoped call after Wave 1 lands.
			try {
				await dispatchTier(inputs as unknown as Parameters<typeof dispatchTier>[0]);
			} catch {
				// Expected in RED state — dispatchTier may fail for many reasons before Wave 1
			}

			// Filter for getConfiguration calls with 'goatide.saveGate' as first arg
			const saveGateCalls = configCalls.filter(args => args[0] === 'goatide.saveGate');
			assert.ok(
				saveGateCalls.length >= 1,
				'Wave 1 Plan 17-02 GREEN-flips — dispatchTier must call vscode.workspace.getConfiguration("goatide.saveGate", <uri>) at least once',
			);
			// The 2nd argument must be a vscode.Uri
			const secondArg = saveGateCalls[0][1];
			assert.ok(
				secondArg instanceof vscode.Uri,
				`Wave 1 Plan 17-02 GREEN-flips — 2nd arg to getConfiguration("goatide.saveGate", ...) must be a vscode.Uri, got: ${typeof secondArg}`,
			);
		} finally {
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
		}
	});

	it('save-gate getConfiguration 2nd-argument equals inputs.doc.uri verbatim', async () => {
		const configCalls: unknown[][] = [];
		const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);

		const fakeConfig = {
			get: (_key: string, defaultValue?: unknown) => defaultValue,
			has: (_key: string) => false,
			inspect: (_key: string) => undefined,
			update: async () => { },
		} as unknown as vscode.WorkspaceConfiguration;

		(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = (...args: unknown[]) => {
			configCalls.push(args);
			return fakeConfig;
		};

		try {
			const { dispatchTier } = await import('../../../src/save-gate/tier-dispatch.js');

			const docUri = vscode.Uri.file('/tmp/resource-scope-verbatim.ts');
			const doc = {
				uri: docUri,
				getText: () => '',
				fileName: '/tmp/resource-scope-verbatim.ts',
				languageId: 'typescript',
				version: 1,
				isDirty: false,
				isUntitled: false,
				isClosed: false,
				save: async () => true,
				lineCount: 1,
				eol: vscode.EndOfLine.LF,
			} as unknown as vscode.TextDocument;

			const panel = {
				showAndAwait: async () => { throw new Error('Wave 1 Plan 17-02 GREEN-flips'); },
				registerOverrideHandler: () => { },
				registerRationaleHandler: () => { },
			} as unknown as Parameters<typeof dispatchTier>[0]['panel'];

			const kernel = {
				queryNodes: async () => [],
			} as unknown as Parameters<typeof dispatchTier>[0]['kernel'];

			const inputs = {
				kernel,
				panel,
				doc,
				original: '',
				modified: '// change',
				diff: '+// change',
				receipt: {
					id: 'receipt-2',
					change_id: 'change-2',
					citations: [],
					graph_snapshot_tx_time: null,
				} as unknown as Parameters<typeof dispatchTier>[0]['receipt'],
				startMs: Date.now(),
			};

			try {
				await dispatchTier(inputs as unknown as Parameters<typeof dispatchTier>[0]);
			} catch {
				// Expected in RED state
			}

			const saveGateCalls = configCalls.filter(args => args[0] === 'goatide.saveGate');
			assert.ok(
				saveGateCalls.length >= 1,
				'Wave 1 Plan 17-02 GREEN-flips — no getConfiguration("goatide.saveGate", ...) call found',
			);
			const secondArg = saveGateCalls[0][1];
			assert.ok(
				secondArg instanceof vscode.Uri,
				'Wave 1 Plan 17-02 GREEN-flips — 2nd arg must be a vscode.Uri',
			);
			assert.strictEqual(
				(secondArg as vscode.Uri).toString(),
				docUri.toString(),
				'Wave 1 Plan 17-02 GREEN-flips — 2nd arg must equal doc.uri verbatim',
			);
		} finally {
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
		}
	});

});
