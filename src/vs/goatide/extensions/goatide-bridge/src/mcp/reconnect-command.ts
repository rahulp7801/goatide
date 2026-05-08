/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/mcp/reconnect-command.ts
//
// Phase 6 Plan 06-06 — registers `goatide.mcp.reconnect`, a command-palette-reachable entry
// point that lets the developer reconnect a single MCP provider without waiting for the
// LivenessBanner to surface a stale entry. Mirrors the Phase-4 `goatide.kernel.reconnect`
// command pattern but scoped to the per-provider mcp.reconnectProvider RPC.
//
// The four MCP providers are fixed (github / slack / linear / jira); the command surfaces a
// quickPick of all four (not just the stale ones — the developer may want to bounce a
// healthy provider after rotating tokens). Selecting one calls kernel.mcpReconnectProvider.

import * as vscode from 'vscode';
import type { McpProviderNameWire } from '../kernel/methods.js';

const RECONNECT_COMMAND = 'goatide.mcp.reconnect';
const ALL_PROVIDERS: readonly McpProviderNameWire[] = ['github', 'slack', 'linear', 'jira'];

export interface ReconnectKernelClient {
	mcpReconnectProvider: (params: { provider: McpProviderNameWire }) => Promise<{ reconnected: boolean }>;
}

/**
 * Show the provider quickPick + drive the reconnect RPC. Exposed for tests so they can
 * trigger the action without simulating a command-palette invocation.
 */
export async function runMcpReconnectCommand(kernel: ReconnectKernelClient): Promise<void> {
	const items = ALL_PROVIDERS.map((p) => ({ label: p, provider: p }));
	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: 'Reconnect MCP provider',
	});
	if (!picked) {
		return;
	}
	try {
		const result = await kernel.mcpReconnectProvider({ provider: picked.provider });
		if (result.reconnected) {
			await vscode.window.showInformationMessage(`GoatIDE: reconnected MCP provider ${picked.provider}.`);
		} else {
			await vscode.window.showWarningMessage(`GoatIDE: MCP provider ${picked.provider} did not reconnect.`);
		}
	} catch (err) {
		await vscode.window.showErrorMessage(`GoatIDE: reconnect MCP ${picked.provider} failed — ${err instanceof Error ? err.message : String(err)}`);
	}
}

/**
 * Register the `goatide.mcp.reconnect` command on the extension subscriptions. Disposed
 * automatically on extension deactivate.
 */
export function registerMcpReconnectCommand(
	ctx: vscode.ExtensionContext,
	kernel: ReconnectKernelClient,
): void {
	const sub = vscode.commands.registerCommand(RECONNECT_COMMAND, () => runMcpReconnectCommand(kernel));
	ctx.subscriptions.push(sub);
}
