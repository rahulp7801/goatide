/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/cross-repo-command.test.ts — Phase 17 Plan 17-01 (Wave-0) RED suite.
//
// DEEP-06 phase-B: the goatide.openCrossRepoGraph command is registered in extension.ts
// and opens GraphInspectorPanel.getOrCreateForCrossRepo when the workspace has >= 2 folders.
// When workspace is undefined or single-folder, it shows an info notification and returns.
//
// Expected: RED at Wave-0 close:
//   - extension.ts has no 'goatide.openCrossRepoGraph' registration yet
//   - GraphInspectorPanel.getOrCreateForCrossRepo does not exist yet
// Wave 3 Plan 17-04 GREEN-flips these tests.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

describe('goatide.openCrossRepoGraph command (DEEP-06 phase-B)', () => {

	it('goatide.openCrossRepoGraph — shows info notification and early-returns when workspaceFolders is undefined', async () => {
		// Mock workspaceFolders = undefined
		const origWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			get: () => undefined,
			configurable: true,
		});

		const showInfoCalls: unknown[][] = [];
		const origShowInfo = vscode.window.showInformationMessage.bind(vscode.window);
		(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = async (...args: unknown[]) => {
			showInfoCalls.push(args);
			return undefined;
		};

		// Track whether GraphInspectorPanel.getOrCreateForCrossRepo was called
		let getOrCreateForCrossRepoCalls = 0;
		const { GraphInspectorPanel } = await import('../../src/inspector/panel.js');
		const origMethod = (GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'];
		(GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'] = (..._args: unknown[]) => {
			getOrCreateForCrossRepoCalls++;
		};

		try {
			// Execute the command — this will fail RED if not yet registered
			try {
				await vscode.commands.executeCommand('goatide.openCrossRepoGraph');
			} catch (e) {
				// In RED state, the command is not registered; executeCommand throws
				// or resolves to undefined. Assert the RED state explicitly.
				assert.fail(
					'Wave 3 Plan 17-04 GREEN-flips — goatide.openCrossRepoGraph is not yet registered in extension.ts. ' +
					`Error: ${e}. ` +
					'Wave 3 adds: vscode.commands.registerCommand("goatide.openCrossRepoGraph", handler) in extension.ts ' +
					'where handler checks workspaceFolders, shows info message when undefined/single, ' +
					'and calls GraphInspectorPanel.getOrCreateForCrossRepo when >= 2 folders.',
				);
			}

			// Verify: showInformationMessage called, getOrCreateForCrossRepo NOT called
			assert.ok(
				showInfoCalls.length >= 1,
				'Wave 3 Plan 17-04 GREEN-flips — showInformationMessage must be called when workspaceFolders is undefined',
			);
			const hasNoMultiRoot = showInfoCalls.some(args =>
				typeof args[0] === 'string' && /No multi-root workspace/i.test(args[0])
			);
			assert.ok(
				hasNoMultiRoot,
				'Wave 3 Plan 17-04 GREEN-flips — showInformationMessage must be called with a message matching /No multi-root workspace/i',
			);
			assert.strictEqual(
				getOrCreateForCrossRepoCalls,
				0,
				'Wave 3 Plan 17-04 GREEN-flips — GraphInspectorPanel.getOrCreateForCrossRepo must NOT be called when workspaceFolders is undefined',
			);
		} finally {
			if (origWorkspaceFolders) {
				Object.defineProperty(vscode.workspace, 'workspaceFolders', origWorkspaceFolders);
			}
			(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = origShowInfo;
			if (origMethod !== undefined) {
				(GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'] = origMethod;
			} else {
				delete (GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'];
			}
		}
	});

	it('goatide.openCrossRepoGraph — shows info notification when workspaceFolders.length === 1', async () => {
		const singleFolder: vscode.WorkspaceFolder[] = [{
			uri: vscode.Uri.file('/tmp/single-repo'),
			name: 'single-repo',
			index: 0,
		}];
		const origWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			get: () => singleFolder,
			configurable: true,
		});

		const showInfoCalls: unknown[][] = [];
		const origShowInfo = vscode.window.showInformationMessage.bind(vscode.window);
		(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = async (...args: unknown[]) => {
			showInfoCalls.push(args);
			return undefined;
		};

		let getOrCreateForCrossRepoCalls = 0;
		const { GraphInspectorPanel } = await import('../../src/inspector/panel.js');
		const origMethod = (GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'];
		(GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'] = (..._args: unknown[]) => {
			getOrCreateForCrossRepoCalls++;
		};

		try {
			try {
				await vscode.commands.executeCommand('goatide.openCrossRepoGraph');
			} catch (e) {
				assert.fail(
					'Wave 3 Plan 17-04 GREEN-flips — goatide.openCrossRepoGraph is not yet registered in extension.ts. ' +
					`Error: ${e}. ` +
					'Wave 3 adds the command handler with single-folder info message + early-return.',
				);
			}

			assert.ok(
				showInfoCalls.length >= 1,
				'Wave 3 Plan 17-04 GREEN-flips — showInformationMessage must be called when workspaceFolders.length === 1',
			);
			assert.strictEqual(
				getOrCreateForCrossRepoCalls,
				0,
				'Wave 3 Plan 17-04 GREEN-flips — GraphInspectorPanel.getOrCreateForCrossRepo must NOT be called when workspaceFolders.length === 1',
			);
		} finally {
			if (origWorkspaceFolders) {
				Object.defineProperty(vscode.workspace, 'workspaceFolders', origWorkspaceFolders);
			}
			(vscode.window as unknown as Record<string, unknown>)['showInformationMessage'] = origShowInfo;
			if (origMethod !== undefined) {
				(GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'] = origMethod;
			} else {
				delete (GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'];
			}
		}
	});

	it('goatide.openCrossRepoGraph — opens GraphInspectorPanel.getOrCreateForCrossRepo when workspaceFolders.length >= 2', async () => {
		const multiFolders: vscode.WorkspaceFolder[] = [
			{ uri: vscode.Uri.file('/tmp/repo-a'), name: 'repo-a', index: 0 },
			{ uri: vscode.Uri.file('/tmp/repo-b'), name: 'repo-b', index: 1 },
		];
		const origWorkspaceFolders = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
		Object.defineProperty(vscode.workspace, 'workspaceFolders', {
			get: () => multiFolders,
			configurable: true,
		});

		let getOrCreateForCrossRepoCalls = 0;
		const { GraphInspectorPanel } = await import('../../src/inspector/panel.js');
		const origMethod = (GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'];
		(GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'] = (..._args: unknown[]) => {
			getOrCreateForCrossRepoCalls++;
		};

		try {
			try {
				await vscode.commands.executeCommand('goatide.openCrossRepoGraph');
			} catch (e) {
				assert.fail(
					'Wave 3 Plan 17-04 GREEN-flips — goatide.openCrossRepoGraph is not yet registered in extension.ts. ' +
					`Error: ${e}. ` +
					'Wave 3 adds: GraphInspectorPanel.getOrCreateForCrossRepo(context, kernel, workspaceFolders) ' +
					'called when workspaceFolders.length >= 2.',
				);
			}

			assert.strictEqual(
				getOrCreateForCrossRepoCalls,
				1,
				'Wave 3 Plan 17-04 GREEN-flips — GraphInspectorPanel.getOrCreateForCrossRepo must be called exactly once when workspaceFolders.length >= 2',
			);
		} finally {
			if (origWorkspaceFolders) {
				Object.defineProperty(vscode.workspace, 'workspaceFolders', origWorkspaceFolders);
			}
			if (origMethod !== undefined) {
				(GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'] = origMethod;
			} else {
				delete (GraphInspectorPanel as unknown as Record<string, unknown>)['getOrCreateForCrossRepo'];
			}
		}
	});

});
