/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/auth.spec.ts — Phase 6 Wave-0 refusal stub for MCP-09.
// Plan 06-02 (expose-side server) flips these.

import { describe, it } from 'vitest';

describe('MCP-09: bearer-token authentication for the local MCP HTTP server', () => {
	it.skip('MCP-09: validateBearerToken short-circuits false on length mismatch', () => {
		throw new Error('Plan 06-02 has not yet implemented validateBearerToken length-prefix short-circuit (timing-attack defense; lengths differ -> false without timingSafeEqual call)');
	});

	it.skip('MCP-09: validateBearerToken returns true via timingSafeEqual on match', () => {
		throw new Error('Plan 06-02 has not yet implemented validateBearerToken via crypto.timingSafeEqual');
	});

	it.skip('MCP-09: resolveBearerToken reads from keychain at goatide.mcp.bearer_token', () => {
		throw new Error('Plan 06-02 has not yet implemented resolveBearerToken (keytar service=goatide.mcp.bearer_token; account=default; falls back to env GOATIDE_MCP_BEARER)');
	});
});
