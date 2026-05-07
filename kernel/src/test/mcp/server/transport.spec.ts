/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/transport.spec.ts — Phase 6 Wave-0 refusal stub for MCP-08.
// Plan 06-02 (expose-side server) flips these.

import { describe, it } from 'vitest';

describe('MCP-08: StreamableHTTPServerTransport stateful session management', () => {
	it.skip('MCP-08: StreamableHTTPServerTransport stateful mode (sessionIdGenerator returns randomUUID)', () => {
		throw new Error('Plan 06-02 has not yet implemented StreamableHTTPServerTransport with sessionIdGenerator: () => randomUUID()');
	});

	it.skip('MCP-08: session ID round-trip via Mcp-Session-Id header', () => {
		throw new Error('Plan 06-02 has not yet implemented session ID round-trip (server returns Mcp-Session-Id; client echoes it on subsequent requests)');
	});
});
