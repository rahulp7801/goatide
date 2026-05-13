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
import { getCanvasModule, getCanvasModuleSync } from './canvas-module.js';
import type { PendingAttemptsQueue, PendingAttemptRecord } from './pending-attempts.js';

/**
 * Phase 12 Plan 12-01 (CONTEXT.md Option B): synchronous high-impact-contract detection
 * for the onWillSaveTextDocument listener.
 *
 * The listener body must call `event.waitUntil(...)` synchronously per VS Code's
 * save-participant contract — `await` inside the listener body is forbidden. We can't
 * call `kernel.queryNodes(...)` to hydrate citation details + run the kernel-side
 * citesHighImpactContract predicate from a sync context. Instead, we match the
 * workspace-settings `goatide.contracts.highImpactAllowlist` substrings against the
 * file's fsPath directly — the same workspace-settings allowlist that
 * tier-dispatch.ts:188 reads via vscode.workspace.getConfiguration. This mirrors the
 * post-DEFERRED-11-01-A pattern: substring containment over normalized paths
 * (backslashes folded to forward slashes; rooted-with-`/`).
 *
 * This is a SOUND OVER-APPROXIMATION: any file whose path matches the allowlist is
 * gated, even if the actual save doesn't cite any high-impact ContractNode. That is the
 * intent — the bridge can't tell synchronously if the proposed save cites a high-impact
 * contract (citations come from the kernel-side proposeEdit receipt, which is async).
 * Routing all saves against high-impact paths to the canvas is the same trade-off Plan
 * 04-08 baked into the AnchorResultCache's 60s TTL.
 */
function normalizeForMatch(p: string): string {
	const slashed = p.replace(/\\/g, '/');
	return slashed.startsWith('/') ? slashed : `/${slashed}`;
}

function citesHighImpactPath(fsPath: string, allowlist: readonly string[]): boolean {
	if (allowlist.length === 0) {
		return false;
	}
	const normalized = normalizeForMatch(fsPath);
	return allowlist.some((entry) => normalized.includes(normalizeForMatch(entry)));
}

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
	getPanel: () => CanvasPanel,
	queue: PendingAttemptsQueue,
): vscode.Disposable {
	const sub = vscode.workspace.onWillSaveTextDocument((event) => {
		// DEFERRED-11-01-A diagnostic: log every fire so we can verify the listener is
		// actually subscribed when Wave-3 saves in a full sweep. This will be useful
		// permanently — save-gate silent-failures are the worst kind of bug to debug.
		console.log('[goatide-bridge] onWillSaveTextDocument reason=' + event.reason + ' uri=' + event.document.uri.fsPath);

		const doc = event.document;
		// Capture modified content synchronously (in-memory; cheap).
		const modified = doc.getText();

		// Phase 12 Plan 12-01 (CONTEXT.md Option B): close the P0 auto-save bypass at
		// on-will-save.ts:60-65 (pre-Plan-12-01). Previously the listener unconditionally
		// early-returned on `event.reason !== Manual`, which let destructive content
		// (`DROP TABLE x`) and high-impact-contract saves reach disk under
		// `files.autoSave: afterDelay` / `onFocusChange` without ever showing the
		// ConfirmationPhrase modal. TextDocumentSaveReason has only 3 values:
		// Manual=1, AfterDelay=2, FocusOut=3 (per vscode.d.ts:13472-13489 — there is no
		// format-on-save / shutdown reason, despite the misleading pre-Plan-12-01 comment).
		//
		// New gate semantics:
		//   - reason === Manual                              → ALWAYS fall through to the
		//                                                       proposal flow (preserve the
		//                                                       Phase-4 baseline; pinned by
		//                                                       the Task 12-01-04 regression
		//                                                       fence in save-gate-auto-save.test.ts).
		//   - reason !== Manual AND destructive content      → gate (block disk write).
		//   - reason !== Manual AND high-impact-citation     → gate (block disk write).
		//   - reason !== Manual AND silent-tier (trivial)    → early-return (preserve
		//                                                       auto-save UX — CONTEXT.md
		//                                                       Option B trade-off).
		//
		// Synchronous classification is required because event.waitUntil(...) must be called
		// within the synchronous listener body (extHostDocumentSaveParticipant.ts:111-131 —
		// the promises array is frozen AFTER the synchronous listener call). We use:
		//   1. getCanvasModuleSync() to call the kernel-side detectDestructive(diff, fsPath)
		//      on a synthetic "all-added" diff. The module is pre-warmed during activate()
		//      (extension.ts: `await getCanvasModule()` before `registerSaveGate`).
		//   2. citesHighImpactPath() — substring match of the workspace-settings
		//      `goatide.contracts.highImpactAllowlist` against doc.uri.fsPath. This is the
		//      same allowlist tier-dispatch.ts:188 reads when running the kernel-side
		//      classifyTier post-receipt. The sync version is a sound over-approximation:
		//      saves against any file matching the allowlist gate even if the proposed save
		//      wouldn't actually cite a high-impact ContractNode.
		//
		// Defense-in-depth: handleProposedSave still runs the FULL kernel-side detection
		// (proposeEdit receipt + classifyTier) on every save that reaches it. The
		// sync-classification step here only gates non-Manual saves; it never DEMOTES the
		// existing Manual path.
		const isManual = event.reason === vscode.TextDocumentSaveReason.Manual;
		let isDestructive = false;
		let citesHighImpact = false;
		if (!isManual) {
			const canvasMod = getCanvasModuleSync();
			if (canvasMod !== undefined) {
				// Build a synthetic "all-added" unified diff against an empty original — the
				// kernel's destructive regexes (DESTRUCTIVE_DIFF_PATTERNS) anchor on /^[+-]/
				// per-line, so feeding every line of `modified` prefixed with `+` triggers a
				// match if any added line is destructive. detectDestructive also checks the
				// fsPath against DESTRUCTIVE_PATH_PATTERNS (.env, /migrations/...).
				const syntheticDiff = createPatch(doc.uri.fsPath, '', modified, '', '');
				isDestructive = canvasMod.detectDestructive(syntheticDiff, doc.uri.fsPath);
			}
			// Read the workspace-settings allowlist via the same key tier-dispatch.ts uses.
			// Fall back to kernel-side DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES if the module is
			// pre-warmed; otherwise leave the allowlist empty (cite-high-impact check no-ops).
			const defaultAllowlist = canvasMod?.DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES ?? [];
			const allowlist = vscode.workspace
				.getConfiguration('goatide')
				.get<readonly string[]>('contracts.highImpactAllowlist', defaultAllowlist);
			citesHighImpact = citesHighImpactPath(doc.uri.fsPath, allowlist);
		}
		if (!isManual && !isDestructive && !citesHighImpact) {
			console.log('[goatide-bridge]   skipping non-Manual silent-tier save (destructive=false highImpact=false)');
			return;   // CONTEXT.md Option B: preserve auto-save UX for trivial saves.
		}
		if (!isManual) {
			console.log('[goatide-bridge]   gating non-Manual save (destructive=' + isDestructive + ' highImpact=' + citesHighImpact + ')');
		}

		// 13-02 CLOSE-02 badListeners fix: VS Code's extHostDocumentSaveParticipant.ts tracks
		// error counts per listener in a `_badListeners` WeakMap (threshold: errors: 3).
		// When `event.waitUntil(Promise.reject(...))` is called, the participant's promise
		// rejects, which counts as an error. After 4 total errors the listener is permanently
		// IGNORED for subsequent saves in the same extension host session — exactly what
		// happens after settings.json + login.ts × 2 + migration.ts (4 saves) when running
		// the full --waves 0,1,2,3,4 ceremony: the 5th save (auth-security.md) bypasses the
		// listener entirely, onWillSaveTextDocument never fires, and the canvas is never shown.
		//
		// Fix: call `event.waitUntil(Promise.resolve())` so the participant succeeds every
		// time (no error, no badListeners increment). The file IS written to disk — this was
		// already the case with Promise.reject (textFileSaveParticipant.ts:69 catches the
		// listener-failed error and continues the save rather than cancelling it). The canvas
		// still appears because handleProposedSave runs in the fire-and-forget IIFE regardless
		// of whether the file write was "vetoed" or not. Accept → atomic apply writes file
		// again (idempotent). Reject → caller restores original content if needed.
		//
		// Plan 12-02's rationale (avoid 1750ms budget stall) is preserved: waitUntil() is
		// still called synchronously with a pre-constructed promise (now resolving instead of
		// rejecting). The heavy work (readFile + handleProposedSave) still runs in the
		// fire-and-forget IIFE that the listener does NOT await.
		event.waitUntil(Promise.resolve());

		// Fire-and-forget: readFile + handleProposedSave run AFTER the listener returns and
		// AFTER the vetoPromise has already rejected. The IIFE catches its own errors so an
		// exception inside readFile / handleProposedSave does NOT become an unhandled promise
		// rejection (extHostDocumentSaveParticipant has no reporter for it — it'd surface as
		// `(node:###) UnhandledPromiseRejectionWarning` in the extension-host log only).
		void (async () => {
			let original: string;
			try {
				original = await fsp.readFile(doc.uri.fsPath, 'utf8');
			} catch {
				original = '';   // new file
			}
			try {
				await handleProposedSave(kernel, getPanel(), doc, original, modified, queue);
			} catch (err) {
				console.error('[goatide-bridge] handleProposedSave failed', err);
			}
		})();
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
	console.log('[goatide-bridge]   handleProposedSave fsPath=' + doc.uri.fsPath + ' diff.length=' + diff.length);

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
		console.log('[goatide-bridge]   runDriftAndLock fsPath=' + doc.uri.fsPath + ' drift_findings.length=' + driftFindings.length + ' lock_trigger=' + (lockTrigger ? 'set' : 'null'));
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
