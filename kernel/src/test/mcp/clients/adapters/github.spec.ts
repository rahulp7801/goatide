/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/github.spec.ts — Phase 6 (Plan 06-04) GitHub adapter.
//
// Two contracts pinned:
//  1. PAT resolution: keychain read at service=goatide.mcp / account=github.api_token →
//     env: { GITHUB_PERSONAL_ACCESS_TOKEN: pat } in the returned McpProviderConfig.
//  2. Revocation detection: 401 + WWW-Authenticate Bearer realm → {revoked:true}.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGitHubProviderConfig, detectGitHubRevocation } from '../../../../mcp/clients/adapters/github.js';
import { setProviderToken } from '../../../../mcp/auth/keychain.js';
import { makeKeychainMock } from '../../../helpers/mcp-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtures = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'oauth-revocation-fixtures.json'), 'utf8')) as Record<string, Record<string, unknown>>;

describe('MCP-03 + MCP-06: GitHub adapter — keychain PAT resolution + revocation detection', () => {
	it('MCP-03 + MCP-06: GitHub adapter resolves PAT from keychain (goatide.mcp.github.api_token) and passes via env to StdioClientTransport', async () => {
		const keychain = makeKeychainMock();
		await setProviderToken(keychain, 'github', 'api', 'gh_pat_TEST');

		const config = await buildGitHubProviderConfig({
			keychain,
			command: 'docker',
			args: ['run', '-i', '--rm', 'ghcr.io/github/github-mcp-server'],
			cwd: '/tmp',
		});

		// Null short-circuit: empty keychain returns null.
		const emptyKeychain = makeKeychainMock();
		const nullConfig = await buildGitHubProviderConfig({
			keychain: emptyKeychain,
			command: 'docker',
			args: [],
		});

		expect({ config, nullConfig }).toEqual({
			config: {
				provider: 'github',
				command: 'docker',
				args: ['run', '-i', '--rm', 'ghcr.io/github/github-mcp-server'],
				env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'gh_pat_TEST' },
				cwd: '/tmp',
			},
			nullConfig: null,
		});
	});

	it('MCP-06: GitHub 401 with WWW-Authenticate Bearer realm signals revocation', () => {
		const shape = fixtures.github['401_with_www_authenticate'] as Record<string, unknown>;
		const revoked = detectGitHubRevocation(shape);
		const ok = detectGitHubRevocation({ status: 200, headers: shape.headers });
		expect({ revoked, ok }).toEqual({
			revoked: { revoked: true, reason: 'bad_credentials' },
			ok: { revoked: false },
		});
	});
});
