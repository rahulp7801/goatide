/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/walkthrough-completion.test.ts — Phase 17 Plan 17-01 (Wave-0) GREEN suite.
//
// Cases for walkthrough-completion.ts ship with REAL bodies in Wave-0, so these tests
// flip GREEN at Wave-0 close.
//
// Pitfall 9 fence (POLISH-01): completion MUST write to context.globalState, NEVER to
// vscode.workspace.getConfiguration(...).update(...). globalState writes are flushed
// synchronously during extension host shutdown; WorkspaceConfiguration.update is async
// and races against fast IDE shutdown on Windows %APPDATA% disk flush.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

// vscode module is available in the bridge test environment (Electron mocha runner).
import * as vscode from 'vscode';

import { registerWalkthroughCompletion, maybeAutoOpenWalkthrough } from '../../src/onboarding/walkthrough-completion.js';

// ---------------------------------------------------------------------------
// Minimal fake ExtensionContext
// ---------------------------------------------------------------------------
function makeContext(onboardingComplete: boolean | undefined = undefined): vscode.ExtensionContext {
	const store = new Map<string, unknown>();
	if (onboardingComplete !== undefined) {
		store.set('goatide.onboardingComplete', onboardingComplete);
	}

	const globalState = {
		updateCallCount: 0,
		updateCalls: [] as Array<[string, unknown]>,
		get<T>(key: string, defaultValue?: T): T {
			return (store.has(key) ? store.get(key) : defaultValue) as T;
		},
		async update(key: string, value: unknown): Promise<void> {
			this.updateCallCount++;
			this.updateCalls.push([key, value]);
			store.set(key, value);
		},
		keys(): readonly string[] { return [...store.keys()]; },
		setKeysForSync(_keys: readonly string[]): void { /* noop */ },
	} as unknown as vscode.ExtensionContext['globalState'] & {
		updateCallCount: number;
		updateCalls: Array<[string, unknown]>;
	};

	return {
		globalState,
		subscriptions: [],
	} as unknown as vscode.ExtensionContext;
}

describe('walkthrough completion (POLISH-01 / Pitfall 9 fence)', () => {

	it('walkthrough completion handler (POLISH-01 / Pitfall 9 fence) writes to context.globalState NOT WorkspaceConfiguration', async () => {
		const context = makeContext();
		const gs = context.globalState as unknown as { updateCallCount: number; updateCalls: Array<[string, unknown]> };

		// Spy on vscode.workspace.getConfiguration to assert it is NOT called for update.
		const getConfigCalls: unknown[][] = [];
		const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);
		// A fake config object whose update() we can track
		let configUpdateCallCount = 0;
		const fakeConfig = {
			update: async (..._args: unknown[]) => { configUpdateCallCount++; },
			get: (..._args: unknown[]) => undefined,
			has: (..._args: unknown[]) => false,
			inspect: (..._args: unknown[]) => undefined,
		} as unknown as vscode.WorkspaceConfiguration;
		(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = (...args: unknown[]) => {
			getConfigCalls.push(args);
			return fakeConfig;
		};

		// Spy on vscode.commands.executeCommand
		const executeCommandCalls: unknown[][] = [];
		const origExecCmd = vscode.commands.executeCommand.bind(vscode.commands);
		(vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = async (...args: unknown[]) => {
			executeCommandCalls.push(args);
		};

		try {
			const disposable = registerWalkthroughCompletion(context);
			// Execute the registered command directly
			await vscode.commands.executeCommand('goatide.onboarding.complete');
			disposable.dispose();

			// Pitfall 9 fence: globalState.update called with correct key
			assert.ok(gs.updateCallCount >= 1, 'context.globalState.update must be called at least once');
			const hasOnboardingUpdate = gs.updateCalls.some(([k, v]) => k === 'goatide.onboardingComplete' && v === true);
			assert.ok(hasOnboardingUpdate, 'context.globalState.update must be called with (goatide.onboardingComplete, true)');

			// Pitfall 9 fence: WorkspaceConfiguration.update must NOT be called
			assert.strictEqual(configUpdateCallCount, 0, 'vscode.workspace.getConfiguration(...).update must NOT be called (Pitfall 9 fence)');
		} finally {
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
			(vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = origExecCmd;
		}
	});

	it('maybeAutoOpenWalkthrough invokes openWalkthrough command when globalState flag is falsy', async () => {
		const context = makeContext(undefined); // flag not set → falsy

		const executeCommandCalls: unknown[][] = [];
		const origExecCmd = vscode.commands.executeCommand.bind(vscode.commands);
		(vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = async (...args: unknown[]) => {
			executeCommandCalls.push(args);
		};

		try {
			await maybeAutoOpenWalkthrough(context);

			const openWalkthroughCall = executeCommandCalls.find(
				args => args[0] === 'workbench.action.openWalkthrough'
			);
			assert.ok(openWalkthroughCall, 'workbench.action.openWalkthrough must be called when globalState flag is falsy');
			assert.strictEqual(
				openWalkthroughCall![1],
				'goatide.goatide-bridge#goatide.onboarding',
				'walkthrough ID must match goatide.goatide-bridge#goatide.onboarding',
			);
		} finally {
			(vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = origExecCmd;
		}
	});

	it('maybeAutoOpenWalkthrough fires setContext only (no openWalkthrough) when globalState flag is true', async () => {
		const context = makeContext(true); // already completed

		const executeCommandCalls: unknown[][] = [];
		const origExecCmd = vscode.commands.executeCommand.bind(vscode.commands);
		(vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = async (...args: unknown[]) => {
			executeCommandCalls.push(args);
		};

		try {
			await maybeAutoOpenWalkthrough(context);

			const openWalkthroughCall = executeCommandCalls.find(
				args => args[0] === 'workbench.action.openWalkthrough'
			);
			assert.ok(!openWalkthroughCall, 'workbench.action.openWalkthrough must NOT be called when flag is true');

			const setContextCall = executeCommandCalls.find(args => args[0] === 'setContext');
			assert.ok(setContextCall, 'setContext must be called when globalState flag is true');
		} finally {
			(vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = origExecCmd;
		}
	});

});
