/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/http-server.spec.ts — Phase 6 (Plan 06-02) MCP-08 server bind +
// Origin allowlist + bearer-token gate.

import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startMcpServer, type McpServerHandle } from '../../../mcp/index.js';
import { allocateLoopbackPort, makeBearerToken } from '../../helpers/mcp-fixtures.js';

function registerPing(server: McpServer): void {
	server.registerTool(
		'ping',
		{ title: 'ping', description: 'transport sanity tool', inputSchema: { msg: z.string().optional() } },
		async () => ({ content: [{ type: 'text', text: 'pong' }] }),
	);
}

/**
 * Build a minimal MCP initialize JSON-RPC body. The server requires a complete InitializeRequest
 * before any other method is allowed (per MCP spec) — but the bearer/Origin middlewares run BEFORE
 * the transport sees the body, so a pseudo-initialize body suffices for middleware tests.
 */
function initializeBody(): unknown {
	return {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'http-spec', version: '0.0.1' },
		},
	};
}

describe('MCP-08: Streamable HTTP server binding & origin allowlist', () => {
	let handle: McpServerHandle | null = null;

	afterEach(async () => {
		if (handle) {
			await handle.close();
			handle = null;
		}
	});

	it('MCP-08: binds 127.0.0.1 (constitutional pin — never any-interface)', async () => {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		handle = await startMcpServer({ port, bearerToken, registerTools: registerPing });
		expect(handle.port).toBe(port);

		// Loopback-bound server is reachable over 127.0.0.1.
		const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json, text/event-stream',
				'Authorization': `Bearer ${bearerToken}`,
				'Origin': `http://127.0.0.1:${port}`,
			},
			body: JSON.stringify(initializeBody()),
		});
		expect(res.status).toBe(200);
	});

	it('MCP-08: rejects request with Origin: http://localhost.evil.com (Pitfall 1 subdomain attack)', async () => {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		handle = await startMcpServer({ port, bearerToken, registerTools: registerPing });

		const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${bearerToken}`,
				'Origin': 'http://localhost.evil.com',
			},
			body: JSON.stringify(initializeBody()),
		});
		expect(res.status).toBe(403);
		const body = await res.json() as { error: string };
		expect(body.error).toBe('origin_not_allowed');
	});

	it('MCP-08: allows http://127.0.0.1 + http://localhost in allowlist Set', async () => {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		handle = await startMcpServer({ port, bearerToken, registerTools: registerPing });

		// http://127.0.0.1:<port> is on the allowlist — initialize succeeds.
		const res1 = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json, text/event-stream',
				'Authorization': `Bearer ${bearerToken}`,
				'Origin': `http://127.0.0.1:${port}`,
			},
			body: JSON.stringify(initializeBody()),
		});
		expect(res1.status).toBe(200);

		// http://localhost (no port) is on the allowlist — request is NOT 403'd by the Origin
		// gate. (The transport may return another non-2xx because the session is already
		// initialized in this test process; what we care about is that the Origin gate doesn't
		// short-circuit with 403 origin_not_allowed.)
		const res2 = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json, text/event-stream',
				'Authorization': `Bearer ${bearerToken}`,
				'Origin': 'http://localhost',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }),
		});
		expect(res2.status).not.toBe(403);
		if (res2.headers.get('content-type')?.includes('application/json')) {
			const body = await res2.json() as { error?: string };
			expect(body.error).not.toBe('origin_not_allowed');
		}
	});

	it('MCP-08: rejects request with no Authorization header (401 missing_bearer)', async () => {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		handle = await startMcpServer({ port, bearerToken, registerTools: registerPing });

		const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Origin': `http://127.0.0.1:${port}`,
			},
			body: JSON.stringify(initializeBody()),
		});
		expect(res.status).toBe(401);
		const body = await res.json() as { error: string };
		expect(body.error).toBe('missing_bearer');
	});

	it('MCP-08: rejects request with wrong bearer token (401 invalid_bearer; timingSafeEqual)', async () => {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		handle = await startMcpServer({ port, bearerToken, registerTools: registerPing });

		// Same length as the real token (so we exercise the timingSafeEqual path) but wrong.
		const wrong = '0'.repeat(bearerToken.length);
		const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${wrong}`,
				'Origin': `http://127.0.0.1:${port}`,
			},
			body: JSON.stringify(initializeBody()),
		});
		expect(res.status).toBe(401);
		const body = await res.json() as { error: string };
		expect(body.error).toBe('invalid_bearer');
	});
});
