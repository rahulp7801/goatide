/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/auth/keychain.spec.ts — Phase 6 Wave-0 refusal stub for MCP-03.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-03: keychain-backed per-provider token resolution (mirrors Phase-5 keytar-resolver pattern)', () => {
	it.skip('MCP-03: getProviderToken reads from keytar service goatide.mcp.<provider>.access_token', () => {
		throw new Error('Plan 06-04 has not yet implemented getProviderToken (keytar.getPassword service=goatide.mcp.<provider>.access_token; account=default)');
	});

	it.skip('MCP-03: setProviderToken writes via keytar', () => {
		throw new Error('Plan 06-04 has not yet implemented setProviderToken (keytar.setPassword to same service+account triple)');
	});

	it.skip('MCP-03: null token (key absent) short-circuits without throwing — caller decides whether to skip provider or prompt', () => {
		throw new Error('Plan 06-04 has not yet implemented null-token short-circuit (mirrors Phase-5 keytar-resolver semantics; null is a valid signal, not an error)');
	});
});
