/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/integration/sc4-mute-source.spec.ts — Phase 5 Plan 05-08.
//
// ROADMAP SC #4 — "Developer mutes one source (e.g., kills the JSONL watcher) and within
// the source's liveness threshold a status-bar warning appears; per-source accept-rate
// dashboard shows the muted source at zero."
//
// Coverage:
//   (a) Liveness watchdog — record an observation against claude_jsonl at t0; advance the
//       injected clock past the claude_jsonl threshold (overridden to a small value via
//       computeLiveness({thresholds}) for fast advancement); assert getLiveness reports
//       claude_jsonl as stale=true while other sources remain stale=false (cold-start
//       grace).
//   (b) Bridge LivenessBanner state — Plan 05-07 liveness-banner.test.ts already pins the
//       errorBackground/warningBackground rendering via mocked vscode StatusBarItem under
//       jsdom. SC #4 re-asserts the data-shape contract by asserting a stale source surfaces
//       in a way the bridge banner consumes.
//   (c) Per-source accept-rate dashboard — submit some claude_jsonl observations that all
//       reject (filter mismatch); confirm metrics.queryLastDays shows zero promoted_to_node
//       for claude_jsonl (the muted source dashboard shape).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeHarness, submit, type IntegrationHarness } from './_setup.js';
import type { RawObservation } from '../../../harvester/observations.js';

const TEST_NOW_MS = Date.UTC(2026, 4, 8, 12, 0, 0);
const FAST_THRESHOLDS = {
	claude_jsonl: 100,        // 100ms threshold (mute detection within < 1s for tests)
	editor_save: 60_000,
	terminal_shell: 60_000,
	git_commit: 60_000,
} as const;

describe('ROADMAP SC #4 — mute one source → liveness stale + dashboard zero-promoted', () => {
	let harness: IntegrationHarness;

	beforeEach(() => {
		harness = makeHarness({
			now: () => TEST_NOW_MS,
			workspaceFolders: ['/repo'],
		});
	});

	afterEach(() => {
		harness.dispose();
	});

	it('claude_jsonl muted → stale=true past threshold + dashboard zero-promoted; other sources stay healthy', async () => {
		// (a) Record one claude_jsonl observation at t0 to populate the LivenessState map.
		harness.livenessState.recordObservation('claude_jsonl', TEST_NOW_MS - 200);  // 200ms ago, > 100ms threshold
		harness.livenessState.recordObservation('editor_save', TEST_NOW_MS);
		harness.livenessState.recordObservation('git_commit', TEST_NOW_MS);
		// terminal_shell is intentionally never recorded — should stay non-stale via cold-start grace.

		const liveness = harness.livenessState.computeLiveness({
			now: TEST_NOW_MS,
			thresholds: FAST_THRESHOLDS,
		});
		const livenessBySource: Record<string, { stale: boolean; silent_for_ms: number; threshold_ms: number; observed: boolean }> = {};
		for (const r of liveness) {
			livenessBySource[r.source] = {
				stale: r.stale,
				silent_for_ms: r.silent_for_ms,
				threshold_ms: r.threshold_ms,
				observed: r.last_observation_iso !== undefined,
			};
		}

		// (b) Submit some claude_jsonl observations that ALL reject (so promoted_to_node
		// stays zero for claude_jsonl, mirroring a "muted source dashboard" in PORT-06).
		const claudeRejects: RawObservation[] = [
			{
				id: 'sc4-claude-1', ts: '2026-05-08T11:00:00.000Z',
				body: 'This codebase has a beautiful aesthetic.',
				source: 'claude_jsonl', file_path: '/repo/src/x.ts',
			},
			{
				id: 'sc4-claude-2', ts: '2026-05-08T11:01:00.000Z',
				body: 'feels cleaner now',
				source: 'claude_jsonl', file_path: '/repo/src/y.ts',
			},
		];
		for (const obs of claudeRejects) {
			await submit(harness, obs);
		}

		// (c) Inspect per-source dashboard for today.
		const dailyRows = harness.metrics.queryLastDays(1, TEST_NOW_MS);
		const claudeRow = dailyRows.find((r) => r.source === 'claude_jsonl');

		// Assert composite: liveness stale shape + per-source-dashboard shape.
		expect({
			claudeStale: livenessBySource.claude_jsonl?.stale,
			claudeSilent: livenessBySource.claude_jsonl?.silent_for_ms === 200,
			editorNotStale: livenessBySource.editor_save?.stale,
			gitNotStale: livenessBySource.git_commit?.stale,
			terminalNeverObserved: livenessBySource.terminal_shell?.observed,
			terminalNotStale: livenessBySource.terminal_shell?.stale,         // cold-start grace
			claudePromotedZero: claudeRow?.promoted_to_node,
			claudeSubmittedAtLeast: (claudeRow?.submitted ?? 0) >= 2,
		}).toEqual({
			claudeStale: true,
			claudeSilent: true,
			editorNotStale: false,
			gitNotStale: false,
			terminalNeverObserved: false,
			terminalNotStale: false,
			claudePromotedZero: 0,
			claudeSubmittedAtLeast: true,
		});
	});
});
