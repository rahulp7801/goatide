/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge save-gate listener — Plan 04-05 (cancel-then-redo) + Plan 04-06 (CANV-10
// kernel-degraded fork).
//
// Wires vscode.workspace.onWillSaveTextDocument with cancel-then-redo (RESEARCH
// ## Pattern: Save Gate + ## Pitfall 1: 1.5s budget). The handler vetoes the save
// IMMEDIATELY (synchronous) and runs the proposal flow asynchronously OUTSIDE the
// budget. Non-Manual save reasons (auto-save, format-on-save) are skipped so we
// don't block data-integrity flushes.
//
// Plan 04-06 adds the kernel-degraded fork: when kernel.isConnected() is false at
// handle-time, handleProposedSave routes to handleKernelDegradedSave which:
//   - non-destructive saves: write file directly + queue an Attempt of tier
//     'kernel_degraded' to <workspace>/.goatide/pending-attempts.jsonl. The bridge's
//     reconnect command drains this queue via kernel.atomicAccept on success.
//   - destructive saves: BLOCK with vscode.window.showErrorMessage + a Reconnect
//     button. The save is NOT written; the user must reconnect or revert.
// CANV-10: Canvas can't gate every save when kernel is down — but destructive saves
// are too dangerous to allow without graph coverage.

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { createPatch } from 'diff';
import { ulid } from 'ulid';
import type { KernelClient } from '../kernel/client.js';
import type { CanvasPanel } from '../canvas/panel.js';
import { dispatchTier } from './tier-dispatch.js';
import { getCanvasModule } from './canvas-module.js';
import type { PendingAttemptsQueue, PendingAttemptRecord } from './pending-attempts.js';

export class SaveDeferredError extends Error {
	constructor(uri: string) {
		super(`GoatIDE: save deferred to Verification Canvas — ${uri}`);
		this.name = 'SaveDeferredError';
	}
}

/**
 * Wire the per-save Canvas gate. RESEARCH ## Pattern: Save Gate (Cancel-and-Redo) +
 * ## Pitfall 1: 1.5s budget is shared across listeners. We veto immediately + handle
 * the proposal asynchronously.
 *
 * Plan 04-06: extended signature with the PendingAttemptsQueue so the kernel-degraded
 * fork can append Attempt records when the kernel is unreachable.
 */
export function registerSaveGate(
	ctx: vscode.ExtensionContext,
	kernel: KernelClient,
	panel: CanvasPanel,
	queue: PendingAttemptsQueue,
): vscode.Disposable {
	const sub = vscode.workspace.onWillSaveTextDocument(async (event) => {
		if (event.reason !== vscode.TextDocumentSaveReason.Manual) {
			return;   // skip auto-save / format-on-save (data-integrity carveout)
		}
		const doc = event.document;

		// Capture the original (on-disk) content + the in-memory modified content BEFORE we veto.
		// readFile is fast (single file, small); does not blow the 1.5s budget.
		let original: string;
		try {
			const buf = await fsp.readFile(doc.uri.fsPath, 'utf8');
			original = buf;
		} catch {
			original = '';   // new file
		}
		const modified = doc.getText();

		// Veto the save. The handler runs asynchronously in the background.
		event.waitUntil(Promise.reject(new SaveDeferredError(doc.uri.toString())));
		void handleProposedSave(kernel, panel, doc, original, modified, queue);
	});
	ctx.subscriptions.push(sub);
	return sub;
}

async function handleProposedSave(
	kernel: KernelClient,
	panel: CanvasPanel,
	doc: vscode.TextDocument,
	original: string,
	modified: string,
	queue: PendingAttemptsQueue,
): Promise<void> {
	if (!kernel.isConnected()) {
		// Plan 04-06: kernel-degraded fork (CANV-10). Forks BEFORE classifyTier because
		// kernel.proposeEdit is unavailable in this state — we can't classify a tier
		// without a receipt + citationDetails.
		await handleKernelDegradedSave(doc, original, modified, queue);
		return;
	}
	const diff = createPatch(doc.uri.fsPath, original, modified, '', '');

	// Phase 7 Plan 07-05 (DRIFT-02): read goatide.session.priority from VS Code config and
	// thread it through kernel.proposeEdit. The kernel runs evaluateIntentDrift over the
	// rendered receipt and decorates citations with intent_drift_badge for cited
	// DecisionNodes whose derived_under_priority does NOT exact-match this value.
	// Default 'Quality-First' is the most-conservative canonical priority (Pitfall 5).
	const sessionPriority = vscode.workspace
		.getConfiguration('goatide')
		.get<string>('session.priority', 'Quality-First');

	let proposeResult;
	try {
		proposeResult = await kernel.proposeEdit({
			diff,
			destructive: false,
			asOf: new Date().toISOString(),
			session_priority: sessionPriority,
		});
	} catch (e) {
		console.error('[goatide-bridge] proposeEdit failed', e);
		return;
	}

	const receipt = proposeResult.receipt;

	// Phase 7 Plan 07-07 — Run the drift detector + lock detector against the proposed diff
	// between proposeEdit and tier-dispatch. The result feeds CanvasShowPayload + classifyTier:
	//   - drift_findings.length > 0 → escalate from silent to inline (don't demote modal).
	//   - lock_trigger !== null → force modal tier.
	//
	// Best-effort: a failure here logs and falls through with empty drift / null lock so the
	// receipt-only flow still proceeds. The calibration intent (DRIFT-01 + DRIFT-03 are
	// surfacing layers, not gates) is honored.
	let driftFindings: import('../kernel/methods.js').DriftFinding[] = [];
	let lockTrigger: import('../kernel/methods.js').LockTrigger | null = null;
	try {
		const driftLockResult = await kernel.runDriftAndLock({
			diff,
			asOf: receipt.graph_snapshot_tx_time ?? new Date().toISOString(),
		});
		driftFindings = driftLockResult.drift_findings;
		lockTrigger = driftLockResult.lock_trigger;
	} catch (e) {
		console.error('[goatide-bridge] runDriftAndLock failed (continuing with empty findings)', e);
	}

	const startMs = Date.now();
	await dispatchTier({
		kernel,
		panel,
		doc,
		original,
		modified,
		diff,
		receipt,
		startMs,
		driftFindings,
		lockTrigger,
	});
}

/**
 * CANV-10 kernel-degraded save path. Exported for direct testability without a real
 * vscode.workspace.onWillSaveTextDocument event source.
 *
 * Behavior:
 *   - Compute diff via createPatch.
 *   - Call detectDestructive(diff, anchorPath) from kernel/dist/canvas (dynamic import).
 *   - destructive=true: refuse with vscode.window.showErrorMessage + Reconnect button.
 *     File is NOT written; queue is NOT touched. Returns 'blocked'.
 *   - destructive=false: write file directly via fs.writeFileSync; append a
 *     PendingAttemptRecord with tier 'kernel_degraded'. Returns 'queued'.
 */
export async function handleKernelDegradedSave(
	doc: { uri: { fsPath: string; toString: () => string } },
	original: string,
	modified: string,
	queue: PendingAttemptsQueue,
): Promise<'queued' | 'blocked'> {
	const filePath = doc.uri.fsPath;
	const diff = createPatch(filePath, original, modified, '', '');
	const canvasMod = await getCanvasModule();

	if (canvasMod.detectDestructive(diff, filePath)) {
		// CANV-10: destructive blocked under degraded.
		void (async () => {
			const sel = await vscode.window.showErrorMessage(
				`GoatIDE: destructive save blocked because kernel sidecar is unreachable. Reconnect or revert your changes.`,
				'Reconnect',
			);
			if (sel === 'Reconnect') {
				try {
					await vscode.commands.executeCommand('goatide.kernel.reconnect');
				} catch (e) {
					console.error('[goatide-bridge] reconnect command failed', e);
				}
			}
		})();
		return 'blocked';
	}

	// Non-destructive: write file directly + queue an Attempt of tier 'kernel_degraded'.
	fs.writeFileSync(filePath, modified, 'utf8');
	const record: PendingAttemptRecord = {
		staging_path: null,
		target_path: filePath,
		change_id: ulid(),
		receipt_id: null,
		tier: 'kernel_degraded',
		accept_latency_ms: 0,
		body: `kernel-degraded save of ${filePath}`,
		anchor: { file: filePath },
		queued_at: new Date().toISOString(),
	};
	await queue.appendAttempt(record);
	return 'queued';
}
