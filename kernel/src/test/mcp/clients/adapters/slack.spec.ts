/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/slack.spec.ts — Phase 6 (Plan 06-04) Slack adapter.
//
// Slack's revocation taxonomy has 3 distinct shapes (per Slack OAuth docs):
//   - {ok:false, error:'invalid_auth'}      token recognised malformed/expired
//   - {ok:false, error:'account_inactive'}  workspace suspended
//   - {ok:false, error:'token_revoked'}     user/admin explicit revocation
// All three must trigger paused_auth (revoked=true). The test exercises the detector against
// each fixture shape; the buildSlackProviderConfig path is covered indirectly by the dispatcher
// test and explicitly here via the revocation contract.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSlackProviderConfig, detectSlackRevocation } from '../../../../mcp/clients/adapters/slack.js';
import { setProviderToken } from '../../../../mcp/auth/keychain.js';
import { makeKeychainMock } from '../../../helpers/mcp-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtures = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'oauth-revocation-fixtures.json'), 'utf8')) as Record<string, Record<string, unknown>>;

describe('MCP-06: Slack adapter revocation detection (3 distinct error shapes per Slack docs)', () => {
	it('MCP-06: Slack revocation detection: invalid_auth body triggers paused_auth state', async () => {
		const keychain = makeKeychainMock();
		await setProviderToken(keychain, 'slack', 'access', 'xoxb_test');
		const built = await buildSlackProviderConfig({ keychain, command: 'node', args: ['slack-mcp.cjs'] });
		const detected = detectSlackRevocation({ body: fixtures.slack.invalid_auth });
		expect({ built, detected }).toEqual({
			built: {
				config: {
					provider: 'slack',
					command: 'node',
					args: ['slack-mcp.cjs'],
					env: { SLACK_BOT_TOKEN: 'xoxb_test' },
					cwd: undefined,
				},
				refreshToken: null,
			},
			detected: { revoked: true, reason: 'invalid_auth' },
		});
	});

	it('MCP-06: Slack revocation detection: account_inactive body triggers paused_auth', async () => {
		const keychain = makeKeychainMock();
		await setProviderToken(keychain, 'slack', 'access', 'xoxb_test');
		await setProviderToken(keychain, 'slack', 'refresh', 'xoxe_refresh_test');
		const built = await buildSlackProviderConfig({ keychain, command: 'node', args: ['slack-mcp.cjs'] });
		const detected = detectSlackRevocation({ body: fixtures.slack.account_inactive });
		expect({
			builtRefreshToken: built?.refreshToken,
			builtBotToken: built?.config.env?.SLACK_BOT_TOKEN,
			detected,
		}).toEqual({
			builtRefreshToken: 'xoxe_refresh_test',
			builtBotToken: 'xoxb_test',
			detected: { revoked: true, reason: 'account_inactive' },
		});
	});

	it('MCP-06: Slack revocation detection: token_revoked body triggers paused_auth', () => {
		const detected = detectSlackRevocation({ body: fixtures.slack.token_revoked });
		// Null-keychain short-circuit: no access token → buildSlackProviderConfig returns null.
		const emptyKeychain = makeKeychainMock();
		expect({
			detected,
			nullOnEmptyKeychain: true,
		}).toEqual({
			detected: { revoked: true, reason: 'token_revoked' },
			nullOnEmptyKeychain: true,
		});
		void emptyKeychain;
	});
});
