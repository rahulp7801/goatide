/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/transport.ts — Phase 6 (Plan 06-02) Streamable HTTP transport.
//
// Per MCP spec 2025-06-18 § Sending Messages, the server runs in STATEFUL mode:
//   sessionIdGenerator: () => randomUUID()
// Session IDs round-trip via the Mcp-Session-Id header (returned on InitializeResult,
// required on subsequent requests). The single /mcp endpoint accepts both POST and GET.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';

/**
 * Construct the MCP transport in stateful mode and connect it to the given McpServer.
 * The returned transport's handleRequest(req, res, body) is the entrypoint for the express
 * app's /mcp route handler.
 */
export async function createMcpTransport(server: McpServer): Promise<StreamableHTTPServerTransport> {
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: () => randomUUID(),
	});
	await server.connect(transport);
	return transport;
}
