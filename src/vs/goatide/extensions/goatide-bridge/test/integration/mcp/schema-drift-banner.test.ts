/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/mcp/schema-drift-banner.test.ts
//
// Phase 6 Plan 06-06 — MCP-07 SchemaDriftBanner. Exercises the separate StatusBarItem that
// polls kernel.mcp.getSchemaDriftReport every 30s (test override: 30ms) and renders
// errorBackground when any provider is paused on schema drift. Click target opens a
// quickPick offering Accept-new-schema / Pause-longer / View-diff actions.

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { SchemaDriftBanner, type SchemaDriftKernelClient } from '../../../src/mcp/schema-drift-banner.js';
import type { McpProviderNameWire, McpSchemaDriftReportEntry } from '../../../src/kernel/methods.js';

interface VscodeStatusBarItemSpy {
	text: string;
	tooltip: string | undefined;
	command: string | undefined;
	backgroundColor: { id: string } | undefined;
	visible: boolean;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Test-only options for `makeMockKernel`. `providers` seeds the `mcpListProviders` response
 * so SchemaDriftBanner's Plan 10-02 precondition gate can be exercised: empty array means
 * "no MCP providers configured -> banner must not poll drift-report".
 */
interface MockKernelOpts {
	providers?: readonly McpProviderNameWire[];
}

interface MockKernel extends SchemaDriftKernelClient {
	mcpListProviders(): Promise<{ providers: McpProviderNameWire[] }>;
	__setReport(entries: McpSchemaDriftReportEntry[]): void;
	__pollCount(): number;
	__acceptCalls(): { provider: string }[];
}

function makeMockKernel(opts: MockKernelOpts = {}): MockKernel {
	let report: McpSchemaDriftReportEntry[] = [];
	let pollCount = 0;
	const acceptCalls: { provider: string }[] = [];
	const configuredProviders: McpProviderNameWire[] = opts.providers ? [...opts.providers] : [];
	const k: MockKernel = {
		mcpGetSchemaDriftReport: async () => {
			pollCount++;
			return { providers: report };
		},
		mcpAcceptProviderSchemaDrift: async (params) => {
			acceptCalls.push({ provider: params.provider });
			return { accepted: true };
		},
		mcpListProviders: async () => ({ providers: [...configuredProviders] }),
		__setReport: (e) => { report = e; },
		__pollCount: () => pollCount,
		__acceptCalls: () => acceptCalls,
	};
	return k;
}

describe('MCP-07: schema-drift banner polls + renders + offers user actions', () => {
	let createdItems: VscodeStatusBarItemSpy[];
	let originalCreate: typeof vscode.window.createStatusBarItem;
	let originalShowQuickPick: typeof vscode.window.showQuickPick | undefined;
	let originalShowInformation: typeof vscode.window.showInformationMessage | undefined;
	let originalShowWarning: ((m: string) => Promise<string | undefined>) | undefined;
	let originalShowError: typeof vscode.window.showErrorMessage | undefined;
	let originalOpenTextDocument: ((opts: unknown) => Promise<unknown>) | undefined;
	let originalShowTextDocument: ((doc: unknown, opts?: unknown) => Promise<unknown>) | undefined;
	let quickPickResponses: unknown[];
	let openTextDocumentCalls: unknown[];
	let showTextDocumentCalls: unknown[];
	let infoCalls: string[];

	beforeEach(() => {
		createdItems = [];
		quickPickResponses = [];
		openTextDocumentCalls = [];
		showTextDocumentCalls = [];
		infoCalls = [];

		originalCreate = (vscode.window as unknown as { createStatusBarItem: typeof vscode.window.createStatusBarItem }).createStatusBarItem;
		const capture = (...args: unknown[]): VscodeStatusBarItemSpy => {
			const item = (originalCreate as (...a: unknown[]) => unknown).apply(vscode.window, args) as VscodeStatusBarItemSpy;
			createdItems.push(item);
			return item;
		};
		(vscode.window as unknown as { createStatusBarItem: typeof capture }).createStatusBarItem = capture;

		originalShowQuickPick = vscode.window.showQuickPick as typeof vscode.window.showQuickPick;
		(vscode.window as unknown as { showQuickPick: (items: unknown, opts: unknown) => Promise<unknown> }).showQuickPick = async (_items: unknown, _opts: unknown): Promise<unknown> => {
			// Pop one configured response per call; if exhausted, return undefined (cancel).
			if (quickPickResponses.length === 0) {
				return undefined;
			}
			return quickPickResponses.shift();
		};

		originalShowInformation = vscode.window.showInformationMessage as typeof vscode.window.showInformationMessage;
		(vscode.window as unknown as { showInformationMessage: (m: string) => Promise<undefined> }).showInformationMessage = async (m: string): Promise<undefined> => {
			infoCalls.push(m);
			return undefined;
		};
		originalShowWarning = (vscode.window as unknown as { showWarningMessage?: (m: string) => Promise<string | undefined> }).showWarningMessage;
		(vscode.window as unknown as { showWarningMessage: (m: string) => Promise<undefined> }).showWarningMessage = async (_m: string): Promise<undefined> => undefined;
		originalShowError = (vscode.window as unknown as { showErrorMessage?: typeof vscode.window.showErrorMessage }).showErrorMessage;
		(vscode.window as unknown as { showErrorMessage: (m: string) => Promise<undefined> }).showErrorMessage = async (_m: string): Promise<undefined> => undefined;

		originalOpenTextDocument = (vscode.workspace as unknown as { openTextDocument?: (opts: unknown) => Promise<unknown> }).openTextDocument;
		(vscode.workspace as unknown as { openTextDocument: (opts: unknown) => Promise<unknown> }).openTextDocument = async (opts: unknown): Promise<unknown> => {
			openTextDocumentCalls.push(opts);
			return { uri: { fsPath: '/__virtual__' } };
		};
		originalShowTextDocument = (vscode.window as unknown as { showTextDocument?: (doc: unknown, opts?: unknown) => Promise<unknown> }).showTextDocument;
		(vscode.window as unknown as { showTextDocument: (doc: unknown, opts?: unknown) => Promise<unknown> }).showTextDocument = async (doc: unknown, opts?: unknown): Promise<unknown> => {
			showTextDocumentCalls.push({ doc, opts });
			return undefined;
		};
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
		if (originalOpenTextDocument !== undefined) {
			(vscode.workspace as unknown as { openTextDocument: typeof originalOpenTextDocument }).openTextDocument = originalOpenTextDocument;
		} else {
			delete (vscode.workspace as unknown as { openTextDocument?: unknown }).openTextDocument;
		}
		if (originalShowTextDocument !== undefined) {
			(vscode.window as unknown as { showTextDocument: typeof originalShowTextDocument }).showTextDocument = originalShowTextDocument;
		} else {
			delete (vscode.window as unknown as { showTextDocument?: unknown }).showTextDocument;
		}
	});

	it('MCP-07: banner polls mcp.getSchemaDriftReport on the configured interval and stays hidden when no providers are paused', async () => {
		// Plan 10-02 (POLISH-02): SchemaDriftBanner now precondition-gates poll setup on
		// mcpListProviders() returning a non-empty providers array. Seed the mock with the
		// providers this test reports on so bootstrap() proceeds into the poll loop.
		const kernel = makeMockKernel({ providers: ['github', 'slack'] });
		kernel.__setReport([
			{ provider: 'github', paused: false },
			{ provider: 'slack', paused: false },
		]);
		const banner = new SchemaDriftBanner(kernel, { pollIntervalMs: 30 });
		// Wait long enough for an immediate poll + at least one interval tick.
		await sleep(80);
		const item = createdItems[0];
		const snapshot = {
			visible: item.visible,
			backgroundColorId: item.backgroundColor?.id,
			text: item.text,
			pollsHappened: kernel.__pollCount() >= 2,
			commandWired: item.command,
		};
		banner.dispose();
		assert.deepStrictEqual(snapshot, {
			visible: false,
			backgroundColorId: undefined,
			text: '',
			pollsHappened: true,
			commandWired: 'goatide.mcp.showSchemaDrift',
		});
	});

	it('MCP-07: renders errorBackground when any provider is paused_drift', async () => {
		// Plan 10-02 (POLISH-02): seed `providers` so bootstrap()'s precondition gate
		// proceeds into the poll loop (empty array now suppresses polling entirely).
		const kernel = makeMockKernel({ providers: ['github', 'slack'] });
		// Initial: clean.
		kernel.__setReport([{ provider: 'github', paused: false }]);
		const banner = new SchemaDriftBanner(kernel, { pollIntervalMs: 30 });
		await sleep(50);
		const cleanItem = createdItems[0];
		const cleanSnapshot = {
			visible: cleanItem.visible,
			backgroundColorId: cleanItem.backgroundColor?.id,
		};

		// Flip slack paused -> errorBackground.
		kernel.__setReport([
			{ provider: 'github', paused: false },
			{ provider: 'slack', paused: true, drift_summary: 'tool list changed: messages.send signature drift' },
		]);
		await sleep(60);
		const item = createdItems[0];
		const driftSnapshot = {
			visible: item.visible,
			backgroundColorId: item.backgroundColor?.id,
			textMentionsSlack: item.text.includes('slack'),
			tooltipMentionsSlack: (item.tooltip ?? '').includes('slack'),
		};

		banner.dispose();

		assert.deepStrictEqual({ cleanSnapshot, driftSnapshot }, {
			cleanSnapshot: { visible: false, backgroundColorId: undefined },
			driftSnapshot: {
				visible: true,
				backgroundColorId: 'statusBarItem.errorBackground',
				textMentionsSlack: true,
				tooltipMentionsSlack: true,
			},
		});
	});

	it('MCP-07: click → quickPick offers Accept / Pause / View-diff actions; Accept invokes acceptProviderSchemaDrift; View opens drift_summary doc', async () => {
		// Plan 10-02 (POLISH-02): seed `providers` so bootstrap()'s precondition gate
		// proceeds into the poll loop. The latestPaused state that showDriftQuickPick
		// reads from is populated by the first poll() invocation; bootstrap suppresses
		// that initial poll when providers is empty.
		const kernel = makeMockKernel({ providers: ['slack', 'jira'] });
		kernel.__setReport([
			{ provider: 'slack', paused: true, drift_summary: 'slack drift summary text' },
			{ provider: 'jira', paused: true, drift_summary: 'jira drift summary text' },
		]);
		const banner = new SchemaDriftBanner(kernel, { pollIntervalMs: 30 });
		await sleep(50);

		// Drive the click handler. Two quickPick rounds: provider-pick, then action-pick.
		// Round 1: provider-list. Configure to pick the slack entry.
		// Round 2: action-list. Configure to pick 'Accept new schema'.
		quickPickResponses.push({ label: 'slack', entry: { provider: 'slack', paused: true, drift_summary: 'slack drift summary text' } });
		quickPickResponses.push('Accept new schema');
		await banner.showDriftQuickPick();

		const acceptSnapshot = {
			acceptCalls: kernel.__acceptCalls(),
			infoCalls: infoCalls.slice(),
			openTextDocumentCalls: openTextDocumentCalls.length,
			showTextDocumentCalls: showTextDocumentCalls.length,
		};

		// Round 3 + 4: pick jira -> View diff.
		infoCalls.length = 0;
		quickPickResponses.push({ label: 'jira', entry: { provider: 'jira', paused: true, drift_summary: 'jira drift summary text' } });
		quickPickResponses.push('View diff');
		await banner.showDriftQuickPick();

		const viewSnapshot = {
			openTextDocumentCalls: openTextDocumentCalls.length,
			openedContent: (openTextDocumentCalls[0] as { content?: string })?.content,
			showTextDocumentCalls: showTextDocumentCalls.length,
		};

		// Round 5 + 6: pick slack -> Pause longer (no-op; just info message).
		infoCalls.length = 0;
		quickPickResponses.push({ label: 'slack', entry: { provider: 'slack', paused: true, drift_summary: 'slack drift summary text' } });
		quickPickResponses.push('Pause longer');
		await banner.showDriftQuickPick();

		const pauseSnapshot = {
			acceptCallsTotal: kernel.__acceptCalls().length,
			pauseInfoCalls: infoCalls.slice(),
		};

		banner.dispose();

		assert.deepStrictEqual({ acceptSnapshot, viewSnapshot, pauseSnapshot }, {
			acceptSnapshot: {
				acceptCalls: [{ provider: 'slack' }],
				infoCalls: ['GoatIDE: accepted new schema for MCP slack (reconnecting).'],
				openTextDocumentCalls: 0,
				showTextDocumentCalls: 0,
			},
			viewSnapshot: {
				openTextDocumentCalls: 1,
				openedContent: 'jira drift summary text',
				showTextDocumentCalls: 1,
			},
			pauseSnapshot: {
				acceptCallsTotal: 1, // Accept was called only on slack-Accept; Pause is a no-op for the RPC.
				pauseInfoCalls: ['GoatIDE: MCP slack remains paused on schema drift.'],
			},
		});
	});

	// Phase 10 Plan 10-02 (POLISH-02) — SchemaDriftBanner precondition gate.
	// Banner calls kernel.mcpListProviders() once at construction; an empty providers array
	// suppresses the 30s mcp.getSchemaDriftReport poll loop entirely (eliminating the
	// renderer.log `[error]` noise that grew out of MethodNotFound responses when no MCP
	// providers were configured — research SC#5 root cause). Non-empty array proceeds into
	// the normal poll cadence.

	it('Plan 10-02 (POLISH-02): does not poll mcp.getSchemaDriftReport when no providers configured', async () => {
		const kernel = makeMockKernel({ providers: [] });
		const banner = new SchemaDriftBanner(kernel, { pollIntervalMs: 200 });
		// Wait 5x pollIntervalMs (Nyquist) — ample time for any (incorrect) polls to fire.
		await sleep(1000);
		const pollCount = kernel.__pollCount();
		banner.dispose();
		assert.strictEqual(pollCount, 0);
	});

	it('Plan 10-02 (POLISH-02): polls mcp.getSchemaDriftReport when at least one provider configured', async () => {
		const kernel = makeMockKernel({ providers: ['github'] });
		const banner = new SchemaDriftBanner(kernel, { pollIntervalMs: 200 });
		// Wait 5x pollIntervalMs — bootstrap's initial poll + at least 1 interval tick.
		await sleep(1000);
		const pollCount = kernel.__pollCount();
		banner.dispose();
		assert.ok(pollCount > 0, `expected pollCount > 0, got ${pollCount}`);
	});
});
