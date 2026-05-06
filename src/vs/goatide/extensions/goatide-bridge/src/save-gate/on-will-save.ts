/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge save-gate listener — Plan 04-05.
//
// Wires vscode.workspace.onWillSaveTextDocument with cancel-then-redo (RESEARCH
// ## Pattern: Save Gate + ## Pitfall 1: 1.5s budget). The handler vetoes the save
// IMMEDIATELY (synchronous) and runs the proposal flow asynchronously OUTSIDE the
// budget. Non-Manual save reasons (auto-save, format-on-save) are skipped so we
// don't block data-integrity flushes.

import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { createPatch } from 'diff';
import type { KernelClient } from '../kernel/client.js';
import type { CanvasPanel } from '../canvas/panel.js';
import { dispatchTier } from './tier-dispatch.js';

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
 */
export function registerSaveGate(
	ctx: vscode.ExtensionContext,
	kernel: KernelClient,
	panel: CanvasPanel,
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
			const buf = await fs.readFile(doc.uri.fsPath, 'utf8');
			original = buf;
		} catch {
			original = '';   // new file
		}
		const modified = doc.getText();

		// Veto the save. The handler runs asynchronously in the background.
		event.waitUntil(Promise.reject(new SaveDeferredError(doc.uri.toString())));
		void handleProposedSave(kernel, panel, doc, original, modified);
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
): Promise<void> {
	if (!kernel.isConnected()) {
		// Plan 04-06 owns the kernel-degraded path. For Plan 04-05 we skip silently and let the user
		// know via the status-bar banner Plan 04-06 wires.
		return;
	}
	const diff = createPatch(doc.uri.fsPath, original, modified, '', '');

	let proposeResult;
	try {
		proposeResult = await kernel.proposeEdit({
			diff,
			destructive: false,
			asOf: new Date().toISOString(),
		});
	} catch (e) {
		console.error('[goatide-bridge] proposeEdit failed', e);
		return;
	}

	const receipt = proposeResult.receipt;
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
	});
}
