/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/pool.spec.ts — Phase 6 Wave-0 refusal stub for MCP-01.
// Plan 06-03 (consume-side multiplexer) flips these.

import { describe, it } from 'vitest';

describe('MCP-01: client pool starts and supervises 4 stdio MCP clients', () => {
	it.skip('MCP-01: pool starts 4 stdio Clients via SDK; each connects to its own mock server', () => {
		throw new Error('Plan 06-03 has not yet implemented McpClientPool.start (4 SDK Clients via StdioClientTransport per provider)');
	});

	it.skip('MCP-01: per-provider failure isolation: Slack mock crashes; GitHub/Linear/Jira keep running', () => {
		throw new Error('Plan 06-03 has not yet implemented per-provider failure isolation (one provider crash does not topple the pool)');
	});

	it.skip('MCP-01: pool.close() gracefully closes all clients (stdin-close → SIGTERM)', () => {
		throw new Error('Plan 06-03 has not yet implemented McpClientPool.close graceful shutdown (stdin-close + SIGTERM after 50ms)');
	});

	it.skip('MCP-01: startProvider with backoff retries on transient transport error', () => {
		throw new Error('Plan 06-03 has not yet implemented startProvider with runWithBackoff(maxAttempts=5) for transient transport errors');
	});
});
