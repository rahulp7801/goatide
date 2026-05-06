/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/extension.ts — Phase 4 (Plan 04-05).
// REPLACES Phase-1 stub. Activates KernelClient + CanvasPanel + save-gate.

import * as vscode from 'vscode';
import * as path from 'node:path';
import { KernelClient } from './kernel/client.js';
import { CanvasPanel } from './canvas/panel.js';
import { registerSaveGate } from './save-gate/on-will-save.js';
import { scanForOrphanStagingFiles } from './save-gate/recovery-scan.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('[goatide-bridge] activate (Phase 4)');

	// kernel/dist/main.js — relative to this extension's dist/extension.js position.
	// Layout: <fork-root>/src/vs/goatide/extensions/goatide-bridge/dist/extension.js
	// Kernel:  <fork-root>/kernel/dist/main.js
	const kernelPath = path.resolve(context.extensionUri.fsPath, '..', '..', '..', '..', 'kernel', 'dist', 'main.js');

	const kernel = new KernelClient();
	context.subscriptions.push({ dispose: () => kernel.dispose() });
	try {
		await kernel.connect(kernelPath);
	} catch (e) {
		vscode.window.showErrorMessage(`GoatIDE: failed to start kernel sidecar: ${e instanceof Error ? e.message : String(e)}`);
		// Continue activation in degraded state — Plan 04-06 banner picks up the connection state.
	}

	const panel = CanvasPanel.getOrCreate(context);
	context.subscriptions.push({ dispose: () => panel.dispose() });

	// Recovery scan first — clean up orphan staging files from any previous crash before
	// we wire the new save-gate listener (which would create more staging files).
	await scanForOrphanStagingFiles(context, kernel).catch((e) => {
		console.error('[goatide-bridge] recovery scan failed', e);
	});

	registerSaveGate(context, kernel, panel);

	// Reconnect command — Plan 04-06 wires the actual reconnect logic (this plan registers a stub).
	context.subscriptions.push(
		vscode.commands.registerCommand('goatide.kernel.reconnect', async () => {
			vscode.window.showInformationMessage('GoatIDE: reconnect logic lands in Plan 04-06.');
		}),
	);
}

export async function deactivate(): Promise<void> {
	// Subscriptions handle cleanup via context.subscriptions.
}
