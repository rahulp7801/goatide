/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 12 Plan 12-03 — GREEN assertion for the canvas-panel recreation guard.
//
// CONTEXT.md decision: Wave-3 single-launch failure is rooted in the panel-hide-vs-dispose
// asymmetry across accept/reject branches in tier-dispatch.ts:382/384/393. Plan 12-03 H1
// switches reject branches from `panel.hide()` to `panel.dispose()` so the iframe tears down
// cleanly; CanvasPanel.getOrCreate(context) at extension.ts:98 then re-establishes a fresh,
// non-disposed panel on the next save invocation.
//
// This test is the bridge-side unit assertion that pins the recreate-after-dispose invariant.
// It exercises the real CanvasPanel.getOrCreate→dispose→getOrCreate round-trip with a
// stubbed vscode.window.createWebviewPanel; the round-trip MUST yield a fresh, distinct
// CanvasPanel instance.

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CanvasPanel } from '../../src/canvas/panel.js';

// Minimal vscode.WebviewPanel surface that CanvasPanel touches in the getOrCreate +
// dispose paths. The constructor calls panel.webview.html = buildHtml() (so html must be
// a writable property), HostRpc.subscribe() registers panel.webview.onDidReceiveMessage,
// and CanvasPanel.onDidDispose fires when fakePanel.dispose() is invoked.
interface FakeWebviewPanel {
	readonly webview: {
		html: string;
		cspSource: string;
		onDidReceiveMessage(listener: (e: unknown) => void): { dispose(): void };
		postMessage(_msg: unknown): Promise<boolean>;
		asWebviewUri(uri: { fsPath?: string; toString(): string }): { toString(): string };
	};
	readonly disposed: { value: boolean };
	dispose(): void;
	onDidDispose(listener: () => void): { dispose(): void };
	reveal(_column?: number, _preserveFocus?: boolean): void;
}

function makeFakeWebviewPanel(): FakeWebviewPanel {
	const disposeListeners = new Set<() => void>();
	const messageListeners = new Set<(e: unknown) => void>();
	const disposed = { value: false };
	const liveWebview = {
		html: '',
		cspSource: 'vscode-webview://stub',
		onDidReceiveMessage(listener: (e: unknown) => void): { dispose(): void } {
			messageListeners.add(listener);
			return { dispose: () => messageListeners.delete(listener) };
		},
		async postMessage(_msg: unknown): Promise<boolean> {
			return true;
		},
		asWebviewUri(uri: { fsPath?: string; toString(): string }): { toString(): string } {
			return { toString: () => uri.toString() };
		},
	};
	// Mirror real VS Code's post-disposal semantics: `panel.webview` throws once the
	// underlying WebviewPanel has been disposed. CanvasPanel.isDisposed relies on this
	// (it wraps `void panel.webview` in a try/catch); without this fidelity the recreate
	// path can't be exercised.
	const fake = {
		get webview(): typeof liveWebview {
			if (disposed.value) {
				throw new Error('Webview is disposed');
			}
			return liveWebview;
		},
		disposed,
		dispose(): void {
			if (disposed.value) {
				return;
			}
			disposed.value = true;
			for (const listener of disposeListeners) {
				try { listener(); } catch { /* best-effort */ }
			}
			disposeListeners.clear();
			messageListeners.clear();
		},
		onDidDispose(listener: () => void): { dispose(): void } {
			disposeListeners.add(listener);
			return { dispose: () => disposeListeners.delete(listener) };
		},
		reveal(_column?: number, _preserveFocus?: boolean): void {
			// no-op; getOrCreate doesn't reveal, showAndAwait does (not exercised here).
		},
	};
	return fake as FakeWebviewPanel;
}

// The bridge package root; CanvasPanel.buildHtml reads dist/canvas/index.html under
// context.extensionUri.fsPath. Tests run under `<bridge>/scripts/run-mocha-electron.cjs`,
// so __dirname here is `<bridge>/test/unit`; two `..` walks back to the bridge root where
// the dist/ directory built by `npm run build` lives.
const BRIDGE_ROOT = path.resolve(__dirname, '..', '..');

function makeFakeExtensionContext(): vscode.ExtensionContext {
	const subscriptions: { dispose(): void }[] = [];
	const ctx = {
		subscriptions,
		extensionUri: {
			fsPath: BRIDGE_ROOT,
			toString(): string { return BRIDGE_ROOT; },
		},
	};
	return ctx as unknown as vscode.ExtensionContext;
}

interface VscodeWindowWritable {
	createWebviewPanel: typeof vscode.window.createWebviewPanel;
}

const createdPanels: FakeWebviewPanel[] = [];
let originalCreateWebviewPanel: typeof vscode.window.createWebviewPanel | undefined;

describe('panel', () => {
	before(() => {
		const windowWritable = vscode.window as unknown as VscodeWindowWritable;
		originalCreateWebviewPanel = windowWritable.createWebviewPanel;
		windowWritable.createWebviewPanel = ((..._args: unknown[]) => {
			const fake = makeFakeWebviewPanel();
			createdPanels.push(fake);
			return fake;
		}) as unknown as typeof vscode.window.createWebviewPanel;
	});

	after(() => {
		if (originalCreateWebviewPanel !== undefined) {
			(vscode.window as unknown as VscodeWindowWritable).createWebviewPanel = originalCreateWebviewPanel;
		}
	});

	it('getOrCreate-after-dispose-reject yields fresh, non-disposed panel', () => {
		// 12-03-03 — round-trip assertion. Pins the invariant Plan 12-03 H1 relies on:
		// tier-dispatch.ts reject branches calling panel.dispose() must still yield a
		// fresh non-disposed CanvasPanel on the next getOrCreate (the extension.ts:98
		// path), so subsequent saves are not blocked by a dead reference.
		createdPanels.length = 0;
		const context = makeFakeExtensionContext();

		const firstPanel = CanvasPanel.getOrCreate(context);
		assert.strictEqual(createdPanels.length, 1, 'first getOrCreate must create a fresh webview panel');
		const firstUnderlying = createdPanels[0];

		firstPanel.dispose();

		const secondPanel = CanvasPanel.getOrCreate(context);
		assert.strictEqual(createdPanels.length, 2, 'second getOrCreate must create a fresh webview panel (not reuse the disposed one)');
		const secondUnderlying = createdPanels[1];

		assert.deepStrictEqual({
			sameInstance: firstPanel === secondPanel,
			firstUnderlyingDisposed: firstUnderlying.disposed.value,
			secondUnderlyingDisposed: secondUnderlying.disposed.value,
			secondUnderlyingIsDistinct: firstUnderlying !== secondUnderlying,
		}, {
			sameInstance: false,
			firstUnderlyingDisposed: true,
			secondUnderlyingDisposed: false,
			secondUnderlyingIsDistinct: true,
		});

		// Clean up: dispose the second panel so the test leaves no residual CanvasPanel.instance.
		secondPanel.dispose();
	});
});
