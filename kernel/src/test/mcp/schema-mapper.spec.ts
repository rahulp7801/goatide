/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/schema-mapper.spec.ts — Phase 6 (Plan 06-05) MCP-04 schema mapper.
//
// Pure pre-processor mapping (provider, toolName, result) -> {candidate_node_kind_hint, body}.
// 4 RULES table covers Slack thread -> DecisionNode, GitHub issue/PR -> OpenQuestion,
// Linear ticket -> ContractNode, Jira ticket -> ContractNode. Mapper is HERMETIC (no I/O,
// no async, no side effects).

import { describe, it, expect } from 'vitest';
import { mapToolResultToCandidate } from '../../mcp/schema-mapper.js';

describe('MCP-04: schema mapper — provider tool payload -> NodeKind candidate hint', () => {
	it('MCP-04: Slack thread payload maps to DecisionNode candidate hint', () => {
		const result = {
			messages: [
				{ user: 'alice', text: 'Should we adopt SQLite WAL mode?' },
				{ user: 'bob', text: 'Yes — gives us readers-writers concurrency' },
				{ user: 'alice', text: 'Decision: enable WAL mode in 0001 migration' },
			],
		};
		const out = mapToolResultToCandidate('slack', 'thread_fetch', result);
		expect(out.candidate_node_kind_hint).toBe('DecisionNode');
		expect(out.body).toContain('alice: Should we adopt SQLite WAL mode?');
		expect(out.body).toContain('bob: Yes');
		expect(out.body).toContain('Decision: enable WAL mode');
	});

	it('MCP-04: GitHub issue/PR maps to OpenQuestion hint', () => {
		const issue = { title: 'Memory leak in canvas tier-dispatch', body: 'After 100 saves the inline tier holds onto AnchorResultCache instances.' };
		const out = mapToolResultToCandidate('github', 'issue_read', issue);
		expect(out.candidate_node_kind_hint).toBe('OpenQuestion');
		expect(out.body).toContain('Memory leak in canvas tier-dispatch');
		expect(out.body).toContain('After 100 saves');

		const pr = { title: 'PR: switch to keytar 8.x', body: 'Closes #42' };
		const outPr = mapToolResultToCandidate('github', 'pull_request_read', pr);
		expect(outPr.candidate_node_kind_hint).toBe('OpenQuestion');
		expect(outPr.body).toContain('PR: switch to keytar 8.x');
	});

	it('MCP-04: Linear ticket maps to ContractNode hint', () => {
		const ticket = { title: 'Phase 6 verification canvas integration', description: 'Wire MCP graph.proposeNode to Verification Canvas events.' };
		const out = mapToolResultToCandidate('linear', 'issue_get', ticket);
		expect(out.candidate_node_kind_hint).toBe('ContractNode');
		expect(out.body).toContain('Phase 6 verification canvas integration');
		expect(out.body).toContain('Wire MCP graph.proposeNode');
	});

	it('MCP-04: Jira ticket maps to ContractNode hint', () => {
		const ticket = { summary: 'GOATIDE-101: keychain rotation', description: 'Rotate provider tokens every 30 days.' };
		const out = mapToolResultToCandidate('jira', 'ticket_get', ticket);
		expect(out.candidate_node_kind_hint).toBe('ContractNode');
		expect(out.body).toContain('GOATIDE-101: keychain rotation');
		expect(out.body).toContain('Rotate provider tokens every 30 days.');
	});

	it('MCP-04: edge cases — empty result + non-matching provider/tool fallback', () => {
		// No-match provider+tool combo: candidate_node_kind_hint=null; body=JSON.stringify(result)
		const fallback = mapToolResultToCandidate('github', 'unknown_tool', { foo: 'bar' });
		expect(fallback.candidate_node_kind_hint).toBeNull();
		expect(fallback.body).toBe(JSON.stringify({ foo: 'bar' }));

		// Empty Slack thread — body extractor returns empty string; hint still set
		const emptyThread = mapToolResultToCandidate('slack', 'thread_fetch', { messages: [] });
		expect(emptyThread.candidate_node_kind_hint).toBe('DecisionNode');
		expect(emptyThread.body).toBe('');

		// Result is a primitive string at the no-match path
		const stringFallback = mapToolResultToCandidate('linear', 'unrelated', 'plain string');
		expect(stringFallback.candidate_node_kind_hint).toBeNull();
		expect(stringFallback.body).toBe('plain string');
	});
});
