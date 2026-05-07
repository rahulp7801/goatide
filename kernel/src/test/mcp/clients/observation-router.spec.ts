/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/observation-router.spec.ts — Phase 6 (Plan 06-05) MCP-05
// external-signal routing through Phase-5 conveyor.
//
// routeMcpObservation wraps a tool-call result as a RawObservation with source='mcp_external_signal',
// then calls submitRawObservation so the SAME 6-gate filter cascade runs against external MCP
// writes that runs against local terminal/git observations. Pitfall 4: tool-level errors
// (isError:true) are NOT routed.

import { describe, it, expect, vi } from 'vitest';
import { routeMcpObservation } from '../../../mcp/clients/observation-router.js';
import type { HarvesterDeps } from '../../../harvester/index.js';

/** Build a minimal HarvesterDeps that captures every observation submitted to it. */
function makeDepsCaptor(opts?: {
	filterDecision?: { kind: 'accept' } | { kind: 'reject'; predicate: string };
}): {
	deps: HarvesterDeps;
	captured: Array<{ source: string; provider?: string; tool_name?: string; body?: string; detail?: unknown }>;
} {
	const captured: Array<{ source: string; provider?: string; tool_name?: string; body?: string; detail?: unknown }> = [];
	const filterDecision = opts?.filterDecision ?? { kind: 'accept' as const };
	const deps: HarvesterDeps = {
		enrichGit: async () => ({}),
		filter: (obs) => {
			// Capture from the filter callback so we see the post-validation observation shape
			captured.push({
				source: obs.source,
				...(obs.source === 'mcp_external_signal' ? {
					provider: (obs as { provider: string }).provider,
					tool_name: (obs as { tool_name: string }).tool_name,
					body: obs.body,
					detail: (obs as { detail?: unknown }).detail,
				} : {}),
			});
			return filterDecision;
		},
	};
	return { deps, captured };
}

describe('MCP-05: routing MCP tool results into the Phase-5 raw observation pipeline', () => {
	it('MCP-05: mcp_external_signal observation routes through submitRawObservation (Phase-5 6-gate cascade)', async () => {
		const { deps, captured } = makeDepsCaptor();
		const result = await routeMcpObservation({
			provider: 'slack',
			tool_name: 'thread_fetch',
			arguments: { channel: 'C123', thread_ts: '111.222' },
			result: {
				messages: [
					{ user: 'alice', text: 'Decision: ship Phase 6 with 4 providers' },
				],
			},
			deps,
		});

		expect(result.accepted).toBe(true);
		expect(captured).toHaveLength(1);
		expect(captured[0].source).toBe('mcp_external_signal');
		expect(captured[0].provider).toBe('slack');
		expect(captured[0].tool_name).toBe('thread_fetch');
		expect(captured[0].body).toContain('alice: Decision: ship Phase 6');
		expect((captured[0].detail as { candidate_node_kind_hint: string }).candidate_node_kind_hint).toBe('DecisionNode');
	});

	it('MCP-05: credential leak in Slack thread payload caught by credential-scrub gate (Pitfall 4 isError check + Phase-5 gate)', async () => {
		// Simulate that the Phase-5 cascade rejects with predicate='credential_scrub'
		const { deps, captured } = makeDepsCaptor({ filterDecision: { kind: 'reject', predicate: 'credential_scrub' } });

		const result = await routeMcpObservation({
			provider: 'slack',
			tool_name: 'thread_fetch',
			arguments: {},
			result: {
				messages: [
					{ user: 'mallory', text: 'Here is my key: sk-ant-fake-1234567890abcdef' },
				],
			},
			deps,
		});

		expect(result.accepted).toBe(false);
		expect(result.predicate).toBe('credential_scrub');
		// The observation reached the filter (so we know routing happened) but was rejected
		expect(captured).toHaveLength(1);
		expect(captured[0].body).toContain('sk-ant-fake');
	});

	it('MCP-05: tool-level error (isError:true) NOT routed as observation', async () => {
		const { deps, captured } = makeDepsCaptor();
		const filterSpy = vi.spyOn(deps as { filter: unknown } as { filter: (...a: unknown[]) => unknown }, 'filter');

		const result = await routeMcpObservation({
			provider: 'github',
			tool_name: 'issue_read',
			arguments: { owner: 'a', repo: 'b', number: 1 },
			result: { error: 'rate limited' },
			isError: true,
			deps,
		});

		expect(result.accepted).toBe(false);
		expect(result.predicate).toBe('tool_error');
		// Filter never ran — submitRawObservation never invoked
		expect(captured).toHaveLength(0);
		expect(filterSpy).not.toHaveBeenCalled();
	});

	it('MCP-05: Slack thread -> DecisionNode round-trip carries hint to detail.candidate_node_kind_hint', async () => {
		const { deps, captured } = makeDepsCaptor();
		await routeMcpObservation({
			provider: 'slack',
			tool_name: 'thread_fetch',
			arguments: {},
			result: {
				messages: [
					{ user: 'alice', text: 'Should we use Express or Fastify?' },
					{ user: 'bob', text: 'Decision: Express 4.x for v1; reconsider in v2.' },
				],
			},
			deps,
		});

		expect(captured[0].provider).toBe('slack');
		expect((captured[0].detail as { candidate_node_kind_hint: string }).candidate_node_kind_hint).toBe('DecisionNode');
		expect(captured[0].body).toContain('Decision: Express 4.x');
	});

	it('MCP-05: GitHub issue -> OpenQuestion round-trip carries hint to detail.candidate_node_kind_hint', async () => {
		const { deps, captured } = makeDepsCaptor();
		await routeMcpObservation({
			provider: 'github',
			tool_name: 'issue_read',
			arguments: {},
			result: { title: 'Why does pool.spec.ts flake on Windows?', body: 'Drift across runs from snapshot persistence' },
			deps,
		});

		expect(captured[0].provider).toBe('github');
		expect((captured[0].detail as { candidate_node_kind_hint: string }).candidate_node_kind_hint).toBe('OpenQuestion');
		expect(captured[0].body).toContain('Why does pool.spec.ts flake on Windows?');
	});
});
