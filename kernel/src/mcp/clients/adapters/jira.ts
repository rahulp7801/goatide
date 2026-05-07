/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/adapters/jira.ts — Phase 6 (Plan 06-04) Jira provider adapter.
//
// v1 (this plan): API token path. Atlassian's v1 API token model: a single long-lived token
// generated from id.atlassian.com paired with the user's email. No refresh dance. The MCP
// server child receives both via env: ATLASSIAN_API_TOKEN + ATLASSIAN_EMAIL. Email is config
// data (not a credential) and lives in mcp-clients.json; Plan 06-06's CLI handles the
// configure flow that writes both.
//
// v2 (Phase-6-iter): Atlassian's OAuth 2.1 (with PKCE) replaces the API token model. The
// adapter will gain 'access' / 'refresh' kinds + a TokenRefreshScheduler at that point.
//
// Revocation: 401 with errorMessages OR 403 explicit. Two-shape disjunction because Atlassian
// surfaces revoked tokens as 401 with a free-form errorMessages array, while explicit access
// removal (admin revoked the user) surfaces as 403.

import { detectJiraRevocation } from '../../auth/revocation.js';
import { getProviderToken, type KeychainAdapter } from '../../auth/keychain.js';
import type { McpProviderConfig } from '../types.js';

export interface BuildJiraProviderConfigArgs {
	keychain: KeychainAdapter;
	command: string;
	args: string[];
	cwd?: string;
	/**
	 * Atlassian email — config data (not a credential). Lives in mcp-clients.json. Adapter
	 * passes through to the spawned child via env so the upstream MCP server can authenticate.
	 */
	email: string;
}

/**
 * Build the Jira McpProviderConfig. Returns null when either the API token is missing OR the
 * email is empty. Both are required for Atlassian basic-auth.
 */
export async function buildJiraProviderConfig(args: BuildJiraProviderConfigArgs): Promise<McpProviderConfig | null> {
	const apiToken = await getProviderToken(args.keychain, 'jira', 'api');
	if (!apiToken || !args.email) {
		return null;
	}
	return {
		provider: 'jira',
		command: args.command,
		args: args.args,
		env: { ATLASSIAN_API_TOKEN: apiToken, ATLASSIAN_EMAIL: args.email },
		cwd: args.cwd,
	};
}

export { detectJiraRevocation };
