/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/liveness.spec.ts — Phase 5 Plan 05-07 TELE-06.
//
// Per-source liveness watchdog: recordObservation advances last_observation_ts; computeLiveness
// returns LivenessReport[] including a stale flag once silent_for_ms > threshold; just-started
// kernel does not warn before any observation lands (initial-grace via boot timestamp).

import { describe, it, expect } from 'vitest';
import { LivenessState, DEFAULT_LIVENESS_THRESHOLDS } from '../../harvester/liveness.js';

describe('TELE-06: harvester liveness tracking', () => {
	it('recordObservation advances last_observation_ts; computeLiveness reports silent_for_ms; stale + initial-grace honored', () => {
		// (1) recordObservation advances last_observation_ts (advance test).
		const state1 = new LivenessState(() => 0);
		state1.recordObservation('claude_jsonl', 1000);
		const reports1 = state1.computeLiveness({ now: 2000 });
		const claudeReport1 = reports1.find((r) => r.source === 'claude_jsonl')!;

		// (2) Stale source detected past threshold (override threshold to 100ms).
		const state2 = new LivenessState(() => 0);
		state2.recordObservation('claude_jsonl', 0);
		const reports2 = state2.computeLiveness({ now: 200, thresholds: { claude_jsonl: 100 } });
		const claudeReport2 = reports2.find((r) => r.source === 'claude_jsonl')!;

		// (3) Just-started kernel never warns: never record any observation; stale=false for all.
		const state3 = new LivenessState(() => 1000); // boot at t=1000
		const reports3 = state3.computeLiveness({ now: 100_000 });
		const allStale3 = reports3.map((r) => r.stale);

		// Combined snapshot — minimizes assertions per CLAUDE.md `## Learnings`.
		expect({
			advance_silentMs: claudeReport1.silent_for_ms,
			advance_stale: claudeReport1.stale,
			stale_flag: claudeReport2.stale,
			justStarted_anyStale: allStale3.some((s) => s === true),
			justStarted_count: reports3.length,
			thresholdsExportedKeys: Object.keys(DEFAULT_LIVENESS_THRESHOLDS).sort(),
		}).toEqual({
			advance_silentMs: 1000,
			advance_stale: false,                       // 1s < 4h default threshold
			stale_flag: true,
			justStarted_anyStale: false,                // initial-grace: never recorded -> never stale
			justStarted_count: 5,                       // Phase-5 4 + Phase-6 mcp_external_signal
			thresholdsExportedKeys: ['claude_jsonl', 'editor_save', 'git_commit', 'mcp_external_signal', 'terminal_shell'],
		});
	});
});
