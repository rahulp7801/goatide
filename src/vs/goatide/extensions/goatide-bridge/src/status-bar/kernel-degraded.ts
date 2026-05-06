/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge KernelDegradedBanner — Plan 04-06.
//
// Status-bar banner that mirrors the kernel ConnectionStateMachine. Hidden when state.kind
// === 'connected'; visible (with errorBackground) when degraded; visible (with
// warningBackground) when reconnecting.
//
// Click target: the goatide.kernel.reconnect command (registered by extension.ts). The
// banner does NOT own the reconnect logic — it just surfaces state + invites the user
// to retry via the command.
//
// RESEARCH 04-RESEARCH.md ## Pattern: Kernel-Degraded Mode + ## Code Examples — Status bar item.

import * as vscode from 'vscode';
import type { ConnectionStateMachine, ConnectionState } from '../kernel/connection-state.js';

export class KernelDegradedBanner implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly stateSub: vscode.Disposable;

	constructor(state: ConnectionStateMachine) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.item.command = 'goatide.kernel.reconnect';
		this.render(state.current);
		this.stateSub = state.onDidChangeState((s) => this.render(s));
	}

	private render(state: ConnectionState): void {
		switch (state.kind) {
			case 'connected':
				this.item.hide();
				return;
			case 'degraded': {
				this.item.text = `$(warning) GoatIDE kernel degraded (${state.reason})`;
				this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
				this.item.tooltip = 'Kernel sidecar unreachable. Click to reconnect.';
				this.item.show();
				return;
			}
			case 'reconnecting': {
				this.item.text = `$(sync~spin) GoatIDE kernel reconnecting (attempt ${state.attempt})`;
				this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
				this.item.tooltip = `Reconnecting; next retry in ${Math.round(state.nextRetryMs / 1000)}s`;
				this.item.show();
				return;
			}
			case 'connecting': {
				this.item.text = `$(sync~spin) GoatIDE kernel connecting`;
				this.item.backgroundColor = undefined;
				this.item.tooltip = 'Initial kernel connection in progress.';
				this.item.show();
				return;
			}
		}
	}

	dispose(): void {
		try { this.stateSub.dispose(); } catch { /* best-effort */ }
		try { this.item.dispose(); } catch { /* best-effort */ }
	}
}
