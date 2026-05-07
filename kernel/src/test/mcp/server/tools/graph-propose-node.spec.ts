/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/tools/graph-propose-node.spec.ts — Phase 6 (Plan 06-05)
// MCP-09 + MCP-05 graph.proposeNode REAL ROUTING.
//
// Plan 06-02 shipped graph.proposeNode as a stub returning isError:true with
// structuredContent.error=mcp_external_signal_routing_pending_06_05. Plan 06-05 replaces
// the stub with real routing through routeMcpObservation -> submitRawObservation.
//
// Two paths verified:
//  (a) Accepted: tool result reaches the Phase-5 cascade and (when conditions allow) seeds
//      an Inferred node. Test uses an injected synthetic filter that always accepts so the
//      test doesn't need the full filter+promoter+DAO stack — the routing contract is the
//      thing under test.
//  (b) Rejected: credential-leak in the proposed body returns success-shape with
//      structuredContent.rejected_by=<predicate> (Pitfall 11 — filter rejection is a
//      CORRECT outcome, NOT a tool-level isError).

import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMcpServer, type McpServerHandle } from '../../../../mcp/index.js';
import { registerGraphProposeNodeTool } from '../../../../mcp/server/tools/graph-propose-node.js';
import { allocateLoopbackPort, makeBearerToken } from '../../../helpers/mcp-fixtures.js';
import type { HarvesterDeps } from '../../../../harvester/index.js';

describe('MCP-09 + MCP-05: graph.proposeNode tool routes through Phase-5 conveyor', () => {
	let cleanup: (() => Promise<void>) | null = null;

	afterEach(async () => {
		if (cleanup) {
			await cleanup();
			cleanup = null;
		}
	});

	async function startProposeServer(harvesterDeps: HarvesterDeps): Promise<{ client: Client; handle: McpServerHandle }> {
		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		const handle: McpServerHandle = await startMcpServer({
			port,
			bearerToken,
			registerTools: (server) => registerGraphProposeNodeTool(server, { harvesterDeps }),
		});
		const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
			requestInit: { headers: { Authorization: `Bearer ${bearerToken}`, Origin: `http://127.0.0.1:${port}` } },
		});
		const client = new Client({ name: 'graph-propose-spec', version: '0.0.1' });
		await client.connect(transport);

		cleanup = async () => {
			await client.close();
			await handle.close();
		};

		return { client, handle };
	}

	it('MCP-05: accepted path — Slack thread tool result routes through Phase-5 cascade', async () => {
		const captured: Array<{ source: string; provider?: string; body?: string }> = [];
		const harvesterDeps: HarvesterDeps = {
			enrichGit: async () => ({}),
			filter: (obs) => {
				captured.push({
					source: obs.source,
					...(obs.source === 'mcp_external_signal' ? {
						provider: (obs as { provider: string }).provider,
						body: obs.body,
					} : {}),
				});
				return { kind: 'accept' };
			},
		};

		const { client } = await startProposeServer(harvesterDeps);

		const result = await client.callTool({
			name: 'graph.proposeNode',
			arguments: {
				provider: 'slack',
				tool_name: 'thread_fetch',
				result: {
					messages: [
						{ user: 'alice', text: 'Decision: ship Phase 6 with 4 providers' },
					],
				},
			},
		});

		expect(result.isError).toBeFalsy();
		const sc = result.structuredContent as { accepted: boolean; rejected_by?: string };
		expect(sc.accepted).toBe(true);
		expect(sc.rejected_by).toBeUndefined();
		expect(captured).toHaveLength(1);
		expect(captured[0].source).toBe('mcp_external_signal');
		expect(captured[0].provider).toBe('slack');
		expect(captured[0].body).toContain('alice: Decision: ship Phase 6');
	});

	it('MCP-05: rejected path — filter-rejection returns success-shape with structuredContent.rejected_by (Pitfall 11)', async () => {
		// Inject a synthetic filter that rejects with credential_scrub predicate
		const harvesterDeps: HarvesterDeps = {
			enrichGit: async () => ({}),
			filter: () => ({ kind: 'reject', predicate: 'credential_scrub', reason: 'sk-ant-fake detected' }),
		};

		const { client } = await startProposeServer(harvesterDeps);

		const result = await client.callTool({
			name: 'graph.proposeNode',
			arguments: {
				provider: 'slack',
				tool_name: 'thread_fetch',
				result: {
					messages: [
						{ user: 'mallory', text: 'My key: sk-ant-fake-1234567890abcdef' },
					],
				},
			},
		});

		// Filter rejection is a CORRECT outcome (Pitfall 11) — NOT isError:true
		expect(result.isError).toBeFalsy();
		const sc = result.structuredContent as { accepted: boolean; rejected_by?: string };
		expect(sc.accepted).toBe(false);
		expect(sc.rejected_by).toBe('credential_scrub');
	});
});
