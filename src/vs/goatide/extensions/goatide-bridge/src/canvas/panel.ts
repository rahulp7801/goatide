/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/panel.ts - Phase 4 (Plan 04-03) shared CanvasPanel manager.
//
// Per RESEARCH ## Pattern 1: single shared panel per workspace; retainContextWhenHidden=true.
// Per RESEARCH ## Pattern 2: HostRpc owns the trust boundary; we subscribe to typed messages.
// Per RESEARCH ## Anti-Patterns: enableCommandUris=false.

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { HostRpc } from './rpc.js';
import type { CanvasShowPayload, WebviewToHost } from './messages.js';

export interface CanvasDecision {
	kind: 'accept' | 'reject' | 'reject_with_note';
	change_id: string;
	accept_latency_ms?: number;
	note?: string;
}

/**
 * Phase 7 Plan 07-07 — Override handler callback signature. tier-dispatch.ts registers a
 * callback via panel.registerOverrideHandler on construction; panel.ts forwards
 * 'record_override' webview messages into this callback. The callback validates note >=1
 * char, invokes kernel.recordContractOverride, applies the file write atomically, and
 * returns the result back to panel.ts which posts it as record_override.response.
 *
 * Option A (B6 resolution): tier-dispatch.ts is the SOLE caller of
 * kernel.recordContractOverride. panel.ts is a transport-layer pass-through; it does NOT
 * call the kernel directly. refuse-silent-override.sh allowlists kernel/src/drift/ +
 * bridge/src/save-gate/ to enforce this boundary.
 */
export interface OverrideHandlerPayload {
	change_id: string;
	contract_node_id: string;
	section_name: string;
	note: string;
}

export interface OverrideHandlerResult {
	ok: boolean;
	attempt_node_id?: string;
	error?: string;
}

export type OverrideHandler = (payload: OverrideHandlerPayload) => Promise<OverrideHandlerResult>;

const VIEW_TYPE = 'goatide.canvas';

/**
 * Shared CanvasPanel - one webview panel per workspace, reused across saves.
 */
export class CanvasPanel {
	private static instance: CanvasPanel | undefined;

	private rpc: HostRpc;
	private pendingResolve?: (decision: CanvasDecision) => void;
	private pendingReject?: (e: Error) => void;
	private explainHandler?: (node_id: string) => void;
	// Phase 7 Plan 07-07 — Override handler callback registered by tier-dispatch.ts.
	// When a 'record_override' webview message arrives, panel.ts invokes this callback
	// (Option A: save-gate-owned override path). panel.ts does NOT call kernel directly.
	private overrideHandler?: OverrideHandler;
	private readonly subDisposable: vscode.Disposable;
	private readonly disposeDisposable: vscode.Disposable;

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly extensionUri: vscode.Uri,
	) {
		this.rpc = new HostRpc(panel);
		this.subDisposable = this.rpc.subscribe((msg) => this.handleMessage(msg));
		this.disposeDisposable = this.panel.onDidDispose(() => {
			CanvasPanel.instance = undefined;
			this.cleanup();
		});
		this.panel.webview.html = this.buildHtml();
	}

	static getOrCreate(context: vscode.ExtensionContext): CanvasPanel {
		if (CanvasPanel.instance && !CanvasPanel.isDisposed(CanvasPanel.instance.panel)) {
			return CanvasPanel.instance;
		}
		// Plan 12-03 H2: ViewColumn.Active (not Beside). `Beside` creates a new editor group
		// adjacent to the active one; over a multi-wave ceremony this accumulates editor groups
		// and breaks active-editor detection in Wave-3. `Active` keeps the canvas in the same
		// group as the just-modified file, avoiding focus accumulation. See 12-RESEARCH.md
		// "Per-Issue Current-State Verification 12-03" for the empirical fix rationale.
		const panel = vscode.window.createWebviewPanel(
			VIEW_TYPE,
			'GoatIDE Verification Canvas',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				enableCommandUris: false,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'dist', 'canvas'),
					vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
				],
			},
		);
		CanvasPanel.instance = new CanvasPanel(panel, context.extensionUri);
		return CanvasPanel.instance;
	}

	private static isDisposed(panel: vscode.WebviewPanel): boolean {
		try {
			// Probing: accessing webview when disposed throws on some VS Code builds.
			void panel.webview;
			return false;
		} catch {
			return true;
		}
	}

	/** Set the citation.explain handler (Plan 04-04 wires kernel.explainCitation). */
	onCitationExplain(handler: (node_id: string) => void): void {
		this.explainHandler = handler;
	}

	/**
	 * Phase 7 Plan 07-07 — Register the override handler callback. tier-dispatch.ts calls
	 * this on construction; panel.ts forwards 'record_override' webview messages into the
	 * callback (Option A: save-gate-owned override path). The callback's result is posted
	 * back to the webview as 'record_override.response'.
	 *
	 * panel.ts does NOT call kernel.recordContractOverride directly; the audit-trail RPC
	 * lives in tier-dispatch.ts so refuse-silent-override.sh's allowlist
	 * (kernel/src/drift/ + bridge/src/save-gate/) covers the override path.
	 */
	registerOverrideHandler(handler: OverrideHandler): void {
		this.overrideHandler = handler;
	}

	/**
	 * Phase 7 Plan 07-07 — Post the compliance_report.partial or compliance_report.full
	 * message to the webview. tier-dispatch.ts uses these to feed the progressive-disclosure
	 * stream from kernel.runRippleProgressive (notification + final RPC response).
	 */
	postComplianceReportPartial(report: import('./messages.js').ComplianceReportForCanvas): Thenable<boolean> {
		return this.rpc.postRaw({ type: 'compliance_report.partial', payload: { report } });
	}

	postComplianceReportFull(report: import('./messages.js').ComplianceReportForCanvas): Thenable<boolean> {
		return this.rpc.postRaw({ type: 'compliance_report.full', payload: { report } });
	}

	/** Show the canvas + wait for a decision from the developer. */
	async showAndAwait(payload: CanvasShowPayload, options?: { timeoutMs?: number }): Promise<CanvasDecision> {
		const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;  // 10 min default
		// Plan 12-03 H2: reveal in ViewColumn.Active (paired with createWebviewPanel above).
		this.panel.reveal(vscode.ViewColumn.Active, false);
		await this.rpc.show(payload);
		return new Promise<CanvasDecision>((resolve, reject) => {
			const t = setTimeout(() => {
				this.pendingResolve = undefined;
				this.pendingReject = undefined;
				reject(new Error('CanvasPanel.showAndAwait: timeout'));
			}, timeoutMs);
			this.pendingResolve = (d) => { clearTimeout(t); resolve(d); };
			this.pendingReject = (e) => { clearTimeout(t); reject(e); };
		});
	}

	/** Hide the canvas (after accept/reject). */
	hide(): Thenable<boolean> {
		return this.rpc.hide();
	}

	/** Notify the webview the kernel is degraded. */
	notifyDegraded(reason: string): Thenable<boolean> {
		return this.rpc.notifyDegraded(reason);
	}

	dispose(): void {
		this.cleanup();
		this.panel.dispose();
	}

	private cleanup(): void {
		try { this.subDisposable.dispose(); } catch { /* best-effort */ }
		try { this.disposeDisposable.dispose(); } catch { /* best-effort */ }
		this.rpc.dispose();
		if (this.pendingReject) {
			this.pendingReject(new Error('CanvasPanel disposed before decision'));
			this.pendingResolve = undefined;
			this.pendingReject = undefined;
		}
	}

	private handleMessage(msg: WebviewToHost): void {
		if (msg.type === 'citation.explain') {
			this.explainHandler?.(msg.payload.citation_node_id);
			return;
		}
		if (msg.type === 'reveal_line') {
			// Phase 7 Plan 07-07 — DriftFindings click-to-jump-to-line. Open the file at the
			// requested line. Best-effort: failures are logged but do not propagate.
			void (async () => {
				try {
					const uri = vscode.Uri.file(msg.payload.file);
					const doc = await vscode.workspace.openTextDocument(uri);
					const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
					const line = Math.max(0, msg.payload.line - 1);
					const range = new vscode.Range(line, 0, line, 0);
					editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
					editor.selection = new vscode.Selection(range.start, range.end);
				} catch (e) {
					console.error('[goatide-bridge] reveal_line failed', e);
				}
			})();
			return;
		}
		if (msg.type === 'record_override') {
			// Phase 7 Plan 07-07 — Forward to tier-dispatch.ts via the registered callback
			// (Option A: save-gate-owned override path). panel.ts does NOT call kernel directly.
			void (async () => {
				if (!this.overrideHandler) {
					await this.rpc.postRaw({
						type: 'record_override.response',
						payload: { ok: false, error: 'override handler not registered (save-gate not active)' },
					});
					return;
				}
				const result = await this.overrideHandler({
					change_id: msg.payload.change_id,
					contract_node_id: msg.payload.contract_node_id,
					section_name: msg.payload.section_name,
					note: msg.payload.note,
				});
				await this.rpc.postRaw({
					type: 'record_override.response',
					payload: result,
				});
				// On success, also resolve the pending decision so the modal closes.
				if (result.ok && this.pendingResolve) {
					this.pendingResolve({
						kind: 'accept',
						change_id: msg.payload.change_id,
						accept_latency_ms: 0,
					});
					this.pendingResolve = undefined;
					this.pendingReject = undefined;
				}
			})();
			return;
		}
		if (!this.pendingResolve) {
			return;   // stale message after the promise already resolved
		}
		if (msg.type === 'canvas.accept') {
			this.pendingResolve({
				kind: 'accept',
				change_id: msg.payload.change_id,
				accept_latency_ms: msg.payload.accept_latency_ms,
			});
		} else if (msg.type === 'canvas.reject') {
			this.pendingResolve({ kind: 'reject', change_id: msg.payload.change_id });
		} else if (msg.type === 'canvas.reject_with_note') {
			this.pendingResolve({
				kind: 'reject_with_note',
				change_id: msg.payload.change_id,
				note: msg.payload.note,
			});
		}
		this.pendingResolve = undefined;
		this.pendingReject = undefined;
	}

	private buildHtml(): string {
		const htmlPath = path.join(this.extensionUri.fsPath, 'dist', 'canvas', 'index.html');
		// In dev, the html may live at src/canvas/webview/index.html; copied to dist by esbuild
		// (esbuild.config.mjs has a fs.copyFileSync step after build).
		let template: string;
		try {
			template = fs.readFileSync(htmlPath, 'utf8');
		} catch {
			// Fallback: read from source path (build hasn't run).
			template = fs.readFileSync(
				path.join(this.extensionUri.fsPath, 'src', 'canvas', 'webview', 'index.html'),
				'utf8',
			);
		}
		const nonce = crypto.randomBytes(16).toString('base64').replace(/\W/g, '').slice(0, 32);
		const cspSource = this.panel.webview.cspSource;
		const indexJsUri = this.panel.webview
			.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'canvas', 'index.js'))
			.toString();
		// Substitute placeholders. The HTML uses ${webview.cspSource}/index.js for the script src;
		// we replace that prefix with the asWebviewUri-converted URL (which already contains cspSource).
		return template
			.replaceAll('${nonce}', nonce)
			.replaceAll('${webview.cspSource}/index.js', indexJsUri)
			.replaceAll('${webview.cspSource}', cspSource);
	}
}
