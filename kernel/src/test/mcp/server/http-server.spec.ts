/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/http-server.spec.ts — Phase 6 Wave-0 refusal stub for MCP-08.
// Plan 06-02 (expose-side server) flips these from skip -> real assertions.

import { describe, it } from 'vitest';

describe('MCP-08: Streamable HTTP server binding & origin allowlist', () => {
	it.skip('MCP-08: binds 127.0.0.1:7345 (not 0.0.0.0)', () => {
		throw new Error('Plan 06-02 has not yet implemented McpHttpServer.listen with 127.0.0.1 literal binding');
	});

	it.skip('MCP-08: rejects request with Origin: http://localhost.evil.com (Pitfall 1 subdomain attack)', () => {
		throw new Error('Plan 06-02 has not yet implemented originAllowlist Set membership check (literal-string equality, not endsWith)');
	});

	it.skip('MCP-08: allows http://127.0.0.1 + http://localhost in allowlist Set', () => {
		throw new Error('Plan 06-02 has not yet implemented originAllowlist with the two trusted origins');
	});

	it.skip('MCP-08: rejects request with no Authorization header (401 missing_bearer)', () => {
		throw new Error('Plan 06-02 has not yet implemented bearer-token middleware (401 + error: missing_bearer)');
	});

	it.skip('MCP-08: accepts request with correct bearer token via timingSafeEqual', () => {
		throw new Error('Plan 06-02 has not yet implemented validateBearerToken with crypto.timingSafeEqual constant-time comparison');
	});
});
