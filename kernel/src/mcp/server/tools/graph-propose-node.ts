/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/tools/graph-propose-node.ts — Phase 6 (Plan 06-02) graph.proposeNode v1 stub.
//
// v1 STUB: this tool is registered with a real schema but the handler returns
//   {isError: true, structuredContent: {error: 'mcp_external_signal_routing_pending_06_05', retryable: false}}
// per Pitfall 11 (distinct permanent vs transient error semantics). Plan 06-05 replaces the
// stub with a real submitRawObservation routing once the `mcp_external_signal` source is
// added to the Phase-5 RawObservationSchema discriminated union.
//
// The stub registers the schema NOW so SDK clients can discover the tool via tools/list and
// see the eventual input contract; the response is permanently-not-retryable so well-behaved
// clients don't retry on transient assumption.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const GraphProposeNodeInputShape = {
	kind: z.string(),
	body: z.string(),
	anchor: z.record(z.unknown()).optional(),
	provenance: z
		.object({
			source: z.string().optional(),
			actor: z.string().optional(),
			detail: z.record(z.unknown()).optional(),
		})
		.optional(),
} as const;

/**
 * Register the v1-stub graph.proposeNode tool. Plan 06-05 replaces the body of the handler
 * (NOT the registration site or the schema) once mcp_external_signal lands.
 */
export function registerGraphProposeNodeTool(server: McpServer): void {
	server.registerTool(
		'graph.proposeNode',
		{
			title: 'Propose a node from external MCP signal',
			description:
				'Routes an external observation through the Phase-5 Portability Filter cascade. ' +
				'v1 STUB: routing is pending Plan 06-05 — this tool currently returns isError:true with ' +
				'structuredContent.error=mcp_external_signal_routing_pending_06_05 (retryable:false).',
			inputSchema: GraphProposeNodeInputShape,
		},
		async () => ({
			content: [
				{
					type: 'text' as const,
					text: 'graph.proposeNode routing pending Plan 06-05.',
				},
			],
			isError: true,
			structuredContent: {
				error: 'mcp_external_signal_routing_pending_06_05',
				retryable: false,
			},
		}),
	);
}
