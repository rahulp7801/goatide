/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/transport.spec.ts — Phase 6 (Plan 06-02) MCP-08 transport.

import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startMcpServer, type McpServerHandle } from '../../../mcp/index.js';
import { allocateLoopbackPort, makeBearerToken } from '../../helpers/mcp-fixtures.js';

// Register a single no-op tool so the SDK wires up its tools/list + tools/call handlers.
// Transport-level tests don't care what the tool does — only that the server responds.
function registerPing(server: McpServer): void {
	server.registerTool(
		'ping',
		{ title: 'ping', description: 'transport sanity tool', inputSchema: { msg: z.string().optional() } },
		async () => ({ content: [{ type: 'text', text: 'pong' }] }),
	);
}

describe('MCP-08: StreamableHTTPServerTransport stateful session management', () => {
	let handle: McpServerHandle | null = null;

	afterEach(async () => {
		if (handle) {
			await handle.close();
			handle = null;
		}
	});

	it('MCP-08: stateful mode (sessionIdGenerator returns valid UUID on initialize)', async () => {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		handle = await startMcpServer({
			port,
			bearerToken,
			registerTools: registerPing,
		});

		const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
			requestInit: { headers: { Authorization: `Bearer ${bearerToken}`, Origin: `http://127.0.0.1:${port}` } },
		});
		const client = new Client({ name: 'transport-test', version: '0.0.1' });
		await client.connect(transport);

		// After successful initialize the SDK transport caches the server-issued session ID.
		// The format is a UUID (per StreamableHTTPServerTransport's sessionIdGenerator).
		const sessionId = transport.sessionId;
		expect(sessionId).toBeDefined();
		expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

		await client.close();
	});

	it('MCP-08: session ID round-trips correctly across initialize → tools/list', async () => {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		handle = await startMcpServer({
			port,
			bearerToken,
			registerTools: registerPing,
		});

		const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
			requestInit: { headers: { Authorization: `Bearer ${bearerToken}`, Origin: `http://127.0.0.1:${port}` } },
		});
		const client = new Client({ name: 'transport-roundtrip', version: '0.0.1' });
		await client.connect(transport);

		const initialSession = transport.sessionId;
		expect(initialSession).toBeDefined();

		// Round-trip: tools/list reuses the same session ID. The SDK auto-injects the
		// Mcp-Session-Id header on subsequent requests; if the server rejected it as 404 the
		// listTools call would throw.
		const result = await client.listTools();
		expect(result.tools.map((t) => t.name)).toEqual(['ping']);
		expect(transport.sessionId).toBe(initialSession);

		await client.close();
	});
});
