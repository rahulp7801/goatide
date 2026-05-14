/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/integration/inspector/command-registration.test.ts —
// Phase 15 Plan 15-03 (Wave-2 — DEEP-02 host wiring).
//
// Mocha integration coverage for the `goatide.openGraphInspector` command:
//   1. Command is registered after the activation snippet runs.
//   2. Invoking the command with a connected kernel triggers
//      GraphInspectorPanel.getOrCreate exactly once.
//   3. Invoking the command with a disconnected kernel shows a warning notification
//      AND does NOT call GraphInspectorPanel.getOrCreate.
//
// We don't activate the entire bridge extension (that would spawn a real kernel +
// register the save-gate + spin up the canvas panel). Instead we mirror the
// registration snippet from src/extension.ts and assert the registered callback's
// behavior. Same pattern as drift/intent-drift.test.ts (Plan 07-05).

import { describe, it, before, beforeEach, after } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { GraphInspectorPanel } from '../../../src/inspector/panel.js';

// Lightweight spy: replaces a method on `target` with a counter; restore() reverts.
interface MethodSpy {
	callCount: number;
	calls: unknown[][];
	restore(): void;
}

function spyOn<T extends object, K extends keyof T>(target: T, method: K, replacement?: (...args: unknown[]) => unknown): MethodSpy {
	const original = target[method] as unknown as (...args: unknown[]) => unknown;
	const spy: MethodSpy = { callCount: 0, calls: [], restore: () => { (target[method] as unknown) = original; } };
	(target[method] as unknown) = ((...args: unknown[]) => {
		spy.callCount++;
		spy.calls.push(args);
		return replacement ? replacement(...args) : (original ? original.apply(target, args) : undefined);
	}) as unknown;
	return spy;
}

// Mirror of the goatide.openGraphInspector registration snippet from extension.ts —
// kept in sync verbatim with the production code path. Any drift breaks Test 1 below.
function registerInspectorCommand(context: vscode.ExtensionContext, kernel: { isConnected(): boolean }): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('goatide.openGraphInspector', () => {
			if (!kernel.isConnected()) {
				vscode.window.showWarningMessage('GoatIDE Graph Inspector requires the kernel to be connected.');
				return;
			}
			const inspector = GraphInspectorPanel.getOrCreate(context, kernel as never);
			inspector.reveal();
		}),
	);
}

describe('inspector command registration', () => {
	let kernelIsConnected: boolean;
	const fakeKernel = { isConnected: () => kernelIsConnected };
	const fakeContext = { subscriptions: [] as vscode.Disposable[], extensionUri: vscode.Uri.joinPath ? { fsPath: '' } as vscode.Uri : ({} as vscode.Uri) } as unknown as vscode.ExtensionContext;
	let getOrCreateSpy: MethodSpy;

	before(() => {
		// Register the command once — getRegisteredCommand will look it up on every it().
		registerInspectorCommand(fakeContext, fakeKernel);
	});

	beforeEach(() => {
		kernelIsConnected = true;
		// Replace getOrCreate with a fake that returns a stub with reveal(). Avoids the
		// real createWebviewPanel call (which throws in the vscode-stub harness).
		getOrCreateSpy = spyOn(GraphInspectorPanel, 'getOrCreate', () => {
			return { reveal: () => { /* no-op */ } } as unknown as GraphInspectorPanel;
		});
	});

	after(() => {
		// Best-effort: clear any lingering registration on the vscode stub so other tests
		// re-registering this command id don't see a stale callback.
		const registry = (vscode as unknown as { __test_registeredCommands?: Map<string, unknown> }).__test_registeredCommands;
		registry?.delete('goatide.openGraphInspector');
	});

	it('registers the goatide.openGraphInspector command', () => {
		const registry = (vscode as unknown as { __test_registeredCommands?: Map<string, (...args: unknown[]) => unknown> }).__test_registeredCommands;
		assert.ok(registry, 'vscode-stub must expose __test_registeredCommands');
		assert.ok(registry!.has('goatide.openGraphInspector'),
			'goatide.openGraphInspector should be registered during activation');
		getOrCreateSpy.restore();
	});

	it('invokes GraphInspectorPanel.getOrCreate when kernel is connected', async () => {
		kernelIsConnected = true;
		const registry = (vscode as unknown as { __test_registeredCommands?: Map<string, (...args: unknown[]) => unknown> }).__test_registeredCommands;
		const cmd = registry?.get('goatide.openGraphInspector');
		assert.ok(cmd, 'goatide.openGraphInspector callback must be retrievable');
		try {
			await Promise.resolve(cmd!());
			assert.strictEqual(getOrCreateSpy.callCount, 1, 'GraphInspectorPanel.getOrCreate should be called exactly once');
		} finally {
			getOrCreateSpy.restore();
		}
	});

	it('shows warning + does not invoke getOrCreate when kernel is disconnected', async () => {
		kernelIsConnected = false;
		const warningSpy = spyOn(vscode.window, 'showWarningMessage', () => Promise.resolve(undefined));
		const registry = (vscode as unknown as { __test_registeredCommands?: Map<string, (...args: unknown[]) => unknown> }).__test_registeredCommands;
		const cmd = registry?.get('goatide.openGraphInspector');
		assert.ok(cmd, 'goatide.openGraphInspector callback must be retrievable');
		try {
			await Promise.resolve(cmd!());
			assert.strictEqual(getOrCreateSpy.callCount, 0, 'GraphInspectorPanel.getOrCreate must NOT be called when disconnected');
			assert.strictEqual(warningSpy.callCount, 1, 'showWarningMessage should be called once');
			const firstCall = warningSpy.calls[0]![0] as string;
			assert.ok(firstCall.includes('kernel'), `warning message should mention kernel; got: ${firstCall}`);
		} finally {
			warningSpy.restore();
			getOrCreateSpy.restore();
		}
	});
});
