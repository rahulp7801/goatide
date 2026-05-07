#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/fixtures/mock-mcp-servers/slack-mock.cjs — Phase 6 hand-rolled stdio
// MCP server fixture for Slack. Used by sc1-slack-thread-decision.spec.ts (Plan 06-07) with
// a deterministic 4-message thread payload demonstrating a decision being made.
//
// CLI args:
//   --mode <normal|revoked|crash>   default 'normal'
//   - 'revoked': respond to tools/call with Slack's invalid_auth shape (used by sc2 in 06-07).
//   - 'crash':   exit 1 immediately after initialize (used by pool isolation tests).
//
// Tools:
//   thread_fetch({channel, thread_ts})  -> {messages: [{user, text, ts, reactions}, ...4]}
//   channel_list()                       -> [{id, name}, ...]
//   message_post({channel, text})        -> {ok: true, ts}

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
				serverInfo: { name: 'slack-mock', version: '0.0.1' },
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
						name: 'thread_fetch',
						description: 'Fetch all messages in a thread',
						inputSchema: {
							type: 'object',
							properties: {
								channel: { type: 'string' },
								thread_ts: { type: 'string' },
							},
							required: ['channel', 'thread_ts'],
						},
					},
					{
						name: 'channel_list',
						description: 'List Slack channels',
						inputSchema: { type: 'object', properties: {} },
					},
					{
						name: 'message_post',
						description: 'Post a message to a channel',
						inputSchema: {
							type: 'object',
							properties: { channel: { type: 'string' }, text: { type: 'string' } },
							required: ['channel', 'text'],
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
					content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'invalid_auth' }) }],
					isError: true,
				},
			});
			return;
		}
		const name = req.params && req.params.name;
		if (name === 'thread_fetch') {
			send({
				jsonrpc: '2.0',
				id: req.id,
				result: {
					content: [{ type: 'text', text: JSON.stringify({
						messages: [
							{ user: 'alice', text: 'we should use postgres for the audit log', ts: '1715000000.000100', reactions: [] },
							{ user: 'bob', text: 'agreed — sqlite stays for the per-project graph; postgres for the multi-tenant audit', ts: '1715000060.000200', reactions: [{ name: '+1', count: 2 }] },
							{ user: 'carol', text: 'lets go with that', ts: '1715000120.000300', reactions: [] },
							{ user: 'alice', text: 'merging today', ts: '1715000180.000400', reactions: [{ name: 'rocket', count: 1 }] },
						],
					}) }],
				},
			});
			return;
		}
		if (name === 'channel_list') {
			send({
				jsonrpc: '2.0',
				id: req.id,
				result: {
					content: [{ type: 'text', text: JSON.stringify([
						{ id: 'C0001', name: 'engineering' },
						{ id: 'C0002', name: 'product' },
					]) }],
				},
			});
			return;
		}
		if (name === 'message_post') {
			send({
				jsonrpc: '2.0',
				id: req.id,
				result: {
					content: [{ type: 'text', text: JSON.stringify({ ok: true, ts: '1715001000.000000' }) }],
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
