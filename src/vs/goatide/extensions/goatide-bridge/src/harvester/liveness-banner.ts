/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/harvester/liveness-banner.ts
//
// Phase 5 Plan 05-07 TELE-06 — bridge LivenessBanner. Mirrors the Phase-4
// KernelDegradedBanner pattern but for per-source watcher liveness instead of kernel
// connection state.
//
// Polls kernel.harvesterGetLiveness on a configurable setInterval (default 30s; tests
// override via opts.pollIntervalMs). Renders a status-bar item:
//
//   - clean    : no stale sources -> hidden
//   - warning  : a single stale source with a long threshold (>= 30min) -> warningBackground
//   - error    : multiple stale sources OR a stale source with a tight threshold (< 30min)
//                -> errorBackground
//
// Click target: showStaleSourcesQuickPick reveals the stale source list. The action is
// also invocable via the goatide.harvester.showStaleSources command (registered alongside
// the banner so the status-bar item.command can route to it).

import * as vscode from 'vscode';

const HALF_HOUR_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 30 * 1000;

export interface LivenessReport {
	source: string;
	stale: boolean;
	silent_for_ms: number;
	threshold_ms: number;
	last_observation_iso?: string;
}

export interface LivenessKernelClient {
	harvesterGetLiveness: () => Promise<{ sources: LivenessReport[] }>;
}

export interface LivenessBannerOpts {
	pollIntervalMs?: number;
}

const QUICK_PICK_COMMAND = 'goatide.harvester.showStaleSources';

export class LivenessBanner implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly timer: NodeJS.Timeout;
	private readonly commandSub: vscode.Disposable;
	private latestStale: LivenessReport[] = [];
	private disposed = false;

	constructor(
		private readonly kernel: LivenessKernelClient,
		opts: LivenessBannerOpts = {},
	) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
		this.item.command = QUICK_PICK_COMMAND;
		this.item.hide();

		// Register the click-target command so the status-bar item.command resolves to a
		// real handler. Tests can also call showStaleSourcesQuickPick() directly.
		this.commandSub = vscode.commands.registerCommand(QUICK_PICK_COMMAND, () => this.showStaleSourcesQuickPick());

		const intervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		// Run an immediate poll so the banner reflects state without waiting one full
		// interval; the timer takes over after that.
		void this.poll();
		this.timer = setInterval(() => { void this.poll(); }, intervalMs);
	}

	private async poll(): Promise<void> {
		if (this.disposed) {
			return;
		}
		try {
			const report = await this.kernel.harvesterGetLiveness();
			if (this.disposed) {
				return;
			}
			const stale = report.sources.filter((s) => s.stale);
			this.latestStale = stale;
			this.render(stale);
		} catch (err) {
			// Best-effort: a single failed poll shouldn't kill the banner. If the kernel is
			// fully unreachable, the KernelDegradedBanner is the surface that warns.
			console.error('[goatide-bridge] LivenessBanner poll failed', err);
		}
	}

	private render(stale: LivenessReport[]): void {
		if (stale.length === 0) {
			this.item.text = '';
			this.item.tooltip = undefined;
			this.item.backgroundColor = undefined;
			this.item.hide();
			return;
		}
		const tightThreshold = stale.some((s) => s.threshold_ms < HALF_HOUR_MS);
		const isError = stale.length >= 2 || tightThreshold;
		const colorId = isError ? 'statusBarItem.errorBackground' : 'statusBarItem.warningBackground';
		this.item.text = stale.length === 1
			? `$(warning) ${stale[0].source} stale`
			: `$(warning) ${stale.length} sources stale`;
		this.item.tooltip = `Harvester sources stale: ${stale.map((s) => s.source).join(', ')}. Click to inspect.`;
		this.item.backgroundColor = new vscode.ThemeColor(colorId);
		this.item.show();
	}

	/**
	 * Show a quick-pick of the currently-stale sources. Called from the status-bar item
	 * command (`goatide.harvester.showStaleSources`) and exposed for tests so they can
	 * trigger the action without simulating a UI click.
	 */
	async showStaleSourcesQuickPick(): Promise<void> {
		const items = [...this.latestStale]
			.sort((a, b) => a.source.localeCompare(b.source))
			.map((s) => ({
				label: s.source,
				description: `silent ${formatDuration(s.silent_for_ms)} (threshold ${formatDuration(s.threshold_ms)})`,
				detail: s.last_observation_iso
					? `Last observed: ${s.last_observation_iso}`
					: 'Never observed since kernel boot.',
			}));
		await vscode.window.showQuickPick(items, {
			placeHolder: 'Stale harvester sources — click to inspect',
		});
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		try { clearInterval(this.timer); } catch { /* best-effort */ }
		try { this.commandSub.dispose(); } catch { /* best-effort */ }
		try { this.item.dispose(); } catch { /* best-effort */ }
	}
}

function formatDuration(ms: number): string {
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
