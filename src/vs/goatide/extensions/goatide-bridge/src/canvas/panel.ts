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
		const panel = vscode.window.createWebviewPanel(
			VIEW_TYPE,
			'GoatIDE Verification Canvas',
			vscode.ViewColumn.Beside,
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

	/** Show the canvas + wait for a decision from the developer. */
	async showAndAwait(payload: CanvasShowPayload, options?: { timeoutMs?: number }): Promise<CanvasDecision> {
		const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;  // 10 min default
		this.panel.reveal(vscode.ViewColumn.Beside, false);
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
