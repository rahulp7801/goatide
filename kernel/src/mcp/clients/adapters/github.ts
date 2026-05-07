/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/adapters/github.ts — Phase 6 (Plan 06-04) GitHub provider adapter.
//
// v1 (this plan): PAT path only. Resolves the GitHub Personal Access Token from the OS keychain
// (account=`github.api_token`) and constructs an McpProviderConfig with
// `env: { GITHUB_PERSONAL_ACCESS_TOKEN: pat }` so the spawned ghcr.io/github/github-mcp-server
// child sees the credential.
//
// v2 (Phase-6-iter): OAuth GitHub App path will add 'access' / 'refresh' kinds + a
// TokenRefreshScheduler. v1 keeps the PAT shape because every existing GitHub MCP user is on a
// PAT today and the upstream MCP server reads the same env var name regardless of token kind.
//
// Null short-circuit: if no PAT is present in the keychain, returns null. The pool / boot
// path treats null as a 'paused_auth' signal and surfaces the configure-CLI banner.

import { detectGitHubRevocation } from '../../auth/revocation.js';
import { getProviderToken, type KeychainAdapter } from '../../auth/keychain.js';
import type { McpProviderConfig } from '../types.js';

export interface BuildGitHubProviderConfigArgs {
	keychain: KeychainAdapter;
	command: string;
	args: string[];
	cwd?: string;
}

/**
 * Build the GitHub McpProviderConfig — keychain read + env construction. Returns null when the
 * PAT is missing from the keychain (caller short-circuits to paused_auth).
 */
export async function buildGitHubProviderConfig(args: BuildGitHubProviderConfigArgs): Promise<McpProviderConfig | null> {
	const pat = await getProviderToken(args.keychain, 'github', 'api');
	if (!pat) {
		return null;
	}
	return {
		provider: 'github',
		command: args.command,
		args: args.args,
		env: { GITHUB_PERSONAL_ACCESS_TOKEN: pat },
		cwd: args.cwd,
	};
}

/**
 * Convenience re-export: pool's handleError dispatches via detectRevocation('github', err);
 * adapter callers that want a direct handle without the dispatcher import this.
 */
export { detectGitHubRevocation };
