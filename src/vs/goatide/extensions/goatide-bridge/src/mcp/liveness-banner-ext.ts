/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/mcp/liveness-banner-ext.ts
//
// Phase 6 Plan 06-06 — MCP-06 LivenessBanner extension for the 4 mcp.<provider> sources.
//
// The Phase-5 LivenessBanner (harvester/liveness-banner.ts) already polls
// kernel.harvesterGetLiveness, which (Plan 06-06 Task 1) now returns 4 additional sources:
//   mcp.github, mcp.slack, mcp.linear, mcp.jira
//
// Those entries flow through the existing banner without modification — the banner already
// renders errorBackground when >=2 sources are stale. What this module adds:
//
//   - A separate `goatide.mcp.showStaleProviders` command that filters the latest liveness
//     report to mcp.* entries and presents a quickPick offering "Reconnect MCP <provider>"
//     actions per stale provider. Reconnect calls kernel.mcpReconnectProvider.
//
// The banner's own click target remains `goatide.harvester.showStaleSources` (which lists
// ALL stale sources, including mcp.*). The new command is a focused MCP-only entry point
// reachable from the command palette + (when reconnect-command.ts wires it in) from the
// reconnect-provider quick-pick.

import * as vscode from 'vscode';
import type { McpProviderNameWire } from '../kernel/methods.js';

const MCP_SOURCE_PREFIX = 'mcp.';
const SHOW_STALE_MCP_COMMAND = 'goatide.mcp.showStaleProviders';

export interface McpLivenessReport {
	source: string;
	stale: boolean;
	silent_for_ms: number;
	threshold_ms: number;
	last_observation_iso?: string;
}

export interface McpLivenessKernelClient {
	harvesterGetLiveness: () => Promise<{ sources: McpLivenessReport[] }>;
	mcpReconnectProvider: (params: { provider: McpProviderNameWire }) => Promise<{ reconnected: boolean }>;
}

/**
 * Returns true iff source is a 4-tuple mcp.<provider> liveness key.
 */
export function isMcpLivenessSource(source: string): boolean {
	if (!source.startsWith(MCP_SOURCE_PREFIX)) {
		return false;
	}
	const provider = source.slice(MCP_SOURCE_PREFIX.length);
	return provider === 'github' || provider === 'slack' || provider === 'linear' || provider === 'jira';
}

/**
 * Extract the provider name from an mcp.<provider> source key. Returns null when source
 * is not an mcp.* key.
 */
export function providerNameFromSource(source: string): McpProviderNameWire | null {
	if (!isMcpLivenessSource(source)) {
		return null;
	}
	return source.slice(MCP_SOURCE_PREFIX.length) as McpProviderNameWire;
}

/**
 * Filter a liveness report to just the mcp.<provider> entries. Used by the banner's
 * extension hook + tests.
 */
export function filterMcpLivenessEntries(sources: readonly McpLivenessReport[]): McpLivenessReport[] {
	return sources.filter((s) => isMcpLivenessSource(s.source));
}

/**
 * Show a quickPick listing currently-stale mcp.<provider> sources. Selecting one calls
 * kernel.mcpReconnectProvider; bypass + cancel are silent.
 */
export async function showStaleMcpProvidersQuickPick(
	kernel: McpLivenessKernelClient,
): Promise<void> {
	let report: { sources: McpLivenessReport[] };
	try {
		report = await kernel.harvesterGetLiveness();
	} catch (err) {
		console.error('[goatide-bridge] mcp showStaleProviders: harvesterGetLiveness failed', err);
		await vscode.window.showErrorMessage(`GoatIDE: failed to fetch MCP liveness — ${err instanceof Error ? err.message : String(err)}`);
		return;
	}
	const stale = filterMcpLivenessEntries(report.sources).filter((s) => s.stale);
	if (stale.length === 0) {
		await vscode.window.showInformationMessage('GoatIDE: no MCP providers are stale.');
		return;
	}
	const items = stale
		.slice()
		.sort((a, b) => a.source.localeCompare(b.source))
		.map((s) => {
			const provider = providerNameFromSource(s.source);
			return {
				label: `Reconnect MCP ${provider ?? s.source}`,
				description: `silent ${formatDurationMs(s.silent_for_ms)} (threshold ${formatDurationMs(s.threshold_ms)})`,
				detail: s.last_observation_iso ? `Last observed: ${s.last_observation_iso}` : 'Never observed since kernel boot.',
				provider,
			};
		});
	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: 'Stale MCP providers — pick one to reconnect',
	});
	if (!picked || !picked.provider) {
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
 * Register the `goatide.mcp.showStaleProviders` command. The Phase-5 LivenessBanner
 * already surfaces mcp.* sources via the same harvester.getLiveness RPC; this command is
 * a focused MCP-only entry point that drives reconnect.
 */
export function registerMcpLivenessBannerExtension(
	ctx: vscode.ExtensionContext,
	kernel: McpLivenessKernelClient,
): void {
	const sub = vscode.commands.registerCommand(SHOW_STALE_MCP_COMMAND, () => showStaleMcpProvidersQuickPick(kernel));
	ctx.subscriptions.push(sub);
}

function formatDurationMs(ms: number): string {
	const sec = Math.floor(ms / 1000);
	if (sec < 60) {
		return `${sec}s`;
	}
	const min = Math.floor(sec / 60);
	if (min < 60) {
		return `${min}m`;
	}
	const hr = Math.floor(min / 60);
	if (hr < 24) {
		return `${hr}h`;
	}
	const day = Math.floor(hr / 24);
	return `${day}d`;
}
