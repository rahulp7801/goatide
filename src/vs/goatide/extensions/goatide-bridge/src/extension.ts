// src/vs/goatide/extensions/goatide-bridge/src/extension.ts — Phase-1 stub
// Per STATE.md ## Decisions: the bridge extension is the IPC partner for the
// kernel sidecar. Phase 1 has no IPC yet — activate() resolves immediately to
// prove the extension loads. Phase 4 (Verification Canvas) replaces this with
// the per-save hook + kernel JSON-RPC client.

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): Thenable<void> {
	console.log('[goatide-bridge] activate (Phase-1 stub)');
	context.subscriptions.push(
		new vscode.Disposable(() => console.log('[goatide-bridge] dispose'))
	);
	return Promise.resolve();
}

export function deactivate(): Thenable<void> {
	console.log('[goatide-bridge] deactivate');
	return Promise.resolve();
}
