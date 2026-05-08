/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/canvas/rpc.ts — Phase 4 (Plan 04-03)
// Typed RPC wrappers over the postMessage boundary.
//
// Per 04-RESEARCH.md ## Pattern: Canvas State + Wire Schema, ## Don't Hand-Roll.
// Two classes - HostRpc lives in extension.ts context; WebviewRpc lives in the bundled
// webview script. Both validate inbound messages via the Zod schemas in messages.ts.

import * as vscode from 'vscode';
import {
	HostToWebviewSchema,
	WebviewToHostSchema,
	type HostToWebview,
	type WebviewToHost,
	type CanvasShowPayload,
} from './messages.js';

// =========================================================
// HostRpc - runs in the extension host (Node context).
// =========================================================

export type WebviewToHostHandler = (msg: WebviewToHost) => void;

export class HostRpc {
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly panel: vscode.WebviewPanel) { }

	/** Subscribe to inbound webview messages. The handler receives Zod-validated typed messages. */
	subscribe(handler: WebviewToHostHandler): vscode.Disposable {
		const sub = this.panel.webview.onDidReceiveMessage((raw: unknown) => {
			const parsed = WebviewToHostSchema.safeParse(raw);
			if (!parsed.success) {
				console.error('[goatide-bridge] HostRpc: dropping invalid webview message', parsed.error.flatten());
				return;
			}
			handler(parsed.data);
		});
		this.disposables.push(sub);
		return sub;
	}

	/** Show the canvas with a hydrated payload. */
	show(payload: CanvasShowPayload): Thenable<boolean> {
		const msg: HostToWebview = { type: 'canvas.show', payload };
		return this.panel.webview.postMessage(msg);
	}

	/** Hide the canvas (used after accept/reject). */
	hide(): Thenable<boolean> {
		const msg: HostToWebview = { type: 'canvas.hide' };
		return this.panel.webview.postMessage(msg);
	}

	/** Notify the webview the kernel is degraded (banner + degraded UI hint). */
	notifyDegraded(reason: string): Thenable<boolean> {
		const msg: HostToWebview = { type: 'kernel.degraded', payload: { reason } };
		return this.panel.webview.postMessage(msg);
	}

	/**
	 * Phase 7 Plan 07-07 — Post a raw HostToWebview message. Used by tier-dispatch.ts via
	 * panel.postComplianceReportPartial / postComplianceReportFull / record_override.response.
	 * Caller is responsible for constructing a discriminated-union-valid message; the
	 * webview side validates via Zod.
	 */
	postRaw(msg: HostToWebview): Thenable<boolean> {
		return this.panel.webview.postMessage(msg);
	}

	dispose(): void {
		for (const d of this.disposables) {
			try { d.dispose(); } catch { /* best-effort */ }
		}
	}
}

// =========================================================
// WebviewRpc - runs inside the bundled webview script.
// =========================================================

export interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

export type HostToWebviewHandler = (msg: HostToWebview) => void;

export class WebviewRpc {
	constructor(private readonly vscode: VsCodeApi) { }

	/** Subscribe to inbound host messages. The handler receives Zod-validated typed messages. */
	subscribe(handler: HostToWebviewHandler): () => void {
		const onMessage = (event: MessageEvent) => {
			const parsed = HostToWebviewSchema.safeParse(event.data);
			if (!parsed.success) {
				console.error('[goatide-canvas] WebviewRpc: dropping invalid host message', parsed.error.flatten());
				return;
			}
			handler(parsed.data);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}

	postAccept(change_id: string, accept_latency_ms: number): void {
		const msg: WebviewToHost = { type: 'canvas.accept', payload: { change_id, accept_latency_ms } };
		this.vscode.postMessage(msg);
	}
	postReject(change_id: string): void {
		const msg: WebviewToHost = { type: 'canvas.reject', payload: { change_id } };
		this.vscode.postMessage(msg);
	}
	postRejectWithNote(change_id: string, note: string): void {
		const msg: WebviewToHost = { type: 'canvas.reject_with_note', payload: { change_id, note } };
		this.vscode.postMessage(msg);
	}
	postCitationExplain(citation_node_id: string): void {
		const msg: WebviewToHost = { type: 'citation.explain', payload: { citation_node_id } };
		this.vscode.postMessage(msg);
	}
}
