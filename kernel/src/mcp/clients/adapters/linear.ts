/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/adapters/linear.ts — Phase 6 (Plan 06-04) Linear provider adapter.
//
// Linear OAuth flow: refresh-token rotation IS the canonical path (Linear deprecated long-lived
// API keys for OAuth apps). Adapter resolves both `linear.access_token` and `linear.refresh_token`
// from the keychain; missing access OR missing refresh token triggers paused_auth.
//
// Revocation: 401 with body.errors[0].extensions.code === 'AUTHENTICATION_ERROR' (Linear's
// GraphQL transport surfaces auth failures in the GraphQL errors array).

import { detectLinearRevocation } from '../../auth/revocation.js';
import { getProviderToken, type KeychainAdapter } from '../../auth/keychain.js';
import type { McpProviderConfig } from '../types.js';

export interface BuildLinearProviderConfigArgs {
	keychain: KeychainAdapter;
	command: string;
	args: string[];
	cwd?: string;
}

export interface BuildLinearProviderConfigResult {
	config: McpProviderConfig;
	/** OAuth refresh token — caller wires a TokenRefreshScheduler. */
	refreshToken: string;
}

/**
 * Build the Linear McpProviderConfig. Returns null when either the access token OR refresh
 * token is absent (Linear's OAuth flow requires both — there is no PAT-style escape hatch).
 */
export async function buildLinearProviderConfig(args: BuildLinearProviderConfigArgs): Promise<BuildLinearProviderConfigResult | null> {
	const accessToken = await getProviderToken(args.keychain, 'linear', 'access');
	const refreshToken = await getProviderToken(args.keychain, 'linear', 'refresh');
	if (!accessToken || !refreshToken) {
		return null;
	}
	const config: McpProviderConfig = {
		provider: 'linear',
		command: args.command,
		args: args.args,
		env: { LINEAR_API_KEY: accessToken },
		cwd: args.cwd,
	};
	return { config, refreshToken };
}

export { detectLinearRevocation };
