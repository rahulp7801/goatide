/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/auth/revocation.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-06: per-provider revocation detector returns {revoked: true, reason}', () => {
	it.skip('MCP-06: Slack revocation detector handles 3 distinct error shapes (invalid_auth/account_inactive/token_revoked)', () => {
		throw new Error('Plan 06-04 has not yet implemented detectSlackRevocation across all 3 documented Slack error.body shapes');
	});

	it.skip('MCP-06: GitHub revocation detector returns {revoked:true, reason} on 401 + WWW-Authenticate Bearer realm', () => {
		throw new Error('Plan 06-04 has not yet implemented detectGitHubRevocation for 401 + WWW-Authenticate Bearer realm header');
	});

	it.skip('MCP-06: Linear revocation detector returns {revoked:true, reason} on 401 + extensions.code=AUTHENTICATION_ERROR', () => {
		throw new Error('Plan 06-04 has not yet implemented detectLinearRevocation for 401 GraphQL extensions.code=AUTHENTICATION_ERROR');
	});

	it.skip('MCP-06: Jira revocation detector returns {revoked:true, reason} on 401 errorMessages OR 403 explicit', () => {
		throw new Error('Plan 06-04 has not yet implemented detectJiraRevocation across both 401-with-errorMessages and 403-explicit shapes');
	});
});
