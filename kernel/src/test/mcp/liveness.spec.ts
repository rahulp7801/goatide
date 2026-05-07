/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/liveness.spec.ts — Phase 6 (Plan 06-06) MCP-06 per-provider liveness tests.
//
// Plan 06-06 flips these stubs to live assertions. The kernel-side liveness extension reuses
// Phase-5 LivenessState; tests confirm: (1) recordMcpObservation advances last_observation_ts
// for mcp.<provider> sources; (2) computeMcpLiveness flags mcp.slack stale past 1h threshold
// with an injected clock; (3) the merged report includes per-provider entries readable by the
// bridge.

import { describe, it, expect } from 'vitest';
import { LivenessState } from '../../harvester/liveness.js';
import {
	DEFAULT_MCP_LIVENESS_THRESHOLDS,
	MCP_LIVENESS_KEYS,
	computeMcpLiveness,
	mcpLivenessSourceKey,
	recordMcpObservation,
} from '../../mcp/liveness.js';

describe('MCP-06: per-provider liveness — extends Phase-5 LivenessState with mcp.<provider> sources', () => {
	it('MCP-06: mcp.<provider> sources extend Phase-5 LivenessState (advance + report keys + thresholds)', () => {
		const state = new LivenessState(() => 0);

		// (1) recordMcpObservation advances last_observation_ts per provider.
		recordMcpObservation(state, 'github', 1000);
		recordMcpObservation(state, 'slack', 2000);

		// (3) computeMcpLiveness merges Phase-5 sources + 4 mcp.* sources for the bridge.
		const reports = computeMcpLiveness({ state, now: 5000 });
		const mcpEntries = reports.filter((r) => MCP_LIVENESS_KEYS.includes(String(r.source)));
		const findBySource = (key: string) => mcpEntries.find((r) => String(r.source) === key);
		const githubEntry = findBySource('mcp.github');
		const slackEntry = findBySource('mcp.slack');
		const linearEntry = findBySource('mcp.linear');
		const jiraEntry = findBySource('mcp.jira');

		// Combined snapshot — minimizes assertions per CLAUDE.md `## Learnings`.
		expect({
			thresholdKeys: Object.keys(DEFAULT_MCP_LIVENESS_THRESHOLDS).sort(),
			mcpLivenessKeys: [...MCP_LIVENESS_KEYS],
			canonicalKey: mcpLivenessSourceKey('slack'),
			mcpEntryCount: mcpEntries.length,
			githubSilentMs: githubEntry?.silent_for_ms,
			githubStale: githubEntry?.stale,
			slackSilentMs: slackEntry?.silent_for_ms,
			slackStale: slackEntry?.stale,
			linearStale: linearEntry?.stale,             // never observed → initial-grace, false
			jiraStale: jiraEntry?.stale,                 // never observed → initial-grace, false
			defaultThresholdMs: DEFAULT_MCP_LIVENESS_THRESHOLDS.slack,
		}).toEqual({
			thresholdKeys: ['github', 'jira', 'linear', 'slack'],
			mcpLivenessKeys: ['mcp.github', 'mcp.jira', 'mcp.linear', 'mcp.slack'],
			canonicalKey: 'mcp.slack',
			mcpEntryCount: 4,
			githubSilentMs: 4000,                         // 5000 - 1000
			githubStale: false,                           // 4s < 1h default
			slackSilentMs: 3000,                          // 5000 - 2000
			slackStale: false,
			linearStale: false,
			jiraStale: false,
			defaultThresholdMs: 60 * 60 * 1000,
		});
	});

	it('MCP-06: mcp.slack stale beyond threshold (default 1h) flags warning', () => {
		const state = new LivenessState(() => 0);
		recordMcpObservation(state, 'slack', 1000);
		// Advance the clock 2h past the observation; default threshold is 1h.
		const reports = computeMcpLiveness({
			state,
			now: 1000 + 2 * 60 * 60 * 1000,
		});
		const slackEntry = reports.find((r) => String(r.source) === 'mcp.slack');
		expect({
			source: String(slackEntry?.source ?? ''),
			stale: slackEntry?.stale,
			threshold_ms: slackEntry?.threshold_ms,
			silent_above_threshold: (slackEntry?.silent_for_ms ?? 0) > (slackEntry?.threshold_ms ?? 0),
		}).toEqual({
			source: 'mcp.slack',
			stale: true,
			threshold_ms: 60 * 60 * 1000,
			silent_above_threshold: true,
		});
	});

	it('MCP-06: liveness reports per-provider state for status-bar consumption', () => {
		const state = new LivenessState(() => 0);
		recordMcpObservation(state, 'github', 100);
		// linear/jira/slack never observed — initial-grace keeps them non-stale.
		const reports = computeMcpLiveness({ state, now: 5000 });
		const map = new Map(reports.filter((r) => MCP_LIVENESS_KEYS.includes(String(r.source)))
			.map((r) => [String(r.source), { stale: r.stale, hasLastIso: !!r.last_observation_iso }] as const));
		expect({
			github: map.get('mcp.github'),
			slack: map.get('mcp.slack'),
			linear: map.get('mcp.linear'),
			jira: map.get('mcp.jira'),
		}).toEqual({
			github: { stale: false, hasLastIso: true },
			slack: { stale: false, hasLastIso: false },
			linear: { stale: false, hasLastIso: false },
			jira: { stale: false, hasLastIso: false },
		});
	});
});
