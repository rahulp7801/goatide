/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/extension.ts — Phase 4 (Plan 04-05 + 04-06).
// Activates KernelClient + CanvasPanel + save-gate + HeartbeatPoller +
// KernelDegradedBanner + PendingAttemptsQueue. Plan 04-06 adds the real reconnect
// command (replacing Plan 04-05's stub) which drives ConnectionStateMachine.startReconnectAttempts
// and drains the pending-attempts queue on success.

import * as vscode from 'vscode';
import * as path from 'node:path';
import { KernelClient } from './kernel/client.js';
import { HeartbeatPoller } from './kernel/heartbeat.js';
import { CanvasPanel } from './canvas/panel.js';
import { registerSaveGate } from './save-gate/on-will-save.js';
import { scanForOrphanStagingFiles } from './save-gate/recovery-scan.js';
import { PendingAttemptsQueue } from './save-gate/pending-attempts.js';
import { KernelDegradedBanner } from './status-bar/kernel-degraded.js';

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

	// Plan 04-06: pending-attempts queue rooted at the first workspace folder, falling
	// back to the extension dir if no workspace is open (rare; degraded saves wouldn't
	// have a target anyway).
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? context.extensionUri.fsPath;
	const queue = new PendingAttemptsQueue(workspaceRoot);

	// Plan 04-06: heartbeat poller (10s interval, 30s miss threshold) + status-bar banner.
	const heartbeat = new HeartbeatPoller(kernel, kernel.state);
	heartbeat.start();
	context.subscriptions.push({ dispose: () => heartbeat.stop() });

	const banner = new KernelDegradedBanner(kernel.state);
	context.subscriptions.push(banner);

	// Recovery scan first — clean up orphan staging files from any previous crash before
	// we wire the new save-gate listener (which would create more staging files).
	await scanForOrphanStagingFiles(context, kernel).catch((e) => {
		console.error('[goatide-bridge] recovery scan failed', e);
	});

	registerSaveGate(context, kernel, panel, queue);

	// Plan 04-06: real reconnect command (replaces Plan 04-05's stub). Drives
	// startReconnectAttempts with a 5-attempt cap so a permanently-dead kernel doesn't
	// loop forever; user can re-issue the command for another round.
	context.subscriptions.push(
		vscode.commands.registerCommand('goatide.kernel.reconnect', async () => {
			try {
				await kernel.state.startReconnectAttempts(() => kernel.reconnect(), { maxAttempts: 5 });
				const report = await queue.drainAll(kernel);
				if (report.total === 0) {
					vscode.window.showInformationMessage('GoatIDE: kernel reconnected.');
				} else {
					vscode.window.showInformationMessage(
						`GoatIDE: kernel reconnected; drained ${report.drained}/${report.total} pending attempts (${report.failed} failed).`,
					);
				}
			} catch (e) {
				vscode.window.showErrorMessage(`GoatIDE: reconnect failed — ${e instanceof Error ? e.message : String(e)}`);
			}
		}),
	);
}

export async function deactivate(): Promise<void> {
	// Subscriptions handle cleanup via context.subscriptions.
}
