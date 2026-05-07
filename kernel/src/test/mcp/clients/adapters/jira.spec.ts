/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/jira.spec.ts — Phase 6 (Plan 06-04) Jira adapter (v1 API token).
//
// Two contracts pinned:
//   1. v1 API token resolved from keychain + email passed through env (ATLASSIAN_API_TOKEN +
//      ATLASSIAN_EMAIL).
//   2. Jira 403 = explicit revocation; 401 + errorMessages = auth failure.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildJiraProviderConfig, detectJiraRevocation } from '../../../../mcp/clients/adapters/jira.js';
import { setProviderToken } from '../../../../mcp/auth/keychain.js';
import { makeKeychainMock } from '../../../helpers/mcp-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtures = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'oauth-revocation-fixtures.json'), 'utf8')) as Record<string, Record<string, unknown>>;

describe('MCP-06 + MCP-03: Jira adapter — API token (v1 path) + revocation detection', () => {
	it('MCP-06 + MCP-03: Jira API token (v1 path; not OAuth) resolved from keychain', async () => {
		const keychain = makeKeychainMock();
		await setProviderToken(keychain, 'jira', 'api', 'jira_api_v1');
		const config = await buildJiraProviderConfig({
			keychain,
			command: 'node',
			args: ['jira-mcp.cjs'],
			email: 'rahul@example.com',
		});
		// Null when token missing.
		const nullToken = await buildJiraProviderConfig({
			keychain: makeKeychainMock(),
			command: 'node',
			args: [],
			email: 'rahul@example.com',
		});
		// Null when email missing (Atlassian basic-auth requires both).
		const seededKeychain = makeKeychainMock();
		await setProviderToken(seededKeychain, 'jira', 'api', 'jira_api_v1');
		const nullEmail = await buildJiraProviderConfig({
			keychain: seededKeychain,
			command: 'node',
			args: [],
			email: '',
		});
		expect({ config, nullToken, nullEmail }).toEqual({
			config: {
				provider: 'jira',
				command: 'node',
				args: ['jira-mcp.cjs'],
				env: { ATLASSIAN_API_TOKEN: 'jira_api_v1', ATLASSIAN_EMAIL: 'rahul@example.com' },
				cwd: undefined,
			},
			nullToken: null,
			nullEmail: null,
		});
	});

	it('MCP-06: Jira 403 signals explicit revocation; 401 with errorMessages signals auth failure', () => {
		const unauthorized = detectJiraRevocation(fixtures.jira['401_unauthorized'] as Record<string, unknown>);
		const forbidden = detectJiraRevocation(fixtures.jira['403_forbidden'] as Record<string, unknown>);
		expect({ unauthorized, forbidden }).toEqual({
			unauthorized: { revoked: true, reason: 'unauthorized' },
			forbidden: { revoked: true, reason: 'forbidden' },
		});
	});
});
