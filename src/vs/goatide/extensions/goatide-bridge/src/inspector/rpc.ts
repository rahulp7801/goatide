/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/rpc.ts —
// Phase 15 Plan 15-03 (Wave-2 — DEEP-02 host wiring) typed RPC transports for the inspector.
//
// Mirrors canvas/rpc.ts pattern verbatim; kept separate per Phase 15 RESEARCH Open Decision 6
// (do not factor). Phase 14 precedent: panel.ts panel-local handler registration (Plan 14-02
// registerRationaleHandler) lives inside the panel module; the transport is a thin Zod-
// validated wrapper over panel.webview.postMessage / webview.onDidReceiveMessage.
//
// Two classes — HostRpc lives in extension host (Node context); WebviewRpc lives in the
// bundled webview script. Both validate inbound messages via the Zod schemas in messages.ts.
//
// Mandate B fence: this file imports ReadonlyKernelClient nowhere; the kernel-talking side
// of the inspector is in panel.ts (which imports the readonly Pick<>). The RPC transport is
// the wire — render is webview-only.

import type * as vscode from 'vscode';
import {
	InspectorHostToWebviewSchema,
	InspectorWebviewToHostSchema,
	type InspectorHostToWebview,
	type InspectorWebviewToHost,
} from './messages.js';

// =========================================================
// HostRpc - runs in the extension host (Node context).
// =========================================================

export type InspectorWebviewToHostHandler = (msg: InspectorWebviewToHost) => void;

export class HostRpc {
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly panel: vscode.WebviewPanel) { }

	/** Subscribe to inbound webview messages. The handler receives Zod-validated typed messages. */
	subscribe(handler: InspectorWebviewToHostHandler): vscode.Disposable {
		const sub = this.panel.webview.onDidReceiveMessage((raw: unknown) => {
			const parsed = InspectorWebviewToHostSchema.safeParse(raw);
			if (!parsed.success) {
				console.error('[goatide-bridge] inspector HostRpc: dropping invalid webview message', parsed.error.flatten());
				return;
			}
			handler(parsed.data);
		});
		this.disposables.push(sub);
		return sub;
	}

	/** Post a host-to-webview message. The host side is responsible for constructing a valid shape. */
	postRaw(msg: InspectorHostToWebview): Thenable<boolean> {
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

export type InspectorHostToWebviewHandler = (msg: InspectorHostToWebview) => void;

export class WebviewRpc {
	constructor(private readonly vscode: VsCodeApi) { }

	/** Subscribe to inbound host messages. The handler receives Zod-validated typed messages. */
	subscribe(handler: InspectorHostToWebviewHandler): () => void {
		const onMessage = (event: MessageEvent) => {
			const parsed = InspectorHostToWebviewSchema.safeParse(event.data);
			if (!parsed.success) {
				console.error('[goatide-inspector] WebviewRpc: dropping invalid host message', parsed.error.flatten());
				return;
			}
			handler(parsed.data);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}

	/** Webview React mount complete; host should respond with the initial inspector.show. */
	postReady(): void {
		const msg: InspectorWebviewToHost = { type: 'inspector.ready' };
		this.vscode.postMessage(msg);
	}

	/**
	 * Slider drag — request a snapshot at the given asOf. Pitfall 1 carry: the webview is the
	 * sole source of asOf for slider-driven requests (the host never substitutes a fresh
	 * timestamp). The webview obtains asOf from the transitions[] array delivered on the
	 * initial inspector.show; it never invokes new Date() to derive one.
	 */
	postRequestSnapshot(asOf: string): void {
		const msg: InspectorWebviewToHost = { type: 'inspector.requestSnapshot', asOf };
		this.vscode.postMessage(msg);
	}
}
