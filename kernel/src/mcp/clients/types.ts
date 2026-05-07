/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/types.ts — Phase 6 (Plan 06-03) shared types for the MCP consume side.
//
// Single source-of-truth for the consume-side MCP type vocabulary used by the pool, the
// per-provider stdio client wrappers, the registry, and the eventual observation router
// (Plan 06-05). Mirror of the test-helper interfaces in kernel/src/test/helpers/mcp-fixtures.ts
// — those are deliberately fixture-only; these are the production types.

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * The 4 MCP providers gateway-consumed in Phase 6 (FORK-08 dogfood-relevant set):
 * GitHub, Slack, Linear, Jira. Adding a 5th provider is a Phase-6-iter task.
 */
export type McpProviderName = 'github' | 'slack' | 'linear' | 'jira';

/**
 * Per-provider stdio transport config. `command` + `args` describe how to spawn the
 * provider's MCP stdio binary; `env` is the additional environment merged with
 * process.env (Pitfall 2: spread process.env first then adapter env to preserve PATH).
 */
export interface McpProviderConfig {
	provider: McpProviderName;
	command: string;
	args: string[];
	env?: Record<string, string>;
	cwd?: string;
}

/**
 * Per-provider state machine. Mirrors the lifecycle of a single stdio MCP client connection:
 *  - 'connecting'    : startProvider in flight (initial or retrying)
 *  - 'connected'     : Client.connect resolved, listTools walked, all tools registered
 *  - 'paused_drift'  : Plan 06-04 schema-drift detected — pool refuses to register tools
 *  - 'paused_auth'   : Plan 06-04 OAuth revocation detected — pool refuses to call tools
 *  - 'restarting'    : transport error caught; runWithBackoff respawning under the hood
 *  - 'closed'        : pool.close() invoked, or maxAttempts+cooldown exhausted
 */
export type ProviderState = 'connecting' | 'connected' | 'paused_drift' | 'paused_auth' | 'restarting' | 'closed';

/**
 * Per-provider handle held by the pool. The generation counter mirrors Plan 04-06's
 * generation-token pattern: every startProvider invocation increments it; stale
 * onerror callbacks (from previously-killed clients) check generation and no-op.
 */
export interface McpClientHandle {
	provider: McpProviderName;
	client: Client;
	transport: StdioClientTransport;
	state: ProviderState;
	generation: number;
}

/**
 * Wire shape for raw observations harvested via MCP tool calls. Plan 06-05 extends
 * RawObservationSchema in kernel/src/harvester/observations.ts with source='mcp_external_signal'
 * and consumes this shape via submitRawObservation.
 *
 * `arguments` is intentionally `unknown` (the union of all provider tool input shapes is
 * effectively open); the per-tool handler validates its own args against inputSchema before
 * dispatching to the SDK Client.
 */
export interface ExternalMcpRawObservation {
	provider: McpProviderName;
	tool_name: string;
	arguments: unknown;
	result: unknown;
	ts: string;
}
