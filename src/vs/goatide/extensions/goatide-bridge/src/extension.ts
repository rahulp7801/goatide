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
import * as fs from 'node:fs';
import { KernelClient } from './kernel/client.js';
import { HeartbeatPoller } from './kernel/heartbeat.js';
import { CanvasPanel } from './canvas/panel.js';
import { GraphInspectorPanel } from './inspector/panel.js';
import { registerSaveGate } from './save-gate/on-will-save.js';
import { getCanvasModule } from './save-gate/canvas-module.js';
import { scanForOrphanStagingFiles } from './save-gate/recovery-scan.js';
import { PendingAttemptsQueue } from './save-gate/pending-attempts.js';
import { KernelDegradedBanner } from './status-bar/kernel-degraded.js';
import { registerGitEventWatcher } from './harvester/git-events.js';
import { registerHarvester } from './harvester/index.js';
import { registerMcpLivenessBannerExtension } from './mcp/liveness-banner-ext.js';
import { registerSchemaDriftBanner } from './mcp/schema-drift-banner.js';
import { registerMcpReconnectCommand } from './mcp/reconnect-command.js';
import { registerWalkthroughCompletion, maybeAutoOpenWalkthrough } from './onboarding/walkthrough-completion.js';

/**
 * BRIDGE-RT-01: resolves `<fork-root>/kernel/dist/main.js` across both bridge load modes.
 *
 * The literal `..` count from extensionUri to fork-root differs by mode:
 *   - Dev mode (--extensionDevelopmentPath): extensionUri = `<root>/src/vs/goatide/extensions/goatide-bridge` → 5 `..`
 *   - Built-in mode (Plan 08-05 mirror):    extensionUri = `<root>/extensions/goatide-bridge`               → 2 `..`
 *
 * Hardcoding either count breaks the other mode. Stat-then-fallback handles both: try
 * each candidate in turn, return the first that exists on disk. If neither exists,
 * throw with both attempted paths so the failure is debuggable (typically means
 * `cd kernel && npm install && npm run build` was skipped).
 *
 * Exported so unit tests can verify both load modes without spinning up an extension host.
 *
 * @throws Error with both attempted paths listed if neither candidate exists on disk.
 */
export function resolveKernelPath(extensionUri: vscode.Uri): string {
	const ext = extensionUri.fsPath;
	const candidates = [
		// Dev mode: src/vs/goatide/extensions/goatide-bridge/ → root (5 ..)
		path.resolve(ext, '..', '..', '..', '..', '..', 'kernel', 'dist', 'main.js'),
		// Built-in mode: extensions/goatide-bridge/ → root (2 ..)
		path.resolve(ext, '..', '..', 'kernel', 'dist', 'main.js'),
	];
	for (const candidate of candidates) {
		try {
			fs.statSync(candidate);
			return candidate;
		} catch {
			// try next candidate
		}
	}
	throw new Error(
		`[goatide-bridge] kernelPath resolution failed. extensionUri=${ext}. ` +
		`Tried: ${candidates.join(' AND ')}. ` +
		`Did 'cd kernel && npm install && npm run build' run successfully?`,
	);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('[goatide-bridge] activate (Phase 4)');

	// BRIDGE-RT-01: stat-then-fallback resolver (see resolveKernelPath above). Replaces
	// the hardcoded 4-`..` literal that worked only when the activation root happened to
	// be 4 levels above kernel/dist; both dev mode (5 ..) and built-in mirror (2 ..) now
	// resolve correctly.
	const kernelPath = resolveKernelPath(context.extensionUri);

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

	// DEFERRED-11-01-A robustness fix: instead of capturing a single panel reference
	// (which becomes stale if the user closes the Verification Canvas tab — panel.show()
	// then throws), wrap with a getter that always returns a live panel via getOrCreate.
	// getOrCreate is idempotent: returns the existing instance if still alive, recreates
	// otherwise. This means closing the canvas tab and triggering another save just works.
	let panel = CanvasPanel.getOrCreate(context);
	context.subscriptions.push({ dispose: () => panel.dispose() });
	const getPanel = (): CanvasPanel => {
		// CanvasPanel.getOrCreate returns the existing instance if non-disposed, or creates a
		// fresh one when the prior instance was disposed (e.g., user closed the tab).
		panel = CanvasPanel.getOrCreate(context);
		return panel;
	};

	// Phase 16 Plan 16-03 (DEEP-03) — hypothetical-impact handler. Registered against the
	// initial CanvasPanel singleton at activation. Note: getPanel() returns a live panel on
	// each save; the handler closure captures `kernel` which persists for the extension
	// lifetime. When the user triggers a constraint-lift button click, panel.ts's
	// canvas.requestConstraintLift branch invokes this closure with the asOf extracted from
	// lastPayload.graph_snapshot_tx_time (Pitfall 1 fence — NEVER a fresh Date at click time).
	panel.registerConstraintLiftHandler(async (payload) => {
		try {
			const result = await kernel.constraintLift({
				constraint_node_id: payload.constraint_node_id,
				asOf: payload.asOf,
				max_hops: payload.max_hops,
				confidence_threshold: payload.confidence_threshold,
			});
			return {
				kind: 'ok',
				hypothetical_impact: result.hypothetical_impact,
				confidence_score: result.confidence_score,
			};
		} catch {
			return { kind: 'degraded' };
		}
	});

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

	// Phase 12 Plan 12-01 (CONTEXT.md Option B): pre-warm the kernel canvas module so the
	// synchronous onWillSaveTextDocument listener can call detectDestructive +
	// citesHighImpactContract BEFORE the `event.reason !== Manual` early-return without
	// triggering the dynamic-import on the hot path. Async pre-warm during activation; the
	// listener accesses the cached value via getCanvasModuleSync().
	await getCanvasModule().catch((e) => {
		console.error('[goatide-bridge] canvas module pre-warm failed (save-gate destructive detection will fall back to silent-pass)', e);
	});

	registerSaveGate(context, kernel, getPanel, queue);

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

	// Phase 15 Plan 15-03 (DEEP-02) — Graph Inspector Panel open command. Read-only
	// inspector consumes the kernel's bitemporal snapshot RPCs via the structurally-narrowed
	// ReadonlyKernelClient surface (Mandate B fence — refuse-deep05-write.sh enforces).
	// Guard with isConnected() so an offline kernel produces a warning notification instead
	// of an obscure RPC timeout. The webview render layer ships in Phase 15 Plan 15-04
	// (Wave 3); until then reveal() paints an empty webview shell.
	context.subscriptions.push(
		vscode.commands.registerCommand('goatide.openGraphInspector', () => {
			if (!kernel.isConnected()) {
				vscode.window.showWarningMessage('GoatIDE Graph Inspector requires the kernel to be connected.');
				return;
			}
			// TypeScript narrows `kernel` (full KernelClient) to ReadonlyKernelClient at the
			// argument site because the parameter type is Pick<KernelClient, ...>. No cast.
			const inspector = GraphInspectorPanel.getOrCreate(context, kernel);
			inspector.reveal();
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

	// Phase 17 Plan 17-03 POLISH-01 — wire walkthrough. ORDERING INVARIANT (N3):
	// ALL command registrations land BEFORE maybeAutoOpenWalkthrough fires so the
	// walkthrough's command-link buttons + completionEvents have registered handlers
	// when the Getting Started panel renders.

	// First — register the walkthrough completion command (Pitfall 9 fence — landed Plan 17-01 Task 2):
	context.subscriptions.push(registerWalkthroughCompletion(context));

	// Phase 17 Plan 17-03 POLISH-03 — placeholder authoring command. The CTA in the
	// Verification Canvas empty-state posts a canvas.requestAddDecisionNode message
	// which routes to this command via canvas/panel.ts handleMessage. v2.1 will swap
	// the placeholder for the real authoring flow without touching the empty-state JSX.
	// Registered HERE (before maybeAutoOpenWalkthrough) so the empty-state CTA has a
	// valid command target the moment the user encounters it (e.g. on a same-session
	// first-save right after the walkthrough completes).
	context.subscriptions.push(
		vscode.commands.registerCommand('goatide.canvas.addDecisionNode', async () => {
			await vscode.window.showInformationMessage(
				'GoatIDE: Adding DecisionNode is coming in v2.1 - for now, edit your contracts file directly to add a new ## ConstraintNode or ## DecisionNode section.',
			);
		}),
	);

	// Phase 17 Plan 17-03 POLISH-01 — auto-open the walkthrough on fresh activation.
	// void prefix is intentional: maybeAutoOpenWalkthrough returns Promise<void> and
	// we deliberately don't await it (it would block extension activation on the UI
	// thread). Fire-and-forget pattern matches the existing SchemaDriftBanner async
	// bootstrap precedent at Phase 10 Plan 10-02. ORDERING REQUIREMENT (N3): this
	// call MUST follow the registerCommand calls above so the walkthrough's
	// command-links have valid targets when the Getting Started panel renders.
	void maybeAutoOpenWalkthrough(context);
}

export async function deactivate(): Promise<void> {
	// Subscriptions handle cleanup via context.subscriptions.
}
