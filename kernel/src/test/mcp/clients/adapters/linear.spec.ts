/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/linear.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-06: Linear adapter — OAuth refresh + revocation detection', () => {
	it.skip('MCP-06: Linear OAuth refresh fires 5min before expiry (TokenRefreshScheduler)', () => {
		throw new Error('Plan 06-04 has not yet implemented LinearAdapter.scheduleRefresh (TokenRefreshScheduler at expiry-5min via injected clock)');
	});

	it.skip('MCP-06: Linear 401 with extensions.code=AUTHENTICATION_ERROR signals revocation', () => {
		throw new Error('Plan 06-04 has not yet implemented LinearAdapter.detectRevocation for 401 + body.errors[0].extensions.code=AUTHENTICATION_ERROR');
	});
});
