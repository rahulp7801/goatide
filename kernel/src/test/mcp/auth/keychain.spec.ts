/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/auth/keychain.spec.ts — Phase 6 (Plan 06-04) MCP-03 keychain wrapper.
//
// Verifies the per-provider get/set/delete contract against an in-memory keychain mock so the
// host OS keychain is never touched. Per-provider account namespacing
// (`<provider>.<kind>_token`) is the structural pin: refuse-mcp-collision.sh static-greps
// goatide.mcp.* in source, the test exercises the runtime read path.

import { describe, expect, it } from 'vitest';

import {
	KEYCHAIN_SERVICE,
	deleteProviderToken,
	getProviderToken,
	providerAccount,
	setProviderToken,
} from '../../../mcp/auth/keychain.js';
import { makeKeychainMock } from '../../helpers/mcp-fixtures.js';

describe('MCP-03: keychain-backed per-provider token resolution (mirrors Phase-5 keytar-resolver pattern)', () => {
	it('MCP-03: getProviderToken reads from keytar service goatide.mcp + account <provider>.<kind>_token', async () => {
		const keychain = makeKeychainMock();
		// Seed every kind for every provider via the wrapper's setProviderToken so the test
		// also exercises the symmetric write path. One snapshot-style assertion verifies all
		// six (provider, kind) reads at once.
		await setProviderToken(keychain, 'github', 'api', 'gh_pat_xxx');
		await setProviderToken(keychain, 'slack', 'access', 'xoxb_access_xxx');
		await setProviderToken(keychain, 'slack', 'refresh', 'xoxe_refresh_xxx');
		await setProviderToken(keychain, 'linear', 'access', 'lin_access_xxx');
		await setProviderToken(keychain, 'linear', 'refresh', 'lin_refresh_xxx');
		await setProviderToken(keychain, 'jira', 'api', 'jira_api_xxx');

		const reads = {
			service: KEYCHAIN_SERVICE,
			github_api: await getProviderToken(keychain, 'github', 'api'),
			slack_access: await getProviderToken(keychain, 'slack', 'access'),
			slack_refresh: await getProviderToken(keychain, 'slack', 'refresh'),
			linear_access: await getProviderToken(keychain, 'linear', 'access'),
			linear_refresh: await getProviderToken(keychain, 'linear', 'refresh'),
			jira_api: await getProviderToken(keychain, 'jira', 'api'),
			account_format_github_api: providerAccount('github', 'api'),
			account_format_slack_refresh: providerAccount('slack', 'refresh'),
		};
		expect(reads).toEqual({
			service: 'goatide.mcp',
			github_api: 'gh_pat_xxx',
			slack_access: 'xoxb_access_xxx',
			slack_refresh: 'xoxe_refresh_xxx',
			linear_access: 'lin_access_xxx',
			linear_refresh: 'lin_refresh_xxx',
			jira_api: 'jira_api_xxx',
			account_format_github_api: 'github.api_token',
			account_format_slack_refresh: 'slack.refresh_token',
		});
	});

	it('MCP-03: setProviderToken writes via keytar; deleteProviderToken clears the key', async () => {
		const keychain = makeKeychainMock();
		await setProviderToken(keychain, 'github', 'api', 'gh_pat_v1');
		const beforeDelete = await keychain.getPassword(KEYCHAIN_SERVICE, providerAccount('github', 'api'));
		const deletedFirst = await deleteProviderToken(keychain, 'github', 'api');
		const afterDelete = await keychain.getPassword(KEYCHAIN_SERVICE, providerAccount('github', 'api'));
		const deletedAgain = await deleteProviderToken(keychain, 'github', 'api');
		expect({ beforeDelete, deletedFirst, afterDelete, deletedAgain }).toEqual({
			beforeDelete: 'gh_pat_v1',
			deletedFirst: true,
			afterDelete: null,
			deletedAgain: false,
		});
	});

	it('MCP-03: null token (key absent) short-circuits without throwing — caller decides whether to skip provider or prompt', async () => {
		const keychain = makeKeychainMock();
		// Nothing seeded — every provider+kind combination must return null without throwing.
		const reads = {
			github_api: await getProviderToken(keychain, 'github', 'api'),
			slack_access: await getProviderToken(keychain, 'slack', 'access'),
			linear_refresh: await getProviderToken(keychain, 'linear', 'refresh'),
			jira_api: await getProviderToken(keychain, 'jira', 'api'),
		};
		expect(reads).toEqual({
			github_api: null,
			slack_access: null,
			linear_refresh: null,
			jira_api: null,
		});
	});
});
