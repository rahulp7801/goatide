/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/schema-mapper.ts — Phase 6 (Plan 06-05) MCP-04 schema mapper.
//
// Pure pre-processor mapping (provider, toolName, result) -> {candidate_node_kind_hint, body}.
// HERMETIC: no I/O, no side effects, no async. Easy to unit-test against fixture inputs.
//
// The candidate_node_kind_hint goes into the observation's detail.candidate_node_kind_hint
// field; never bypasses the Phase-5 PORT-04 Promoter (Mandate-A — auditable+replayable
// classification). Plan 06-07's sc1 integration spec exercises end-to-end via the actual
// SDK Client + Slack mock fixture + Phase-5 conveyor.
//
// RULES table (4 providers):
//   slack/thread*     -> DecisionNode   (channel discussions resolve to decisions)
//   github/issue|pr   -> OpenQuestion   (issues + PRs surface unresolved questions)
//   linear/issue|tkt  -> ContractNode   (Linear tickets are contracts)
//   jira/issue|tkt    -> ContractNode   (Jira tickets are contracts)
//
// Default fallback: candidate_node_kind_hint=null, body=string-ified result. The Promoter
// classifies regardless; the hint is purely an optional bias.

import type { McpProviderName } from './clients/types.js';

/**
 * The 4 NodeKinds the schema-mapper may hint at. Subset of `NodeKind` from
 * kernel/src/graph/schema/nodes.ts — `Attempt` is deliberately excluded because external
 * MCP signals never seed Attempt nodes (Attempts are set by the Verification Canvas, never
 * via the harvester / Promoter path per Phase-5 Plan 05-06).
 */
export type CandidateNodeKindHint = 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion';

/** A single rule in the mapper RULES table. Provider + tool-name regex selects the rule;
 *  candidate is the NodeKind hint; bodyExtractor turns the tool-call result into a
 *  human-readable body string the Promoter can classify on. */
interface MapperRule {
	provider: McpProviderName;
	toolNamePattern: RegExp;
	candidate: CandidateNodeKindHint;
	bodyExtractor: (toolResult: unknown) => string;
}

const RULES: ReadonlyArray<MapperRule> = [
	{ provider: 'slack', toolNamePattern: /thread/, candidate: 'DecisionNode', bodyExtractor: extractSlackThread },
	{ provider: 'github', toolNamePattern: /issue|pr|pull_request/, candidate: 'OpenQuestion', bodyExtractor: extractGitHubIssueOrPR },
	{ provider: 'linear', toolNamePattern: /issue|ticket/, candidate: 'ContractNode', bodyExtractor: extractLinearTicket },
	{ provider: 'jira', toolNamePattern: /issue|ticket/, candidate: 'ContractNode', bodyExtractor: extractJiraTicket },
];

export interface MapToolResultOutput {
	candidate_node_kind_hint: CandidateNodeKindHint | null;
	body: string;
}

/**
 * Map a provider tool-call result to a (NodeKind hint, body) pair. The hint is nullable —
 * unmatched (provider, toolName) combos return null with body=JSON.stringify(result) so the
 * Promoter can still classify (just without bias).
 */
export function mapToolResultToCandidate(
	provider: McpProviderName,
	toolName: string,
	result: unknown,
): MapToolResultOutput {
	for (const rule of RULES) {
		if (rule.provider === provider && rule.toolNamePattern.test(toolName)) {
			return { candidate_node_kind_hint: rule.candidate, body: rule.bodyExtractor(result) };
		}
	}
	return {
		candidate_node_kind_hint: null,
		body: typeof result === 'string' ? result : JSON.stringify(result),
	};
}

// ---------------------------------------------------------------------------------------------
// Per-provider body extractors. Each is forgiving: missing fields collapse to empty strings
// so the Promoter sees a stable shape. The result is intentionally typed `unknown` — these
// are the real-world fixture shapes from the 4 mock servers (kernel/src/test/mcp/fixtures/
// mock-mcp-servers/) which mirror upstream provider tool result schemas.
// ---------------------------------------------------------------------------------------------

function extractSlackThread(r: unknown): string {
	const messages = (r as { messages?: Array<{ user?: string; text?: string }> }).messages ?? [];
	return messages.map((m) => `${m.user ?? ''}: ${m.text ?? ''}`).join('\n');
}

function extractGitHubIssueOrPR(r: unknown): string {
	const x = r as { title?: string; body?: string };
	return [x.title, x.body].filter((s): s is string => typeof s === 'string' && s.length > 0).join('\n\n');
}

function extractLinearTicket(r: unknown): string {
	const x = r as { title?: string; description?: string };
	return [x.title, x.description].filter((s): s is string => typeof s === 'string' && s.length > 0).join('\n\n');
}

function extractJiraTicket(r: unknown): string {
	const x = r as { summary?: string; description?: string };
	return [x.summary, x.description].filter((s): s is string => typeof s === 'string' && s.length > 0).join('\n\n');
}
