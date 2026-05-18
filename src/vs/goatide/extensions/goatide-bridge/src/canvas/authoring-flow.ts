/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 20 Plan 20-03 AUTH-01 -- DecisionNode authoring multi-step flow.
//
// Mandate A invariant: the rationale textarea (showInputBox) is opened with opts.value === ''.
// Pre-population from kernel data OR any language-model source is FORBIDDEN -- see the
// refuse-llm-in-canvas meta-test (widened in Plan 20-01 to scan this file's host-side
// canvas/ scope). The banned-token list is enforced at the fence; this comment intentionally
// avoids the literal banned token so the fence reports a clean tree.
//
// Mandate B fence: this file lives in canvas/, NOT in inspector/. The refuse-deep05-write
// gate scans inspector/ only. Plan 20-01 added 'createDecisionNode' to the BANNED array
// BEFORE this file was authored -- the fence-before-surface pattern.
//
// Per OQ#3 (research): constraint-link picker DEFERRED to v2.2 (would enumerate all
// ConstraintNodes -- slow at scale; out of v2.1 scope).
// Per OQ#4 (research): anchor auto-populated from prefilledAnchorPath OR activeTextEditor;
// NO new CanvasShowPayload.anchor_path field added.
// Per OQ#5 (research): QuickPick chain (NOT WebviewPanel form -- defer to v2.2).
//
// The flow is a QuickPick chain (NOT a webview) so the host stays simple + Mandate-A-safe
// by default. Future v2.2 may upgrade to a WebviewPanel form; if so, the new webview will
// land in canvas/webview/ where it's automatically covered by the existing fence.

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { KernelClient } from '../kernel/client.js';
import type { CanvasPanel } from './panel.js';

export interface RunAddDecisionNodeFlowOptions {
	/** When invoked from the Verification Canvas empty-state CTA, the active file's path. */
	prefilledAnchorPath?: string;
}

export async function runAddDecisionNodeFlow(
	_context: vscode.ExtensionContext,
	kernel: KernelClient,
	_panel: CanvasPanel,
	opts?: RunAddDecisionNodeFlowOptions,
): Promise<void> {
	// Step 1 -- Anchor selection.
	// v2.1 scope: file + optional line number. Symbol/ticket pickers deferred to v2.2.
	const anchorFile = await pickAnchorFile(opts?.prefilledAnchorPath);
	if (!anchorFile) {
		return;  // user cancelled OR no candidates
	}

	// Step 2 -- Rationale text FIRST (Mandate A: opts.value MUST be '').
	// Ordering note: rationale is collected BEFORE the optional line number so the
	// required-field UX is up-front and the cancellation short-circuits before any
	// optional input prompts the user. Plan 20-01 happy-path test contract assumes this
	// order (inputResponses[0] = rationale, inputResponses[1] = optional line).
	const rationale = await vscode.window.showInputBox({
		prompt: 'What is the rationale for this DecisionNode?',
		placeHolder: 'Describe the decision and its reasoning. Required.',
		value: '',                          // Mandate A: empty string, never pre-populated.
		ignoreFocusOut: true,
		validateInput: (text) => text.trim().length === 0 ? 'Rationale is required.' : null,
	});
	if (!rationale || rationale.trim().length === 0) {
		return;  // user cancelled or empty
	}

	// Step 3 -- Optional line number (anchorLine may be undefined).
	const anchorLine = await pickOptionalLineNumber(anchorFile);

	// Step 4 -- Optional priority context (skip-able).
	const sessionPriority = vscode.workspace
		.getConfiguration('goatide')
		.get<string>('session.priority', 'Quality-First');
	const usePriority = await vscode.window.showInformationMessage(
		`Tag this DecisionNode with session priority "${sessionPriority}"?`,
		{ modal: true },
		'Yes', 'No (omit)',
	);
	const derivedUnderPriority = usePriority === 'Yes' ? sessionPriority : undefined;

	// Step 5 -- Confirmation.
	const confirmed = await vscode.window.showInformationMessage(
		`Create DecisionNode anchored to ${path.basename(anchorFile)}${anchorLine ? `:${anchorLine}` : ''}?`,
		{ modal: true },
		'Create',
	);
	if (confirmed !== 'Create') {
		return;
	}

	// Step 6 -- Write via kernel.createDecisionNode (Plan 20-02 Wave-1 RPC).
	try {
		const result = await kernel.createDecisionNode({
			body: rationale,
			anchor: { file: anchorFile, line: anchorLine },
			derived_under_priority: derivedUnderPriority,
			repo_id: 'primary',         // Phase 21 XREPO-01 will activate WorkspaceRepoState lookup
		});
		const last6 = result.node_id.slice(-6);
		void vscode.window.showInformationMessage(
			`GoatIDE: DecisionNode ${last6} created. It will appear as a citation on your next save of ${path.basename(anchorFile)}.`,
		);
	} catch (e) {
		void vscode.window.showErrorMessage(
			'GoatIDE: createDecisionNode failed -- ' + (e instanceof Error ? e.message : String(e)),
		);
	}
}

async function pickAnchorFile(prefilled?: string): Promise<string | undefined> {
	const activeEditorFile = vscode.window.activeTextEditor?.document.uri.fsPath;
	const candidates = new Set<string>();
	if (prefilled) { candidates.add(prefilled); }
	if (activeEditorFile) { candidates.add(activeEditorFile); }
	// (v2.1: extend candidates with workspace.findFiles if needed. Default: active editor only.)
	const items = Array.from(candidates).map((f) => ({ label: path.basename(f), description: f, fsPath: f }));
	if (items.length === 0) {
		void vscode.window.showWarningMessage('GoatIDE: open a file first; the DecisionNode needs an anchor.');
		return undefined;
	}
	if (items.length === 1) {
		return items[0].fsPath;        // auto-select when only one candidate (Code Example 2 line 509-511)
	}
	const pick = await vscode.window.showQuickPick(items, {
		title: 'Anchor file for this DecisionNode',
		ignoreFocusOut: true,
	});
	return pick?.fsPath;
}

async function pickOptionalLineNumber(file: string): Promise<number | undefined> {
	const editor = vscode.window.activeTextEditor;
	const currentLine = editor && editor.document.uri.fsPath === file
		? editor.selection.active.line + 1
		: undefined;
	const input = await vscode.window.showInputBox({
		prompt: 'Optional line number (leave empty to anchor at file scope)',
		placeHolder: currentLine ? `Default: cursor line ${currentLine}` : 'e.g. 42',
		value: '',                       // Mandate A: never pre-populated.
		ignoreFocusOut: true,
		validateInput: (text) => {
			if (text === '') { return null; }    // empty is valid
			const n = Number.parseInt(text, 10);
			return Number.isFinite(n) && n >= 1 ? null : 'Must be a positive integer or empty.';
		},
	});
	if (input === undefined) { return undefined; }   // user cancelled
	if (input === '') { return currentLine; }       // default to cursor line if active
	return Number.parseInt(input, 10);
}
