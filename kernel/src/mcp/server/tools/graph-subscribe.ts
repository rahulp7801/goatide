/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/tools/graph-subscribe.ts — Phase 6 (Plan 06-02) graph.subscribe v1 stub.
//
// graph.subscribe is the eventual real-time graph-mutation push surface (DEEP-* roadmap). v1
// ships a permanent-not-supported stub per Pitfall 11 (distinct permanent vs transient error
// semantics): structuredContent.retryable=false so clients don't burn retries hoping it will
// come online during a session.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register the v1-stub graph.subscribe tool. The handler returns isError:true with
 * structuredContent.error=method_not_supported and retryable:false.
 */
export function registerGraphSubscribeTool(server: McpServer): void {
	server.registerTool(
		'graph.subscribe',
		{
			title: 'Subscribe to graph mutations (v1 stub)',
			description:
				'Real-time mutation streaming is a v1.x roadmap target (DEEP-*). v1 returns a permanent ' +
				'method_not_supported with retryable:false so clients fall through to graph.query polling.',
		},
		async () => ({
			content: [
				{
					type: 'text' as const,
					text: 'graph.subscribe is not yet supported in v1; see ROADMAP DEEP-* for v1.x.',
				},
			],
			isError: true,
			structuredContent: {
				error: 'method_not_supported',
				retryable: false,
			},
		}),
	);
}
