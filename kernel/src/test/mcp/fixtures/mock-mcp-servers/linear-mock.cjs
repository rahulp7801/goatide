#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/fixtures/mock-mcp-servers/linear-mock.cjs — Phase 6 stdio MCP server
// fixture for Linear. Tools: ticket_read({id}) -> deterministic ticket payload.
//
// CLI args:
//   --mode <normal|revoked|crash>   default 'normal'

'use strict';

const args = process.argv.slice(2);
const modeIdx = args.indexOf('--mode');
const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'normal';

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
	buffer += chunk;
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
				serverInfo: { name: 'linear-mock', version: '0.0.1' },
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
						name: 'ticket_read',
						description: 'Read a Linear ticket by id',
						inputSchema: {
							type: 'object',
							properties: { id: { type: 'string' } },
							required: ['id'],
						},
					},
				],
			},
		});
		return;
	}
	if (req.method === 'tools/call') {
		if (mode === 'revoked') {
			send({
				jsonrpc: '2.0',
				id: req.id,
				result: {
					content: [{ type: 'text', text: JSON.stringify({ errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] }) }],
					isError: true,
				},
			});
			return;
		}
		const name = req.params && req.params.name;
		if (name === 'ticket_read') {
			send({
				jsonrpc: '2.0',
				id: req.id,
				result: {
					content: [{ type: 'text', text: JSON.stringify({
						title: 'Implement bitemporal supersede semantics',
						description: 'Cite-eligible nodes must roll forward via dao.supersede; never UPDATE the row directly. Mandate B compliance check.',
						assignee: 'engineer-01',
						state: 'In Progress',
						priority: 'High',
						due_date: '2026-06-01',
					}) }],
				},
			});
			return;
		}
		send({
			jsonrpc: '2.0',
			id: req.id,
			result: { content: [{ type: 'text', text: 'unknown tool: ' + String(name) }], isError: true },
		});
		return;
	}
	send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found' } });
}

function send(msg) {
	process.stdout.write(JSON.stringify(msg) + '\n');
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
