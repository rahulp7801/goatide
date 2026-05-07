/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/slack.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-06: Slack adapter revocation detection (3 distinct error shapes per Slack docs)', () => {
	it.skip('MCP-06: Slack revocation detection: invalid_auth body triggers paused_auth state', () => {
		throw new Error('Plan 06-04 has not yet implemented SlackAdapter.detectRevocation for {ok:false, error:"invalid_auth"} -> paused_auth');
	});

	it.skip('MCP-06: Slack revocation detection: account_inactive body triggers paused_auth', () => {
		throw new Error('Plan 06-04 has not yet implemented SlackAdapter.detectRevocation for {ok:false, error:"account_inactive"} -> paused_auth');
	});

	it.skip('MCP-06: Slack revocation detection: token_revoked body triggers paused_auth', () => {
		throw new Error('Plan 06-04 has not yet implemented SlackAdapter.detectRevocation for {ok:false, error:"token_revoked"} -> paused_auth');
	});
});
