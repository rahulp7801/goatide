/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/pool.spec.ts — Phase 6 (Plan 06-03) MCP-01 multi-client pool.
//
// Tests use the REAL @modelcontextprotocol/sdk Client + StdioClientTransport against the
// hand-rolled stdio mock fixtures (kernel/src/test/mcp/fixtures/mock-mcp-servers/<provider>-mock.cjs).
// This is the strongest possible integration test: real SDK over real stdio against a real
// fixture process, only the upstream provider boundary is mocked.

import { describe, expect, it } from 'vitest';

import { McpClientPool } from '../../../mcp/clients/pool.js';
import { ToolRegistry } from '../../../mcp/registry.js';
import { makeProviderConfig } from '../../helpers/mcp-fixtures.js';
import type { McpProviderConfig, McpProviderName } from '../../../mcp/clients/types.js';

const ALL_PROVIDERS: McpProviderName[] = ['github', 'slack', 'linear', 'jira'];

function fourProviderConfigs(modes?: Partial<Record<McpProviderName, 'normal' | 'crash' | 'revoked'>>): McpProviderConfig[] {
	return ALL_PROVIDERS.map(p => {
		const cfg = makeProviderConfig({ provider: p });
		const mode = modes?.[p] ?? 'normal';
		// Each fixture accepts `--mode <normal|crash|revoked>` as positional CLI args after the .cjs path.
		return { ...cfg, args: [...cfg.args, '--mode', mode] };
	});
}

describe('MCP-01: client pool starts and supervises 4 stdio MCP clients', () => {
	it('MCP-01: pool starts 4 stdio Clients via SDK; each connects to its own mock server', async () => {
		const registry = new ToolRegistry();
		const observations: unknown[] = [];
		const pool = new McpClientPool({
			configs: fourProviderConfigs(),
			registry,
			onObservation: async (o) => { observations.push(o); },
		});
		await pool.start();
		try {
			const states = ALL_PROVIDERS.map(p => pool.getProviderState(p));
			const toolNames = registry.listAll().map(e => e.name).sort();
			expect({
				states,
				toolsByProvider: {
					github: toolNames.filter(n => n.startsWith('github__')),
					slack: toolNames.filter(n => n.startsWith('slack__')),
					linear: toolNames.filter(n => n.startsWith('linear__')),
					jira: toolNames.filter(n => n.startsWith('jira__')),
				},
			}).toEqual({
				states: ['connected', 'connected', 'connected', 'connected'],
				toolsByProvider: {
					github: ['github__issue_list', 'github__issue_read'],
					slack: ['slack__channel_list', 'slack__message_post', 'slack__thread_fetch'],
					linear: ['linear__ticket_read'],
					jira: ['jira__ticket_read'],
				},
			});
		} finally {
			await pool.close();
		}
	}, 15_000);

	it('MCP-01: per-provider failure isolation: Slack mock crashes; GitHub/Linear/Jira keep running', async () => {
		const registry = new ToolRegistry();
		const pool = new McpClientPool({
			configs: fourProviderConfigs({ slack: 'crash' }),
			registry,
			onObservation: async () => undefined,
			// Tighter retry policy so the failing provider gives up quickly inside the test budget.
			backoff: { maxAttempts: 2, baseMs: 5, cooldownMs: 5 },
		});
		await pool.start();
		// Wait for the test fixture race to settle: the slack-mock's `--mode crash` does
		// `setTimeout(() => process.exit(1), 10)` AFTER responding to initialize, so the
		// SDK may report 'connected' for slack briefly before the close event surfaces.
		// Poll until (a) all 3 healthy providers reach 'connected' and (b) slack reaches
		// any non-connected state.
		const deadline = Date.now() + 8_000;
		while (Date.now() < deadline) {
			const healthyAllConnected = (['github', 'linear', 'jira'] as const).every(p => pool.getProviderState(p) === 'connected');
			const slackUnhealthy = pool.getProviderState('slack') !== 'connected';
			if (healthyAllConnected && slackUnhealthy) {
				break;
			}
			await new Promise(r => setTimeout(r, 25));
		}
		try {
			const states = {
				github: pool.getProviderState('github'),
				slack: pool.getProviderState('slack'),
				linear: pool.getProviderState('linear'),
				jira: pool.getProviderState('jira'),
			};
			const slackTools = registry.listByProvider('slack').length;
			expect({
				healthy: { github: states.github, linear: states.linear, jira: states.jira },
				slackUnhealthy: states.slack !== 'connected',
				slackToolsLandedDespiteCrash: slackTools <= 3, // it may or may not have completed listTools depending on race; key is the OTHERS are healthy
				ghTools: registry.listByProvider('github').length,
				linearTools: registry.listByProvider('linear').length,
				jiraTools: registry.listByProvider('jira').length,
			}).toEqual({
				healthy: { github: 'connected', linear: 'connected', jira: 'connected' },
				slackUnhealthy: true,
				slackToolsLandedDespiteCrash: true,
				ghTools: 2,
				linearTools: 1,
				jiraTools: 1,
			});
		} finally {
			await pool.close();
		}
	}, 15_000);

	it('MCP-01: pool.close() gracefully closes all clients (stdin-close → SIGTERM)', async () => {
		const registry = new ToolRegistry();
		const pool = new McpClientPool({
			configs: fourProviderConfigs(),
			registry,
			onObservation: async () => undefined,
		});
		await pool.start();
		await pool.close();
		const states = ALL_PROVIDERS.map(p => pool.getProviderState(p));
		expect(states).toEqual(['closed', 'closed', 'closed', 'closed']);
	}, 15_000);

	it('MCP-01: startProvider with backoff retries on transient transport error', async () => {
		// We exercise this at the unit level with an injected stdio-client factory. Real
		// retry-against-stdio is non-deterministic (depends on OS spawn timing); the unit
		// path verifies the backoff loop wires startProvider correctly.
		const registry = new ToolRegistry();
		let attempts = 0;
		const pool = new McpClientPool({
			configs: [makeProviderConfig({ provider: 'github' })],
			registry,
			onObservation: async () => undefined,
			backoff: { maxAttempts: 5, baseMs: 1, cooldownMs: 1 },
			// Inject a fake stdio-client factory: first 2 attempts throw, third succeeds.
			stdioFactory: async () => {
				attempts++;
				if (attempts < 3) {
					throw new Error(`transient-${attempts}`);
				}
				// Return a fake handle. The pool uses listTools + callTool only; mock both.
				const fakeClient: any = {
					listTools: async () => ({ tools: [{ name: 'issue_read', inputSchema: { type: 'object', properties: {} } }] }),
					callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
					close: async () => undefined,
				};
				return { client: fakeClient, transport: {} as never };
			},
		});
		await pool.start();
		try {
			expect({
				attempts,
				state: pool.getProviderState('github'),
				registered: registry.listByProvider('github').map(r => r.originalName),
			}).toEqual({
				attempts: 3,
				state: 'connected',
				registered: ['issue_read'],
			});
		} finally {
			await pool.close();
		}
	}, 15_000);
});
