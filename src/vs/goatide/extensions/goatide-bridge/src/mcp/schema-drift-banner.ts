/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/mcp/schema-drift-banner.ts
//
// Phase 6 Plan 06-06 — MCP-07 SchemaDriftBanner. Separate StatusBarItem mirroring the
// Phase-4 KernelDegradedBanner pattern but for per-provider schema-drift state instead of
// kernel connection state.
//
// Polls kernel.mcpGetSchemaDriftReport every 30s (configurable via opts.pollIntervalMs for
// tests). Renders:
//   - hidden  : no provider in paused_drift state
//   - error   : >=1 provider in paused_drift -> errorBackground
//
// Click target: showDriftQuickPick presents a quickPick per drifting provider with three
// actions:
//   - 'Accept new schema' -> mcp.acceptProviderSchemaDrift (server reconnects automatically)
//   - 'Pause longer'      -> no-op acknowledgement
//   - 'View diff'         -> opens drift_summary in an unsaved editor
//
// Status-bar priority 98 (between LivenessBanner-99 and KernelDegradedBanner-100). Click
// is also reachable via the goatide.mcp.showSchemaDrift command for command-palette users.

import * as vscode from 'vscode';
import type { McpProviderNameWire, McpSchemaDriftReportEntry } from '../kernel/methods.js';

const DEFAULT_POLL_INTERVAL_MS = 30 * 1000;
const SHOW_DRIFT_COMMAND = 'goatide.mcp.showSchemaDrift';

export interface SchemaDriftKernelClient {
	mcpGetSchemaDriftReport: () => Promise<{ providers: McpSchemaDriftReportEntry[] }>;
	mcpAcceptProviderSchemaDrift: (params: { provider: McpProviderNameWire }) => Promise<{ accepted: boolean }>;
	/**
	 * Plan 10-02 (POLISH-02) — precondition gate. Empty `providers` array means "no MCP
	 * providers configured", which causes `bootstrap()` to skip setting up the 30s
	 * drift-report poll loop entirely.
	 */
	mcpListProviders: () => Promise<{ providers: McpProviderNameWire[] }>;
}

export interface SchemaDriftBannerOpts {
	pollIntervalMs?: number;
}

export class SchemaDriftBanner implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	/**
	 * Plan 10-02 (POLISH-02) — nullable. Initial poll + setInterval are deferred to
	 * `bootstrap()`, which only schedules them when at least one MCP provider is
	 * configured. `dispose()` guards the clearInterval with an undefined check.
	 */
	private timer: NodeJS.Timeout | undefined;
	private readonly commandSub: vscode.Disposable;
	private latestPaused: McpSchemaDriftReportEntry[] = [];
	private disposed = false;

	constructor(
		private readonly kernel: SchemaDriftKernelClient,
		opts: SchemaDriftBannerOpts = {},
	) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
		this.item.command = SHOW_DRIFT_COMMAND;
		this.item.hide();

		this.commandSub = vscode.commands.registerCommand(SHOW_DRIFT_COMMAND, () => this.showDriftQuickPick());

		void this.bootstrap(kernel, opts);
	}

	/**
	 * Plan 10-02 (POLISH-02) — async precondition gate for the 30s drift-report poll.
	 *
	 * Calls `kernel.mcpListProviders()` once at startup; if the result is `{providers: []}`
	 * (no MCP providers configured) OR the banner has already been disposed, returns early
	 * WITHOUT scheduling the initial poll or the setInterval. This eliminates the dominant
	 * renderer.log `[error]` source identified in 10-RESEARCH SC#5 audit — without this
	 * gate, the banner sent mcp.getSchemaDriftReport every 30s and received MethodNotFound
	 * -32601 responses when no providers were configured (Path A from research; Path B's
	 * catch-and-suppress cannot satisfy the "no RPC sent within 60s" SC#2 condition).
	 *
	 * On precondition-check failure (transient kernel restart, RPC timeout, etc.), logs
	 * via `console.warn` (NOT `console.error`; Pitfall 6 — the failure is recoverable and
	 * does not warrant an `[error]` line in renderer.log) and returns. The next bridge
	 * activation cycle re-runs bootstrap from a fresh extension load.
	 */
	private async bootstrap(kernel: SchemaDriftKernelClient, opts: SchemaDriftBannerOpts): Promise<void> {
		try {
			const { providers } = await kernel.mcpListProviders();
			if (providers.length === 0 || this.disposed) {
				return;
			}
		} catch (err) {
			console.warn('[goatide-bridge] SchemaDriftBanner precondition check failed; skipping pollers', err);
			return;
		}
		const intervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		void this.poll();
		this.timer = setInterval(() => { void this.poll(); }, intervalMs);
	}

	private async poll(): Promise<void> {
		if (this.disposed) {
			return;
		}
		try {
			const report = await this.kernel.mcpGetSchemaDriftReport();
			if (this.disposed) {
				return;
			}
			const paused = report.providers.filter((p) => p.paused);
			this.latestPaused = paused;
			this.render(paused);
		} catch (err) {
			console.error('[goatide-bridge] SchemaDriftBanner poll failed', err);
		}
	}

	private render(paused: readonly McpSchemaDriftReportEntry[]): void {
		if (paused.length === 0) {
			this.item.text = '';
			this.item.tooltip = undefined;
			this.item.backgroundColor = undefined;
			this.item.hide();
			return;
		}
		this.item.text = paused.length === 1
			? `$(warning) MCP schema drift: ${paused[0].provider}`
			: `$(warning) MCP schema drift (${paused.length})`;
		this.item.tooltip = `MCP providers paused on schema drift: ${paused.map((p) => p.provider).join(', ')}. Click to inspect.`;
		this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		this.item.show();
	}

	/**
	 * Show a quickPick of paused providers; selecting one offers the 3 actions
	 * (Accept new schema | Pause longer | View diff). Exposed for tests + reachable from
	 * the status-bar item command.
	 */
	async showDriftQuickPick(): Promise<void> {
		if (this.latestPaused.length === 0) {
			await vscode.window.showInformationMessage('GoatIDE: no MCP providers are currently paused on schema drift.');
			return;
		}
		const providerItems = this.latestPaused
			.slice()
			.sort((a, b) => a.provider.localeCompare(b.provider))
			.map((p) => ({
				label: p.provider,
				description: 'paused on schema drift',
				detail: p.drift_summary ?? '(no drift summary available)',
				entry: p,
			}));
		const provider = await vscode.window.showQuickPick(providerItems, {
			placeHolder: 'MCP providers paused on schema drift — pick one',
		});
		if (!provider) {
			return;
		}

		const ACCEPT = 'Accept new schema';
		const PAUSE = 'Pause longer';
		const VIEW = 'View diff';
		const action = await vscode.window.showQuickPick([ACCEPT, PAUSE, VIEW], {
			placeHolder: `Action for ${provider.entry.provider}`,
		});
		if (!action) {
			return;
		}
		switch (action) {
			case ACCEPT: {
				try {
					const result = await this.kernel.mcpAcceptProviderSchemaDrift({ provider: provider.entry.provider });
					if (result.accepted) {
						await vscode.window.showInformationMessage(`GoatIDE: accepted new schema for MCP ${provider.entry.provider} (reconnecting).`);
					} else {
						await vscode.window.showWarningMessage(`GoatIDE: schema acceptance for MCP ${provider.entry.provider} returned not-accepted.`);
					}
				} catch (err) {
					await vscode.window.showErrorMessage(`GoatIDE: accept schema drift for ${provider.entry.provider} failed — ${err instanceof Error ? err.message : String(err)}`);
				}
				return;
			}
			case PAUSE: {
				await vscode.window.showInformationMessage(`GoatIDE: MCP ${provider.entry.provider} remains paused on schema drift.`);
				return;
			}
			case VIEW: {
				const summary = provider.entry.drift_summary ?? '(no drift summary available)';
				const doc = await vscode.workspace.openTextDocument({ content: summary, language: 'markdown' });
				await vscode.window.showTextDocument(doc, { preview: true });
				return;
			}
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		// Plan 10-02 (POLISH-02): timer is now nullable — guard the clearInterval. When
		// bootstrap()'s precondition gate suppressed poll-setup (no providers configured or
		// RPC failure), this.timer is undefined and there is nothing to clear.
		if (this.timer !== undefined) {
			try { clearInterval(this.timer); } catch { /* best-effort */ }
			this.timer = undefined;
		}
		try { this.commandSub.dispose(); } catch { /* best-effort */ }
		try { this.item.dispose(); } catch { /* best-effort */ }
	}
}

/**
 * Register the SchemaDriftBanner on the extension subscriptions. Disposed automatically
 * on extension deactivate.
 */
export function registerSchemaDriftBanner(
	ctx: vscode.ExtensionContext,
	kernel: SchemaDriftKernelClient,
	opts: SchemaDriftBannerOpts = {},
): SchemaDriftBanner {
	const banner = new SchemaDriftBanner(kernel, opts);
	ctx.subscriptions.push(banner);
	return banner;
}
