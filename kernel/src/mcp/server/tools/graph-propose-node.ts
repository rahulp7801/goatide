/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/tools/graph-propose-node.ts — Phase 6 (Plan 06-05) graph.proposeNode REAL ROUTING.
//
// Plan 06-02 shipped this as a v1 stub returning isError:true with
// structuredContent.error=mcp_external_signal_routing_pending_06_05. Plan 06-05 replaces
// the handler body (NOT the registration site or the schema scope) with real routing through
// routeMcpObservation -> submitRawObservation. The graph.proposeNode contract:
//
//   Input:  { provider, tool_name, result, arguments? }
//   Output (success-shape — Pitfall 11):
//     - accepted=true:  observation routed through Phase-5 cascade + Promoter; rejected_by undefined
//     - accepted=false: filter rejected; rejected_by=<predicate> (e.g. 'credential_scrub')
//   Output (isError:true) is reserved for transient errors (network, exception) — NEVER
//   filter rejection. Filter rejection is a CORRECT outcome (Mandate-A: every observation
//   audited through the same gates as local terminal/git observations).
//
// CONSTITUTIONAL SYMMETRY: external MCP writes go through the EXACT SAME 6-gate cascade
// (credential-scrub -> portable -> net-new -> project-relevant -> verifiable -> justified)
// that local Phase-5 watchers go through. A Slack thread containing 'sk-ant-fake' rejects
// at credential-scrub identically to a local terminal command.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { routeMcpObservation } from '../../clients/observation-router.js';
import type { HarvesterDeps } from '../../../harvester/index.js';

/** Input schema raw shape (SDK's registerTool expects ZodRawShape, not z.object(...)). */
export const GraphProposeNodeInputShape = {
	provider: z.enum(['github', 'slack', 'linear', 'jira']),
	tool_name: z.string(),
	result: z.unknown(),
	arguments: z.unknown().optional(),
} as const;

export interface GraphProposeNodeDeps {
	harvesterDeps: HarvesterDeps;
}

/**
 * Register graph.proposeNode on the McpServer with REAL routing through the Phase-5
 * conveyor. The handler:
 *   1. Calls routeMcpObservation(provider, tool_name, result, arguments, deps).
 *   2. On accept: returns {accepted:true} success-shape.
 *   3. On reject: returns {accepted:false, rejected_by:<predicate>} success-shape (Pitfall 11).
 */
export function registerGraphProposeNodeTool(server: McpServer, deps: GraphProposeNodeDeps): void {
	server.registerTool(
		'graph.proposeNode',
		{
			title: 'Propose a node from external MCP signal',
			description:
				'Routes an external observation through the Phase-5 Portability Filter and Promoter. ' +
				'Filter rejection returns success-shape with structuredContent.rejected_by=<predicate>; ' +
				'tool-level transient errors return isError:true (distinct semantics per Pitfall 11).',
			inputSchema: GraphProposeNodeInputShape,
		},
		async (args) => {
			const { provider, tool_name, result, arguments: toolArgs } = args as {
				provider: 'github' | 'slack' | 'linear' | 'jira';
				tool_name: string;
				result: unknown;
				arguments?: unknown;
			};

			const out = await routeMcpObservation({
				provider,
				tool_name,
				arguments: toolArgs,
				result,
				isError: false,
				deps: deps.harvesterDeps,
			});

			const structuredContent: { accepted: boolean; rejected_by?: string } = out.accepted
				? { accepted: true }
				: { accepted: false, rejected_by: out.predicate };

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(structuredContent),
					},
				],
				structuredContent,
			};
		},
	);
}
