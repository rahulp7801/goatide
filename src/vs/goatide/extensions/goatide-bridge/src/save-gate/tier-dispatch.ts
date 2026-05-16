/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge tier-dispatch — Plan 04-05.
//
// Receives a hydrated DispatchInputs (receipt + diff + doc + original/modified content)
// and routes the save through one of three tiers per the kernel/canvas/* classifier:
//   - silent: applyEdit directly; no UI
//   - inline: applyEdit IMMEDIATELY + non-blocking showInformationMessage toast (ROADMAP SC #4)
//   - modal: panel.showAndAwait blocking + Accept/Reject/Reject-with-Note dispatch
//
// The kernel/canvas/* tree (kernel/dist/canvas/index.js) is ESM; the bridge extension is CJS
// (no type:module in bridge package.json). We use a dynamic import() to bridge the ESM/CJS
// boundary at runtime. Types are imported via `import type` (erased at compile time so the
// CJS<->ESM interop check doesn't fire).
//
// At build time esbuild does NOT bundle this dynamic import (it remains a runtime resolve);
// VS Code's CJS extension host happily await-imports the ESM module. The path is fragile
// but stable as long as kernel/ stays workspaced under the fork.

import * as vscode from 'vscode';
// Plan 04-06: getCanvasModule + CanvasTier + CitationDetail are now in canvas-module.ts so
// on-will-save.ts can reuse the dynamic-import helper for the CANV-10 destructive-block
// check under degraded state.
import type { KernelClient } from '../kernel/client.js';
import type { CanvasPanel, CanvasDecision } from '../canvas/panel.js';
import type { Citation, ReasoningReceipt, DriftFinding, LockTrigger, ComplianceReport, IntentDriftBadge } from '../kernel/methods.js';
import type { CanvasShowPayload, ComplianceReportForCanvas, DriftFindingForCanvas, LockTriggerForCanvas } from '../canvas/messages.js';
import { applyEditAtomically } from './apply-edit.js';
import { getCanvasModule, type CanvasTier, type CitationDetail, type AnchorResultCacheLike } from './canvas-module.js';

// Re-export for consumers of tier-dispatch (Plan 04-05 had these as local types here).
export type { CanvasTier, CitationDetail };

// Module-scoped LRU+TTL cache for hydrateCitationDetails. One instance per extension host
// (singleton); not per-save. Per Phase-4 gap-closure W12 (04-VERIFICATION.md ## W12 Latency
// Gap), repeated saves of the same file inside a 60s window short-circuit kernel.queryNodes.
// EXACT-key match only (TRAV-06 / Mandate C) - no fuzzy / prefix fallback. The cache is
// allocated lazily once getCanvasModule() resolves, since AnchorResultCache lives in the
// dynamic-imported kernel/dist/canvas/index.js (CJS<->ESM bridge).
let citationCacheInstance: AnchorResultCacheLike | undefined;

async function getCitationCache(): Promise<AnchorResultCacheLike> {
	if (citationCacheInstance === undefined) {
		const mod = await getCanvasModule();
		citationCacheInstance = new mod.AnchorResultCache(); // defaults: 100 entries, 60_000 ms TTL
	}
	return citationCacheInstance;
}

export interface DispatchInputs {
	kernel: KernelClient;
	panel: CanvasPanel;
	doc: vscode.TextDocument;
	original: string;
	modified: string;
	diff: string;
	receipt: ReasoningReceipt;
	startMs: number;
	// Phase 7 Plan 07-07 — drift surface from kernel.runDriftAndLock. Both fields default
	// to empty/null when on-will-save's call failed; classifyTier escalation rules apply
	// only when populated.
	driftFindings?: DriftFinding[];
	lockTrigger?: LockTrigger | null;
}

/**
 * Phase 7 Plan 07-07 — Apply the additive escalation rules on top of the kernel-side
 * classifier:
 *   - lock_trigger !== null → force tier='modal' (parallel pin to detectDestructive).
 *   - drift_findings.length > 0 AND tier === 'silent' → escalate to 'inline' (don't demote
 *     a modal to inline; only escalate from silent).
 */
export function applyDriftEscalation(
	tier: CanvasTier,
	driftFindings: readonly DriftFinding[] | undefined,
	lockTrigger: LockTrigger | null | undefined,
): CanvasTier {
	if (lockTrigger !== null && lockTrigger !== undefined) {
		return 'modal';
	}
	if (driftFindings !== undefined && driftFindings.length > 0 && tier === 'silent') {
		return 'inline';
	}
	return tier;
}

function toCanvasComplianceReport(report: ComplianceReport): ComplianceReportForCanvas {
	return {
		contract_node_id: report.contract_node_id,
		max_hops: report.max_hops,
		definitely_affected: report.definitely_affected.map((r) => ({
			node_id: r.node_id,
			kind: r.kind,
			anchor_file: r.anchor_file,
			edge_path: r.edge_path,
			hops: r.hops,
			body_preview: r.body_preview,
		})),
		potentially_affected: report.potentially_affected.map((r) => ({
			node_id: r.node_id,
			kind: r.kind,
			anchor_file: r.anchor_file,
			edge_path: r.edge_path,
			hops: r.hops,
			body_preview: r.body_preview,
		})),
		truncated: report.truncated,
		generated_at: report.generated_at,
	};
}

function toCanvasDriftFinding(finding: DriftFinding): DriftFindingForCanvas {
	return {
		contract_node_id: finding.contract_node_id,
		contract_anchor_file: finding.contract_anchor_file,
		pattern_index: finding.pattern_index,
		pattern_kind: finding.pattern_kind,
		file: finding.file,
		hunk_line: finding.hunk_line,
		message: finding.message,
	};
}

function toCanvasLockTrigger(lock: LockTrigger): LockTriggerForCanvas {
	return {
		contract_node_id: lock.contract_node_id,
		contract_anchor_file: lock.contract_anchor_file,
		section_name: lock.section_name,
		edited_line_range: [lock.edited_line_range[0], lock.edited_line_range[1]],
		hunk_index: lock.hunk_index,
	};
}

/**
 * Phase 7 Plan 07-07 — Promise.race against a 50ms timeout for the first
 * graph.driftProgress notification. Returns the partial report on receipt OR null on
 * timeout. tier-dispatch uses this to avoid blocking dispatch on slow notifications:
 * the webview shows a spinner during Phase A; when the notification finally arrives the
 * partial is forwarded via panel.postComplianceReportPartial.
 */
const FIRST_NOTIFICATION_TIMEOUT_MS = 50;

async function awaitFirstDriftProgressOrTimeout(
	kernel: KernelClient,
	panel: CanvasPanel,
): Promise<{ partial: ComplianceReport | null; disposeListener: () => void }> {
	let resolved = false;
	let resolver: (partial: ComplianceReport | null) => void = () => undefined;
	const partialPromise = new Promise<ComplianceReport | null>((resolve) => {
		resolver = resolve;
	});
	const disposeListener = kernel.onDriftProgress((n) => {
		// Forward EVERY partial to the webview (panel posts compliance_report.partial).
		void panel.postComplianceReportPartial(toCanvasComplianceReport(n.partial));
		if (!resolved) {
			resolved = true;
			resolver(n.partial);
		}
	});
	const timeoutPromise = new Promise<null>((resolve) => {
		setTimeout(() => {
			if (!resolved) {
				resolved = true;
				resolve(null);
			}
		}, FIRST_NOTIFICATION_TIMEOUT_MS);
	});
	const partial = await Promise.race([partialPromise, timeoutPromise]);
	return { partial, disposeListener };
}

export async function dispatchTier(inputs: DispatchInputs): Promise<void> {
	const canvasMod = await getCanvasModule();
	const citationDetails = await hydrateCitationDetails(
		inputs.kernel,
		inputs.receipt.citations,
		inputs.doc.uri.fsPath,
		inputs.receipt.graph_snapshot_tx_time ?? new Date().toISOString(),
	);
	// W2: read the high-impact contract allowlist from VS Code configuration (declared in
	// bridge package.json contributes.configuration). Falls back to DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES
	// if the user has not set it. Per Plan 04-02 truth #1, the classifier itself never hardcodes
	// these strings — they are passed in here at the bridge boundary.
	const contractAllowlist = vscode.workspace
		.getConfiguration('goatide')
		.get<readonly string[]>('contracts.highImpactAllowlist', canvasMod.DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES);
	const baseTier: CanvasTier = canvasMod.classifyTier({
		receipt: inputs.receipt,
		diff: inputs.diff,
		anchorPath: inputs.doc.uri.fsPath,
		citationDetails,
		contractAllowlist,
	});
	// Phase 7 Plan 07-07 — Drift escalation rules. Lock forces modal; findings escalate
	// silent → inline. Modal stays modal regardless (no demotion).
	const tier: CanvasTier = applyDriftEscalation(baseTier, inputs.driftFindings, inputs.lockTrigger);

	// Phase 17 Plan 17-02 POLISH-02 — read per-workspace save-gate settings via the
	// resource-scoped overload so the user's per-folder override is honored. The 2nd
	// argument MUST be inputs.doc.uri (a vscode.Uri) — NOT a string, NOT undefined.
	// See PITFALLS.md Pitfall B + 17-RESEARCH.md section 3.
	const saveGateCfg = vscode.workspace.getConfiguration('goatide.saveGate', inputs.doc.uri);
	const destructiveSetting = saveGateCfg.get<'block' | 'confirm'>('destructive', 'confirm');
	const highImpactSetting = saveGateCfg.get<'block' | 'confirm' | 'suppress'>('highImpact', 'confirm');
	const benignSetting = saveGateCfg.get<'modal' | 'hover' | 'suppress'>('benign', 'modal');

	const isDestructive = canvasMod.detectDestructive(inputs.diff, inputs.doc.uri.fsPath);
	const confirmationPhrase = isDestructive ? canvasMod.destructiveVerbForConfirmation(inputs.diff) : null;

	// Phase 17 Plan 17-02 POLISH-04 — move showPayload construction UP so it is available for
	// both the hover dispatch path (silent-tier benignSetting==='hover') and the modal path.
	// For the silent tier, inputs.lockTrigger is always null/undefined (drift escalation
	// would have escalated to 'modal' if it were non-null), so initialComplianceReport will
	// be null when showPayload is used from the hover path.

	// Phase 16 Plan 16-03 (DEEP-03) — host-side button eligibility (Open Decision 7).
	const constraint_lift_eligible = citationDetails.some((d) => d.kind === 'ConstraintNode');

	// Phase 14 Plan 14-04 (DEEP-05) — read goatide.session.priority from VS Code config and
	// thread BOTH the raw value (session_priority) AND the user-visible indicator label
	// (session_priority_indicator) onto the payload.
	const sessionPriority = vscode.workspace
		.getConfiguration('goatide')
		.get<string>('session.priority', 'Quality-First');
	const sessionPriorityIndicator = `Filtered by session priority: ${sessionPriority}`;

	// initialComplianceReport is always null here; modal-tier sets it below after the silent
	// + inline early-return branches when lockTrigger fires.
	const showPayload: CanvasShowPayload = {
		change_id: inputs.receipt.change_id,
		tier,
		destructive: isDestructive,
		confirmation_phrase: confirmationPhrase,
		file_uri: inputs.doc.uri.fsPath,
		language: inputs.doc.languageId,
		original_content: inputs.original,
		modified_content: inputs.modified,
		citations: inputs.receipt.citations.map((c) => ({
			node_id: c.node_id,
			version: c.version,
			confidence: c.confidence,
			edge_path: c.edge_path,
			snippet: c.snippet,
			body_preview: deriveBodyPreview(citationDetails, c),
			successor_id: deriveSuccessorId(citationDetails, c),
			intent_drift_badge: (c as { intent_drift_badge?: IntentDriftBadge | null }).intent_drift_badge ?? null,
		})),
		drill_chain: inputs.receipt.drill_chain,
		// Phase 7 Plan 07-07 — drift fields. drift_findings always populated (may be empty);
		// compliance_report starts null here; modal-tier lockTrigger path patches it below.
		drift_findings: (inputs.driftFindings ?? []).map(toCanvasDriftFinding),
		compliance_report: null,
		lock_trigger: inputs.lockTrigger ? toCanvasLockTrigger(inputs.lockTrigger) : null,
		// Phase 14 Plan 14-04 (DEEP-05) — explicit session-priority surface for the webview.
		session_priority: sessionPriority,
		session_priority_indicator: sessionPriorityIndicator,
		graph_snapshot_tx_time: inputs.receipt.graph_snapshot_tx_time ?? null,
		// Phase 16 Plan 16-03 (DEEP-03) — host-side computed eligibility flag.
		constraint_lift_eligible,
	};

	// Phase 7 Plan 07-07 — Register the override handler with the panel BEFORE we show.
	// This callback is the SOLE path to kernel.recordContractOverride from the bridge
	// (Option A: save-gate-owned override path). refuse-silent-override.sh allowlists this
	// file (bridge/src/save-gate/) so the gate enforces the call site.
	inputs.panel.registerOverrideHandler(async (payload) => {
		if (!payload.note || payload.note.length < 1) {
			return { ok: false, error: 'note must be >=1 char' };
		}
		try {
			const { attempt_node_id } = await inputs.kernel.recordContractOverride({
				change_id: payload.change_id,
				contract_node_id: payload.contract_node_id,
				section_name: payload.section_name,
				note: payload.note,
			});
			// Apply the file write atomically (Plan 04-05 path) so the override is the
			// "accept this save" outcome — the developer chose to bypass the lock with a
			// written reason; the file should land on disk just like a modal-tier accept.
			await applyEditAtomically(inputs.kernel, {
				target_path: inputs.doc.uri.fsPath,
				new_content: inputs.modified,
				change_id: inputs.receipt.change_id,
				receipt_id: inputs.receipt.id,
				tier: 'modal',
				accept_latency_ms: Date.now() - inputs.startMs,
				body: `contract_override: ${payload.note}`,
				anchor: { file: inputs.doc.uri.fsPath },
			});
			return { ok: true, attempt_node_id };
		} catch (e) {
			return { ok: false, error: String((e as Error)?.message ?? e) };
		}
	});

	if (tier === 'silent') {
		// Phase 17 Plan 17-02 POLISH-02/04 — honor goatide.saveGate.benign setting.
		// Pitfall E defense: benignSetting is ONLY read here in the silent branch.
		// Modal-tier destructive branch reads ONLY destructiveSetting; modal-tier
		// high-impact branch reads ONLY highImpactSetting. No cross-reading.
		if (benignSetting === 'suppress') {
			// CANV-05: even silent emits a receipt. atomicAccept persists the Attempt.
			// Pre-Phase-17 behavior preserved verbatim when benignSetting === 'suppress'.
			await applyEditAtomically(inputs.kernel, {
				target_path: inputs.doc.uri.fsPath,
				new_content: inputs.modified,
				change_id: inputs.receipt.change_id,
				receipt_id: inputs.receipt.id,
				tier: 'silent',
				accept_latency_ms: 0,
				body: `silent save of ${inputs.doc.uri.fsPath}`,
				anchor: { file: inputs.doc.uri.fsPath },
			});
			return;
		}
		if (benignSetting === 'hover') {
			// POLISH-04 — compact hover dispatch. Mandate D fence: only reachable when
			// tier === 'silent'. Destructive/modal saves NEVER reach this branch.
			await dispatchHover(inputs, showPayload, citationDetails);
			return;
		}
		// benignSetting === 'modal' (default) — escalate silent tier to modal UI.
		// Fall through to modal path below (do NOT return here).
	}

	if (tier === 'inline') {
		// ROADMAP SC #4: "non-blocking inline prompt" for Inferred-unpromoted citations.
		//
		// Strategy: fire the applyEdit IMMEDIATELY (the save proceeds), then surface a
		// non-blocking informational toast via vscode.window.showInformationMessage with
		// Accept/Dismiss actions. We DO NOT await the toast - the Thenable resolves later
		// (or never if the user ignores it). If the user clicks Dismiss, fire-and-forget a
		// recordRejection of kind 'inline_dismiss' so the post-hoc rejection is captured.
		// If the user clicks Accept, the Attempt is already on the graph - the click is a
		// no-op on the current Attempt but logged for analytics.
		const attemptStartMs = Date.now();
		await applyEditAtomically(inputs.kernel, {
			target_path: inputs.doc.uri.fsPath,
			new_content: inputs.modified,
			change_id: inputs.receipt.change_id,
			receipt_id: inputs.receipt.id,
			tier: 'inline',
			accept_latency_ms: 0,    // user did not see a Canvas; latency is N/A
			body: `inline save of ${inputs.doc.uri.fsPath}`,
			anchor: { file: inputs.doc.uri.fsPath },
		});
		// Fire-and-forget the toast - DO NOT await; the function returns immediately so the
		// editor stays unblocked.
		void (async () => {
			const inferredCount = inputs.receipt.citations.filter((c) => c.confidence === 'Inferred').length;
			const summary = inferredCount === 1
				? 'GoatIDE: this save cited 1 Inferred rule. Open the Canvas to review.'
				: `GoatIDE: this save cited ${inferredCount} Inferred rules. Open the Canvas to review.`;
			const sel = await vscode.window.showInformationMessage(summary, 'Accept', 'Dismiss');
			if (sel === 'Dismiss') {
				try {
					await inputs.kernel.recordRejection({
						receipt_id: inputs.receipt.id,
						change_id: inputs.receipt.change_id,
						note: `inline_dismiss after ${Date.now() - attemptStartMs}ms (user dismissed the inline prompt; the file write already completed)`,
					});
				} catch (e) {
					console.error('[goatide-bridge] inline_dismiss recordRejection failed', e);
				}
			}
			// 'Accept' or undefined (user closed the toast): no-op; the Attempt is already recorded.
		})();
		return;
	}

	// modal tier — blocking dialog.
	// Phase 7 Plan 07-05 (DRIFT-02): when the kernel-side renderReceipt evaluator ran
	// (proposeEdit was called with session_priority), each receipt citation may carry an
	// intent_drift_badge. The bridge threads this field through into the CanvasShowPayload
	// so Plan 07-07's CitationList.tsx can render an icon + click-to-modal explanation.
	// Citations without the field (pre-Plan-07-05 receipts, or matching DecisionNodes)
	// pass through as undefined/null.

	// Phase 17 Plan 17-02 POLISH-02 — modal-tier composite branch on isDestructive.
	// CRITICAL ordering discipline (Pitfall E defense): destructive branch reads ONLY
	// destructiveSetting; high-impact branch reads ONLY highImpactSetting. NO cross-reading.
	if (isDestructive) {
		// ConfirmationPhrase modal path — gated by goatide.saveGate.destructive.
		// Enum is ['block', 'confirm'] ONLY — no 'suppress' (Mandate D).
		if (destructiveSetting === 'block') {
			void vscode.window.showErrorMessage(
				'GoatIDE: destructive save blocked per goatide.saveGate.destructive setting',
			);
			return;
		}
		// destructiveSetting === 'confirm' (default) — fall through to panel.showAndAwait below.
	} else {
		// Standard high-impact modal path — gated by goatide.saveGate.highImpact.
		if (highImpactSetting === 'block') {
			void vscode.window.showErrorMessage(
				'GoatIDE: high-impact save blocked per goatide.saveGate.highImpact setting',
			);
			return;
		}
		if (highImpactSetting === 'suppress') {
			// Silent accept — apply atomically without UI.
			await applyEditAtomically(inputs.kernel, {
				target_path: inputs.doc.uri.fsPath,
				new_content: inputs.modified,
				change_id: inputs.receipt.change_id,
				receipt_id: inputs.receipt.id,
				tier: 'modal',
				accept_latency_ms: 0,
				body: `highImpact-suppressed save of ${inputs.doc.uri.fsPath}`,
				anchor: { file: inputs.doc.uri.fsPath },
			});
			return;
		}
		// highImpactSetting === 'confirm' (default) — fall through to panel.showAndAwait below.
	}

	// Phase 7 Plan 07-07 — When lock fires, kick off runRippleProgressive in the background
	// + subscribe to graph.driftProgress notifications BEFORE showing the modal. The
	// Promise.race(notification, 50ms) pattern lets us either include the first-degree
	// partial in the initial CanvasShowPayload OR fall back to a loading-only initial
	// dispatch (the webview shows a spinner; the partial arrives via panel.postComplianceReportPartial).
	let initialComplianceReport: ComplianceReport | null = null;
	let progressiveDispose: (() => void) | undefined;
	if (inputs.lockTrigger !== null && inputs.lockTrigger !== undefined) {
		const lockTriggerNonNull = inputs.lockTrigger;
		const { partial, disposeListener } = await awaitFirstDriftProgressOrTimeout(inputs.kernel, inputs.panel);
		initialComplianceReport = partial;
		progressiveDispose = disposeListener;
		// Kick off the full runRippleProgressive call in the background. When it returns the
		// final report, post it as compliance_report.full so the webview merges deeper hops.
		void (async () => {
			try {
				const result = await inputs.kernel.runRippleProgressive({
					contract_node_id: lockTriggerNonNull.contract_node_id,
					asOf: inputs.receipt.graph_snapshot_tx_time ?? new Date().toISOString(),
				});
				await inputs.panel.postComplianceReportFull(toCanvasComplianceReport(result.report));
			} catch (e) {
				console.error('[goatide-bridge] runRippleProgressive failed', e);
			} finally {
				try { progressiveDispose?.(); } catch { /* ignore */ }
			}
		})();
	}

	// Update showPayload's compliance_report field now that lockTrigger async result is known.
	// showPayload was constructed early (before silent/inline branches) for the hover path;
	// now we patch in the real initialComplianceReport for the modal path.
	showPayload.compliance_report = initialComplianceReport !== null
		? toCanvasComplianceReport(initialComplianceReport)
		: null;

	let decision: CanvasDecision;
	try {
		decision = await inputs.panel.showAndAwait(showPayload);
	} catch (e) {
		console.error('[goatide-bridge] panel.showAndAwait failed', e);
		return;
	}

	// Plan 12-03 H1: switch accept/reject/reject_with_note branches from `panel.hide()` to
	// `panel.dispose()`. `hide()` only posts a `canvas.hide` message while the iframe stays
	// in the DOM under `retainContextWhenHidden: true`; across a multi-wave ceremony this
	// accumulates undisposed Verification Canvas tabs which break Wave-3 active-editor
	// detection. `dispose()` tears down the webview cleanly; CanvasPanel.getOrCreate
	// recreates a fresh panel on the next save (DEFERRED-11-01-A panel-recreate guard
	// landed in commit c8f34eb4ada; panel-recreate.test.ts pins the invariant). Note:
	// CanvasPanel.dispose() is synchronous (returns void); awaiting a non-Promise is a
	// no-op so the surrounding async/await call shape stays intact for diff minimality.
	if (decision.kind === 'accept') {
		await applyEditAtomically(inputs.kernel, {
			target_path: inputs.doc.uri.fsPath,
			new_content: inputs.modified,
			change_id: inputs.receipt.change_id,
			receipt_id: inputs.receipt.id,
			tier,
			accept_latency_ms: decision.accept_latency_ms ?? Date.now() - inputs.startMs,
			body: `accepted ${tier} save of ${inputs.doc.uri.fsPath}`,
			anchor: { file: inputs.doc.uri.fsPath },
		});
		await inputs.panel.dispose();
	} else if (decision.kind === 'reject') {
		await inputs.panel.dispose();
	} else if (decision.kind === 'reject_with_note') {
		await inputs.kernel.recordRejection({
			receipt_id: inputs.receipt.id,
			change_id: inputs.receipt.change_id,
			note: decision.note ?? '',
		}).catch((e) => {
			console.error('[goatide-bridge] recordRejection failed', e);
		});
		await inputs.panel.dispose();
	}
}

// Phase 17 Plan 17-02 POLISH-04 — compact hover dispatch for benign-tier saves.
//
// Mandate D fence: this function is ONLY invoked from dispatchTier's silent-tier
// branch when (tier === 'silent' AND isDestructive === false AND benignSetting === 'hover').
// Modal-tier saves (both ConfirmationPhrase and standard high-impact) NEVER route
// through this function regardless of benignSetting value. The inline-tier branch
// also never routes here (it preserves its Phase 7 Plan 07-07 behavior). The
// structural fence is in test/unit/save-gate/mandate-d-destructive-no-hover.test.ts
// (4x3 (tier, isDestructive) x benignSetting matrix byte-identity assertion + caller-count
// grep gate locked at 2 [1 declaration + 1 caller]).
async function dispatchHover(
	inputs: DispatchInputs,
	showPayload: CanvasShowPayload,
	citationDetails: readonly CitationDetail[],
): Promise<void> {
	// Step 1: apply atomically — same path as current silent branch.
	// Attempt recorded with tier: 'silent'.
	await applyEditAtomically(inputs.kernel, {
		target_path: inputs.doc.uri.fsPath,
		new_content: inputs.modified,
		change_id: inputs.receipt.change_id,
		receipt_id: inputs.receipt.id,
		tier: 'silent',
		accept_latency_ms: 0,
		body: `hover-silent save of ${inputs.doc.uri.fsPath}`,
		anchor: { file: inputs.doc.uri.fsPath },
	});

	// Step 2: top-2 citation labels (short — node_id last 6 chars fallback when no label).
	const top2 = citationDetails.slice(0, 2).map(c => (c as unknown as { label?: string }).label ?? c.node_id.slice(-6)).join(', ');

	// Step 3: ephemeral status-bar message (auto-dismiss after 4s). ASCII hyphen (not
	// em-dash) per N5 — Windows terminal/hook encoding safety.
	vscode.window.setStatusBarMessage(`GoatIDE: benign save - top 2 citations: ${top2}`, 4000);

	// Step 4: non-blocking info notification with Open-full-receipt action.
	const choice = await vscode.window.showInformationMessage(
		'GoatIDE: benign save accepted',
		'Open full receipt',
	);
	if (choice === 'Open full receipt') {
		// Fallback: same modal path the user would have seen at benignSetting === 'modal'.
		// NOTE: the write has ALREADY happened in Step 1; this modal is informational.
		// If the user clicks 'Reject' in the modal, that would record a post-hoc rejection
		// analogous to the inline-tier Dismiss path (tier-dispatch.ts lines ~358-369). For v2.0
		// simplicity, we drop the modal's decision: the file is already on disk and the
		// hover-tier semantics treat the save as accepted regardless. Future v2.1 may
		// surface 'Reject' here as a recordRejection equivalent; out of scope for Phase 17.
		try {
			await inputs.panel.showAndAwait(showPayload);
		} catch (e) {
			console.error('[goatide-bridge] hover Open-full-receipt modal failed', e);
		}
	}
	// Function returns void — consistent with dispatchTier signature.
}

async function hydrateCitationDetails(
	kernel: KernelClient,
	citations: Citation[],
	anchorPath: string,
	asOf: string,
): Promise<readonly CitationDetail[]> {
	if (citations.length === 0) {
		return [];
	}
	// Plan 04-08 (W12): consult the module-scoped AnchorResultCache before issuing the RPC.
	// EXACT-key match only - the cache is keyed on (anchorPath, asOf) and the asOf advances
	// after every DAO supersede() / seed(), so stale entries are unreachable by construction.
	const cache = await getCitationCache();
	const cacheKey = `${anchorPath}|${asOf}`;
	const cached = cache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}
	const result = await kernel.queryNodes({ node_ids: citations.map((c) => c.node_id) });
	const details: readonly CitationDetail[] = result.nodes.map((n) => ({
		node_id: n.node_id,
		kind: n.kind,
		contract_path: n.contract_path,
	}));
	cache.set(cacheKey, details);
	return details;
}

function deriveBodyPreview(_details: readonly CitationDetail[], citation: Citation): string {
	// citationDetails is the slim CitationDetail (kind + contract_path) — body lives on the
	// queryNodes response which we don't thread through citationDetails. v1 falls back to the
	// citation snippet from the receipt (REC-04 already trimmed it). Plan 04-06+ may extend
	// CitationDetail to include body for richer previews.
	return (citation.snippet ?? '').slice(0, 280);
}

function deriveSuccessorId(_details: readonly CitationDetail[], _citation: Citation): string | null {
	// kernel.queryNodes returns successor_id alongside; the type was widened above. Re-pull.
	// For Plan 04-05 v1, successor_id comes from queryNodes payload; a richer hydrator is
	// defensible. v1 returns null and lets render.ts on the kernel side own the badge.
	return null;
}
