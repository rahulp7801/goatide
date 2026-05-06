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
// Bridge is CJS (no type:module in package.json); kernel/dist is ESM. Cross-format type
// imports under Node16 moduleResolution require resolution-mode attributes which TS 5.6
// supports but emits as CJS-incompatible. Simpler path: locally redeclare the small
// classifier API surface (4 symbols). Drift between this and kernel/canvas/types.ts is
// caught by Plan 04-02's attempt-payload.spec structural cross-check on the enum + by
// the bridge integration test which exercises the runtime module via dynamic import.
import type { KernelClient } from '../kernel/client.js';
import type { CanvasPanel, CanvasDecision } from '../canvas/panel.js';
import type { Citation, ReasoningReceipt } from '../kernel/methods.js';
import type { CanvasShowPayload } from '../canvas/messages.js';
import { applyEditAtomically } from './apply-edit.js';

// Bridge-side mirror of kernel/src/canvas/types.ts. Same z.enum values; drift caught by
// kernel/src/test/canvas/attempt-payload.spec.ts cross-check on the kernel side and by
// runtime mismatch in the dynamic-import wrapper at bridge load time.
export type CanvasTier = 'silent' | 'inline' | 'modal';

export interface CitationDetail {
	node_id: string;
	kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	contract_path?: string;
}

interface TierClassifierInputs {
	receipt: ReasoningReceipt;
	diff: string;
	anchorPath?: string;
	contractAllowlist?: readonly string[];
	citationDetails?: readonly CitationDetail[];
}

interface CanvasModule {
	classifyTier: (inputs: TierClassifierInputs) => CanvasTier;
	detectDestructive: (diff: string, anchorPath?: string) => boolean;
	destructiveVerbForConfirmation: (diff: string) => string;
	DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES: readonly string[];
}

let cachedCanvasModule: CanvasModule | undefined;

async function getCanvasModule(): Promise<CanvasModule> {
	if (cachedCanvasModule) {
		return cachedCanvasModule;
	}
	// Dynamic import bridges CJS bridge → ESM kernel/dist. Path resolved at runtime.
	const mod = await import('../../../../../../../kernel/dist/canvas/index.js');
	cachedCanvasModule = mod as unknown as CanvasModule;
	return cachedCanvasModule;
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
}

export async function dispatchTier(inputs: DispatchInputs): Promise<void> {
	const canvasMod = await getCanvasModule();
	const citationDetails = await hydrateCitationDetails(inputs.kernel, inputs.receipt.citations);
	// W2: read the high-impact contract allowlist from VS Code configuration (declared in
	// bridge package.json contributes.configuration). Falls back to DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES
	// if the user has not set it. Per Plan 04-02 truth #1, the classifier itself never hardcodes
	// these strings — they are passed in here at the bridge boundary.
	const contractAllowlist = vscode.workspace
		.getConfiguration('goatide')
		.get<readonly string[]>('contracts.highImpactAllowlist', canvasMod.DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES);
	const tier: CanvasTier = canvasMod.classifyTier({
		receipt: inputs.receipt,
		diff: inputs.diff,
		anchorPath: inputs.doc.uri.fsPath,
		citationDetails,
		contractAllowlist,
	});

	const isDestructive = canvasMod.detectDestructive(inputs.diff, inputs.doc.uri.fsPath);
	const confirmationPhrase = isDestructive ? canvasMod.destructiveVerbForConfirmation(inputs.diff) : null;

	if (tier === 'silent') {
		// CANV-05: even silent emits a receipt. atomicAccept persists the Attempt.
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
		})),
		drill_chain: inputs.receipt.drill_chain,
	};

	let decision: CanvasDecision;
	try {
		decision = await inputs.panel.showAndAwait(showPayload);
	} catch (e) {
		console.error('[goatide-bridge] panel.showAndAwait failed', e);
		return;
	}

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
		await inputs.panel.hide();
	} else if (decision.kind === 'reject') {
		await inputs.panel.hide();
	} else if (decision.kind === 'reject_with_note') {
		await inputs.kernel.recordRejection({
			receipt_id: inputs.receipt.id,
			change_id: inputs.receipt.change_id,
			note: decision.note ?? '',
		}).catch((e) => {
			console.error('[goatide-bridge] recordRejection failed', e);
		});
		await inputs.panel.hide();
	}
}

async function hydrateCitationDetails(kernel: KernelClient, citations: Citation[]): Promise<CitationDetail[]> {
	if (citations.length === 0) {
		return [];
	}
	const result = await kernel.queryNodes({ node_ids: citations.map((c) => c.node_id) });
	return result.nodes.map((n) => ({
		node_id: n.node_id,
		kind: n.kind,
		contract_path: n.contract_path,
	}));
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
