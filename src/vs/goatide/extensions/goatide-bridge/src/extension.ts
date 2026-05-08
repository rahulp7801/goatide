/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/extension.ts — Phase 4 (Plan 04-05 + 04-06)
// + Phase 5 (Plan 05-02 daemon mode).
// Activates KernelClient + CanvasPanel + save-gate + HeartbeatPoller +
// KernelDegradedBanner + PendingAttemptsQueue. Plan 04-06 adds the reconnect command;
// Plan 05-02 swaps connect()/spawnKernel for ensureKernel reconnect-or-spawn (TELE-05).

import * as vscode from 'vscode';
import * as path from 'node:path';
import { KernelClient } from './kernel/client.js';
import { HeartbeatPoller } from './kernel/heartbeat.js';
import { CanvasPanel } from './canvas/panel.js';
import { registerSaveGate } from './save-gate/on-will-save.js';
import { scanForOrphanStagingFiles } from './save-gate/recovery-scan.js';
import { PendingAttemptsQueue } from './save-gate/pending-attempts.js';
import { KernelDegradedBanner } from './status-bar/kernel-degraded.js';
import { registerGitEventWatcher } from './harvester/git-events.js';
import { registerHarvester } from './harvester/index.js';
import { registerMcpLivenessBannerExtension } from './mcp/liveness-banner-ext.js';
import { registerSchemaDriftBanner } from './mcp/schema-drift-banner.js';
import { registerMcpReconnectCommand } from './mcp/reconnect-command.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('[goatide-bridge] activate (Phase 4)');

	// kernel/dist/main.js — relative to this extension's dist/extension.js position.
	// Layout: <fork-root>/src/vs/goatide/extensions/goatide-bridge/dist/extension.js
	// Kernel:  <fork-root>/kernel/dist/main.js
	const kernelPath = path.resolve(context.extensionUri.fsPath, '..', '..', '..', '..', 'kernel', 'dist', 'main.js');

	const kernel = new KernelClient();
	context.subscriptions.push({ dispose: () => kernel.dispose() });
	try {
		// Plan 05-02: ensureKernel reconnect-or-spawn. Reads lockfile; if alive, reuses
		// existing daemon (Mandate-A: kernel survives IDE close). Otherwise spawns
		// detached kernel and waits for its lockfile.
		await kernel.ensureKernel({ kernelPath });
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

	// Phase 5 watchers wired:
	registerGitEventWatcher(context, kernel);     // Plan 05-03 — TELE-04
	registerHarvester(context, kernel);           // Plan 05-04 — TELE-02 + TELE-03 (+ later TELE-06)
	// /Phase 5 watchers wired

	// Phase 6 Plan 06-06 — MCP UI surfaces:
	//   - LivenessBanner extension command (`goatide.mcp.showStaleProviders`) — focused
	//     entry point that filters the harvester liveness report to mcp.* sources and offers
	//     reconnect actions per stale provider.
	//   - SchemaDriftBanner — separate StatusBarItem (priority 98) that polls
	//     mcp.getSchemaDriftReport every 30s and renders errorBackground when any provider
	//     is paused on schema drift; click target offers Accept-new-schema / Pause-longer /
	//     View-diff actions.
	//   - `goatide.mcp.reconnect` command — palette-accessible single-provider reconnect.
	registerMcpLivenessBannerExtension(context, kernel);
	registerSchemaDriftBanner(context, kernel);
	registerMcpReconnectCommand(context, kernel);
	// /Phase 6 MCP wirings

	// Phase 7 Plan 07-05 — goatide.setSessionPriority command. Surfaces a quickPick over
	// the four canonical priorities (Pitfall 5: typed enum prevents typos; 'Custom...'
	// fallback allows free-form for advanced users) and writes the chosen value to the
	// workspace configuration under 'goatide.session.priority'. tier-dispatch.ts reads the
	// same key to thread session_priority into kernel.proposeEdit (DRIFT-02 evaluator).
	context.subscriptions.push(
		vscode.commands.registerCommand('goatide.setSessionPriority', async () => {
			const items = ['Speed-First', 'Quality-First', 'Safety-First', 'Cost-First', 'Custom...'];
			const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select current session priority' });
			if (!pick) {
				return;
			}
			let value = pick;
			if (pick === 'Custom...') {
				const custom = await vscode.window.showInputBox({
					prompt: 'Enter custom session priority (free-form; canonical four are recommended)',
					value: '',
				});
				if (!custom) {
					return;
				}
				value = custom;
			}
			await vscode.workspace
				.getConfiguration('goatide')
				.update('session.priority', value, vscode.ConfigurationTarget.Workspace);
		}),
	);

	// Plan 04-06: real reconnect command (replaces Plan 04-05's stub). Drives
	// startReconnectAttempts with a 5-attempt cap so a permanently-dead kernel doesn't
	// loop forever; user can re-issue the command for another round.
	context.subscriptions.push(
		vscode.commands.registerCommand('goatide.kernel.reconnect', async () => {
			try {
				// Plan 05-02 fast-path: if the lockfile points at a still-alive daemon, just
				// reconnect TCP without re-spawning. Otherwise fall through to the standard
				// startReconnectAttempts loop (which will spawn fresh via ensureKernel).
				const lock = kernel.getDaemonLockfile();
				if (lock && lock.alive) {
					await kernel.reconnect();
				} else {
					await kernel.state.startReconnectAttempts(() => kernel.reconnect(), { maxAttempts: 5 });
				}
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
