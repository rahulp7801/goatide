#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/fixtures/mock-mcp-servers/github-mock.cjs — Phase 6 hand-rolled
// stdio MCP server fixture (CommonJS, NO @modelcontextprotocol/sdk dependency — deliberately
// mirrors what a real provider stdio binary looks like to the SDK Client).
//
// Spec: MCP 2025-06-18, JSON-RPC 2.0 framing over stdin/stdout. Two framing variants are
// accepted on input: Content-Length-prefixed (LSP-style) and line-delimited JSON (the
// SDK's StdioClientTransport uses line-delimited).
//
// CLI args:
//   --mode <normal|revoked|crash>   default 'normal'
//
// Tools exposed:
//   issue_read({issue_number})  -> {title, body, state, labels, html_url}
//   issue_list({state})         -> [{title, number, state, html_url}, ...]

'use strict';

const args = process.argv.slice(2);
const modeIdx = args.indexOf('--mode');
const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'normal';

// JSON-RPC framing over stdio. line-delimited (matches SDK StdioClientTransport).
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
	buffer += chunk;
	// Try Content-Length framing first (LSP-style), then fall back to line-delimited.
	while (true) {
		const clMatch = buffer.match(/^Content-Length: (\d+)\r\n\r\n/);
		if (clMatch) {
			const headerLen = clMatch[0].length;
			const bodyLen = parseInt(clMatch[1], 10);
			if (buffer.length < headerLen + bodyLen) {
				return;
			}
			const body = buffer.slice(headerLen, headerLen + bodyLen);
			buffer = buffer.slice(headerLen + bodyLen);
			handleFrame(body);
			continue;
		}
		const nlIdx = buffer.indexOf('\n');
		if (nlIdx < 0) {
			return;
		}
		const line = buffer.slice(0, nlIdx).trim();
		buffer = buffer.slice(nlIdx + 1);
		if (line) {
			handleFrame(line);
		}
	}
});

function handleFrame(raw) {
	let req;
	try {
		req = JSON.parse(raw);
	} catch {
		return;
	}
	if (req.method === 'initialize') {
		send({
			jsonrpc: '2.0',
			id: req.id,
			result: {
				protocolVersion: '2025-06-18',
				serverInfo: { name: 'github-mock', version: '0.0.1' },
				capabilities: { tools: {} },
			},
		});
		if (mode === 'crash') {
			setTimeout(() => process.exit(1), 10);
		}
		return;
	}
	if (req.method === 'tools/list') {
		send({
			jsonrpc: '2.0',
			id: req.id,
			result: {
				tools: [
					{
						name: 'issue_read',
						description: 'Read a GitHub issue by number',
						inputSchema: {
							type: 'object',
							properties: { issue_number: { type: 'integer' } },
							required: ['issue_number'],
						},
					},
					{
						name: 'issue_list',
						description: 'List GitHub issues by state',
						inputSchema: {
							type: 'object',
							properties: { state: { type: 'string', enum: ['open', 'closed', 'all'] } },
							required: ['state'],
						},
					},
				],
			},
		});
		return;
	}
	if (req.method === 'tools/call') {
		const name = req.params && req.params.name;
		if (name === 'issue_read') {
			send({
				jsonrpc: '2.0',
				id: req.id,
				result: {
					content: [{ type: 'text', text: JSON.stringify({
						title: 'Saving graph-of-record after every successful save',
						body: 'We should persist the active-set after each save. Open question: what about partial saves?',
						state: 'open',
						labels: ['question', 'graph'],
						html_url: 'https://github.com/example/repo/issues/42',
					}) }],
				},
			});
			return;
		}
		if (name === 'issue_list') {
			send({
				jsonrpc: '2.0',
				id: req.id,
				result: {
					content: [{ type: 'text', text: JSON.stringify([
						{ title: 'Issue A', number: 1, state: 'open', html_url: 'https://github.com/example/repo/issues/1' },
						{ title: 'Issue B', number: 2, state: 'open', html_url: 'https://github.com/example/repo/issues/2' },
					]) }],
				},
			});
			return;
		}
		send({
			jsonrpc: '2.0',
			id: req.id,
			result: {
				content: [{ type: 'text', text: 'unknown tool: ' + String(name) }],
				isError: true,
			},
		});
		return;
	}
	// Unknown method.
	send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found' } });
}

function send(msg) {
	process.stdout.write(JSON.stringify(msg) + '\n');
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
