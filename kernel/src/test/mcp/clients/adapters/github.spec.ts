/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/github.spec.ts — Phase 6 Wave-0 refusal stub for MCP-03 + MCP-06.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-03 + MCP-06: GitHub adapter — keychain PAT resolution + revocation detection', () => {
	it.skip('MCP-03 + MCP-06: GitHub adapter resolves PAT from keychain (goatide.mcp.github.api_token) and passes via env to StdioClientTransport', () => {
		throw new Error('Plan 06-04 has not yet implemented GitHubAdapter.resolveCredentials (keytar service=goatide.mcp.github.api_token; env passthrough to spawned stdio binary)');
	});

	it.skip('MCP-06: GitHub 401 with WWW-Authenticate Bearer realm signals revocation', () => {
		throw new Error('Plan 06-04 has not yet implemented GitHubAdapter.detectRevocation (401 + WWW-Authenticate Bearer realm header -> revoked=true)');
	});
});
