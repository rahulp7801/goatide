/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/liveness-banner.test.ts
//
// Phase 5 Plan 05-07 TELE-06 — bridge LivenessBanner status-bar item. Polls
// kernel.harvesterGetLiveness on a configurable interval; renders errorBackground when
// any source is stale and warningBackground for low-severity stale-only states; quick-pick
// click target reveals the stale source list.

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { LivenessBanner, type LivenessKernelClient } from '../../../src/harvester/liveness-banner.js';

interface VscodeStatusBarItemSpy {
	text: string;
	tooltip: string | undefined;
	command: string | undefined;
	backgroundColor: { id: string } | undefined;
	visible: boolean;
	disposed: boolean;
}

interface MockKernel extends LivenessKernelClient {
	__setReports(sources: ReturnType<MockKernel['harvesterGetLiveness']> extends Promise<{ sources: infer S }> ? S : never): void;
	__pollCount(): number;
}

function makeMockKernel(): MockKernel {
	let reports: { source: string; stale: boolean; silent_for_ms: number; threshold_ms: number; last_observation_iso?: string }[] = [];
	let pollCount = 0;
	const k: MockKernel = {
		harvesterGetLiveness: async () => {
			pollCount++;
			return { sources: reports };
		},
		__setReports: (s) => { reports = s; },
		__pollCount: () => pollCount,
	};
	return k;
}

function lastStatusBarItem(): VscodeStatusBarItemSpy | undefined {
	// vscode-stub.ts createStatusBarItem returns a fresh stub every call; the banner holds
	// it in its private field. We use a registry trick — stash the items as we create them.
	return undefined;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function makeMockContext(): { subscriptions: { dispose: () => void }[] } {
	return { subscriptions: [] };
}

describe('TELE-06: LivenessBanner', () => {
	let createdItems: VscodeStatusBarItemSpy[];
	let originalCreate: typeof vscode.window.createStatusBarItem;
	let originalShowQuickPick: typeof vscode.window.showQuickPick | undefined;
	let quickPickCalls: unknown[];

	beforeEach(() => {
		createdItems = [];
		quickPickCalls = [];
		// Wrap vscode.window.createStatusBarItem so we can inspect what the banner constructed.
		originalCreate = vscode.window.createStatusBarItem;
		(vscode.window as unknown as { createStatusBarItem: () => VscodeStatusBarItemSpy }).createStatusBarItem = (): VscodeStatusBarItemSpy => {
			// Reuse the stub from vscode-stub by calling original then capturing.
			const item = originalCreate.call(vscode.window) as unknown as VscodeStatusBarItemSpy;
			createdItems.push(item);
			return item;
		};
		// Stub showQuickPick.
		originalShowQuickPick = vscode.window.showQuickPick as typeof vscode.window.showQuickPick;
		(vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<undefined> }).showQuickPick = async (items: unknown): Promise<undefined> => {
			quickPickCalls.push(items);
			return undefined;
		};
	});

	it('polls every poll-interval and transitions to errorBackground when ANY source becomes stale', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		// Seed clean state.
		kernel.__setReports([
			{ source: 'claude_jsonl', stale: false, silent_for_ms: 1000, threshold_ms: 14_400_000 },
			{ source: 'editor_save', stale: false, silent_for_ms: 1000, threshold_ms: 1_800_000 },
		]);

		const banner = new LivenessBanner(kernel, { pollIntervalMs: 30 });
		ctx.subscriptions.push(banner);
		// Allow first poll to land.
		await sleep(50);

		const item = createdItems[0];
		const cleanState = {
			visible: item.visible,
			backgroundColor: item.backgroundColor?.id,
		};

		// Flip a source stale.
		kernel.__setReports([
			{ source: 'claude_jsonl', stale: true, silent_for_ms: 99_999_999, threshold_ms: 14_400_000 },
			{ source: 'editor_save', stale: false, silent_for_ms: 1000, threshold_ms: 1_800_000 },
		]);
		await sleep(50);

		const staleState = {
			visible: item.visible,
			backgroundColor: item.backgroundColor?.id,
			textIncludesStale: item.text.includes('stale') || item.text.includes('Stale'),
		};

		banner.dispose();

		assert.deepStrictEqual({
			cleanState,
			staleState,
			pollsHappened: kernel.__pollCount() >= 2,
		}, {
			cleanState: { visible: false, backgroundColor: undefined },
			staleState: { visible: true, backgroundColor: 'statusBarItem.errorBackground', textIncludesStale: true },
			pollsHappened: true,
		});
	});

	it('click handler shows quickPick of stale sources', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		kernel.__setReports([
			{ source: 'claude_jsonl', stale: true, silent_for_ms: 99_999_999, threshold_ms: 14_400_000 },
			{ source: 'editor_save', stale: false, silent_for_ms: 1000, threshold_ms: 1_800_000 },
			{ source: 'terminal_shell', stale: true, silent_for_ms: 99_999_999, threshold_ms: 14_400_000 },
		]);

		const banner = new LivenessBanner(kernel, { pollIntervalMs: 30 });
		ctx.subscriptions.push(banner);
		await sleep(50);

		// Trigger the banner action explicitly (simulates the user clicking the status-bar item).
		await banner.showStaleSourcesQuickPick();

		banner.dispose();

		assert.equal(quickPickCalls.length, 1, 'expected showQuickPick to be called exactly once');
		const items = quickPickCalls[0] as Array<{ label: string }>;
		assert.deepStrictEqual(
			items.map((i) => i.label).sort(),
			['claude_jsonl', 'terminal_shell'],
			'expected the two stale sources to be presented (sorted alpha)',
		);
	});
});
