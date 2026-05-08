/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/mcp/liveness-banner-ext.test.ts
//
// Phase 6 Plan 06-06 — MCP-06 bridge half. Exercises the MCP-only LivenessBanner extension
// (a focused command that filters the existing harvester liveness report to mcp.<provider>
// entries + offers reconnect actions per stale provider).
//
// The Phase-5 LivenessBanner already surfaces mcp.* sources transparently because the
// kernel-side LivenessState (Plan 06-06 Task 1) returns them alongside the existing 4
// claude_jsonl/editor_save/terminal_shell/git_commit sources. What this suite covers:
//
//   1. The shared filter helpers correctly identify mcp.<provider> source keys and reject
//      non-MCP keys (snapshot assertion over a mixed report).
//   2. Selecting a stale provider in the quickPick drives kernel.mcpReconnectProvider with
//      the correct provider name (the user-facing reconnect action).
//   3. The Phase-5 LivenessBanner transitions to errorBackground when ≥2 mcp.* sources are
//      stale alongside no other sources — proving the existing banner already covers the
//      MCP case without modification (the extension is purely additive).

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import {
	filterMcpLivenessEntries,
	isMcpLivenessSource,
	providerNameFromSource,
	showStaleMcpProvidersQuickPick,
	type McpLivenessKernelClient,
	type McpLivenessReport,
} from '../../../src/mcp/liveness-banner-ext.js';
import { LivenessBanner, type LivenessKernelClient } from '../../../src/harvester/liveness-banner.js';

interface VscodeStatusBarItemSpy {
	text: string;
	tooltip: string | undefined;
	backgroundColor: { id: string } | undefined;
	visible: boolean;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

describe('MCP-06: liveness banner extension surfaces mcp.<provider> sources', () => {
	let createdItems: VscodeStatusBarItemSpy[];
	let originalCreate: typeof vscode.window.createStatusBarItem;
	let originalShowQuickPick: typeof vscode.window.showQuickPick | undefined;
	let originalShowInformation: typeof vscode.window.showInformationMessage | undefined;
	let originalShowWarning: ((m: string) => Promise<string | undefined>) | undefined;
	let originalShowError: typeof vscode.window.showErrorMessage | undefined;
	let quickPickCalls: { items: unknown; opts: unknown }[];
	let quickPickRespondWith: unknown;
	let infoCalls: string[];

	beforeEach(() => {
		createdItems = [];
		quickPickCalls = [];
		quickPickRespondWith = undefined;
		infoCalls = [];
		originalCreate = (vscode.window as unknown as { createStatusBarItem: typeof vscode.window.createStatusBarItem }).createStatusBarItem;
		const capture = (...args: unknown[]): VscodeStatusBarItemSpy => {
			const item = (originalCreate as (...a: unknown[]) => unknown).apply(vscode.window, args) as VscodeStatusBarItemSpy;
			createdItems.push(item);
			return item;
		};
		(vscode.window as unknown as { createStatusBarItem: typeof capture }).createStatusBarItem = capture;
		// Stub showQuickPick — record args + respond with the configured value.
		originalShowQuickPick = vscode.window.showQuickPick as typeof vscode.window.showQuickPick;
		(vscode.window as unknown as { showQuickPick: (items: unknown, opts: unknown) => Promise<unknown> }).showQuickPick = async (items: unknown, opts: unknown): Promise<unknown> => {
			quickPickCalls.push({ items, opts });
			return quickPickRespondWith;
		};
		// Stub showInformationMessage — record + return undefined.
		originalShowInformation = vscode.window.showInformationMessage as typeof vscode.window.showInformationMessage;
		(vscode.window as unknown as { showInformationMessage: (m: string) => Promise<undefined> }).showInformationMessage = async (m: string): Promise<undefined> => {
			infoCalls.push(m);
			return undefined;
		};
		originalShowWarning = (vscode.window as unknown as { showWarningMessage?: (m: string) => Promise<string | undefined> }).showWarningMessage;
		(vscode.window as unknown as { showWarningMessage: (m: string) => Promise<undefined> }).showWarningMessage = async (_m: string): Promise<undefined> => undefined;
		originalShowError = (vscode.window as unknown as { showErrorMessage?: typeof vscode.window.showErrorMessage }).showErrorMessage;
		// Use a plain async returning undefined for showErrorMessage so reconnect failures don't blow up the test runner.
		(vscode.window as unknown as { showErrorMessage: (m: string) => Promise<undefined> }).showErrorMessage = async (_m: string): Promise<undefined> => undefined;
	});

	afterEach(() => {
		(vscode.window as unknown as { createStatusBarItem: typeof originalCreate }).createStatusBarItem = originalCreate;
		if (originalShowQuickPick !== undefined) {
			(vscode.window as unknown as { showQuickPick: typeof originalShowQuickPick }).showQuickPick = originalShowQuickPick;
		}
		if (originalShowInformation !== undefined) {
			(vscode.window as unknown as { showInformationMessage: typeof originalShowInformation }).showInformationMessage = originalShowInformation;
		}
		if (originalShowWarning !== undefined) {
			(vscode.window as unknown as { showWarningMessage: typeof originalShowWarning }).showWarningMessage = originalShowWarning;
		} else {
			delete (vscode.window as unknown as { showWarningMessage?: unknown }).showWarningMessage;
		}
		if (originalShowError !== undefined) {
			(vscode.window as unknown as { showErrorMessage: typeof originalShowError }).showErrorMessage = originalShowError;
		}
	});

	it('MCP-06: filter helpers correctly partition mcp.<provider> source keys from a mixed liveness report', () => {
		const sources: McpLivenessReport[] = [
			{ source: 'claude_jsonl', stale: false, silent_for_ms: 100, threshold_ms: 14_400_000 },
			{ source: 'editor_save', stale: false, silent_for_ms: 100, threshold_ms: 1_800_000 },
			{ source: 'mcp.github', stale: false, silent_for_ms: 100, threshold_ms: 3_600_000 },
			{ source: 'mcp.slack', stale: true, silent_for_ms: 99_999_999, threshold_ms: 3_600_000 },
			{ source: 'mcp.linear', stale: false, silent_for_ms: 100, threshold_ms: 3_600_000 },
			{ source: 'mcp.jira', stale: true, silent_for_ms: 99_999_999, threshold_ms: 3_600_000 },
			{ source: 'mcp.bogus_provider', stale: true, silent_for_ms: 1, threshold_ms: 1 },
		];

		const filtered = filterMcpLivenessEntries(sources).map((s) => s.source).sort();
		const partition = {
			'claude_jsonl': isMcpLivenessSource('claude_jsonl'),
			'editor_save': isMcpLivenessSource('editor_save'),
			'mcp.github': isMcpLivenessSource('mcp.github'),
			'mcp.slack': isMcpLivenessSource('mcp.slack'),
			'mcp.linear': isMcpLivenessSource('mcp.linear'),
			'mcp.jira': isMcpLivenessSource('mcp.jira'),
			'mcp.bogus_provider': isMcpLivenessSource('mcp.bogus_provider'),
		};
		const providerNames = {
			'mcp.github': providerNameFromSource('mcp.github'),
			'mcp.slack': providerNameFromSource('mcp.slack'),
			'mcp.bogus_provider': providerNameFromSource('mcp.bogus_provider'),
			'claude_jsonl': providerNameFromSource('claude_jsonl'),
		};

		assert.deepStrictEqual({ filtered, partition, providerNames }, {
			filtered: ['mcp.github', 'mcp.jira', 'mcp.linear', 'mcp.slack'],
			partition: {
				'claude_jsonl': false,
				'editor_save': false,
				'mcp.github': true,
				'mcp.slack': true,
				'mcp.linear': true,
				'mcp.jira': true,
				'mcp.bogus_provider': false,
			},
			providerNames: {
				'mcp.github': 'github',
				'mcp.slack': 'slack',
				'mcp.bogus_provider': null,
				'claude_jsonl': null,
			},
		});
	});

	it('MCP-06: showStaleMcpProvidersQuickPick lists stale MCP providers and drives kernel.mcpReconnectProvider', async () => {
		const reconnectCalls: { provider: string }[] = [];
		const kernel: McpLivenessKernelClient = {
			harvesterGetLiveness: async () => ({
				sources: [
					{ source: 'claude_jsonl', stale: true, silent_for_ms: 99_999_999, threshold_ms: 14_400_000 },
					{ source: 'mcp.github', stale: false, silent_for_ms: 1, threshold_ms: 3_600_000 },
					{ source: 'mcp.slack', stale: true, silent_for_ms: 99_999_999, threshold_ms: 3_600_000 },
					{ source: 'mcp.jira', stale: true, silent_for_ms: 99_999_999, threshold_ms: 3_600_000 },
				],
			}),
			mcpReconnectProvider: async (params) => {
				reconnectCalls.push({ provider: params.provider });
				return { reconnected: true };
			},
		};

		// Configure the quickPick stub to "click" the slack entry.
		quickPickRespondWith = { label: 'Reconnect MCP slack', provider: 'slack' };
		await showStaleMcpProvidersQuickPick(kernel);

		assert.equal(quickPickCalls.length, 1, 'expected showQuickPick to be invoked exactly once');
		const items = quickPickCalls[0].items as Array<{ label: string; provider: string }>;
		assert.deepStrictEqual({
			labels: items.map((i) => i.label).sort(),
			providers: items.map((i) => i.provider).sort(),
			reconnectCalls,
			infoCalls,
		}, {
			labels: ['Reconnect MCP jira', 'Reconnect MCP slack'],
			providers: ['jira', 'slack'],
			reconnectCalls: [{ provider: 'slack' }],
			infoCalls: ['GoatIDE: reconnected MCP provider slack.'],
		});
	});

	it('MCP-06: Phase-5 LivenessBanner transitions to errorBackground when 2+ mcp.* sources are stale', async () => {
		// The Phase-5 LivenessBanner is intentionally not aware of mcp.* — it just sees
		// "stale source count >= 2" and flips errorBackground. This asserts the existing
		// banner already covers the MCP case without modification (extension purely additive).
		const reports: McpLivenessReport[] = [
			{ source: 'mcp.github', stale: true, silent_for_ms: 99_999_999, threshold_ms: 3_600_000 },
			{ source: 'mcp.slack', stale: true, silent_for_ms: 99_999_999, threshold_ms: 3_600_000 },
		];
		const kernel: LivenessKernelClient = {
			harvesterGetLiveness: async () => ({ sources: reports }),
		};

		const banner = new LivenessBanner(kernel, { pollIntervalMs: 30 });
		await sleep(60);

		const item = createdItems[0];
		const snapshot = {
			visible: item.visible,
			backgroundColorId: item.backgroundColor?.id,
			textIncludesStale: item.text.toLowerCase().includes('stale'),
			tooltipMentionsBoth: (item.tooltip ?? '').includes('mcp.github') && (item.tooltip ?? '').includes('mcp.slack'),
		};
		banner.dispose();

		assert.deepStrictEqual(snapshot, {
			visible: true,
			backgroundColorId: 'statusBarItem.errorBackground',
			textIncludesStale: true,
			tooltipMentionsBoth: true,
		});
	});
});
