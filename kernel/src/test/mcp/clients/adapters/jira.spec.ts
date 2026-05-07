/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/jira.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06 + MCP-03.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-06 + MCP-03: Jira adapter — API token (v1 path) + revocation detection', () => {
	it.skip('MCP-06 + MCP-03: Jira API token (v1 path; not OAuth) resolved from keychain', () => {
		throw new Error('Plan 06-04 has not yet implemented JiraAdapter.resolveCredentials (keytar service=goatide.mcp.jira.api_token; v1 API token, NOT OAuth — Phase-6-iter handles OAuth migration)');
	});

	it.skip('MCP-06: Jira 403 signals explicit revocation; 401 with errorMessages signals auth failure', () => {
		throw new Error('Plan 06-04 has not yet implemented JiraAdapter.detectRevocation (403 -> revoked=true explicit; 401+errorMessages -> revoked=true auth-failure)');
	});
});
