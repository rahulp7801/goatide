/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/schema-mapper.spec.ts — Phase 6 Wave-0 refusal stub for MCP-04.
// Plan 06-05 (schema-mapper + observation routing) flips these.

import { describe, it } from 'vitest';

describe('MCP-04: schema mapper — provider tool payload -> NodeKind candidate hint', () => {
	it.skip('MCP-04: Slack thread payload maps to DecisionNode candidate hint', () => {
		throw new Error('Plan 06-05 has not yet implemented mapSlackThread -> {candidate_node_kind_hint: "Decision"}');
	});

	it.skip('MCP-04: GitHub issue/PR maps to OpenQuestion hint', () => {
		throw new Error('Plan 06-05 has not yet implemented mapGitHubIssue/mapGitHubPR -> {candidate_node_kind_hint: "OpenQuestion"}');
	});

	it.skip('MCP-04: Linear ticket maps to ContractNode hint', () => {
		throw new Error('Plan 06-05 has not yet implemented mapLinearTicket -> {candidate_node_kind_hint: "Contract"}');
	});

	it.skip('MCP-04: Jira ticket maps to ContractNode hint', () => {
		throw new Error('Plan 06-05 has not yet implemented mapJiraTicket -> {candidate_node_kind_hint: "Contract"}');
	});
});
