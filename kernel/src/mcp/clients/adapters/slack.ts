/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/adapters/slack.ts — Phase 6 (Plan 06-04) Slack provider adapter.
//
// Slack OAuth flow:
//   - The OAuth app variant uses a refreshable access token (xoxe.* refresh + xoxp/xoxb access).
//   - The legacy bot-token variant uses a single non-rotating xoxb token (no refresh dance).
//
// Adapter handling: ALWAYS reads `slack.access_token` (xoxp/xoxb). If `slack.refresh_token` is
// also present, the caller can construct a TokenRefreshScheduler with the Slack OAuth refresh
// endpoint (https://slack.com/api/oauth.v2.access?grant_type=refresh_token). The scheduler is
// NOT instantiated by buildSlackProviderConfig — it returns the refresh token alongside the
// config so the caller (daemon boot path) wires it explicitly. This keeps the adapter pure
// (no timer state) and lets tests inject controlled clocks.
//
// Revocation: Slack's 3 documented shapes (invalid_auth/account_inactive/token_revoked) are
// dispatched via detectSlackRevocation; the pool's handleError calls into it.

import { detectSlackRevocation } from '../../auth/revocation.js';
import { getProviderToken, type KeychainAdapter } from '../../auth/keychain.js';
import type { McpProviderConfig } from '../types.js';

export interface BuildSlackProviderConfigArgs {
	keychain: KeychainAdapter;
	command: string;
	args: string[];
	cwd?: string;
}

export interface BuildSlackProviderConfigResult {
	config: McpProviderConfig;
	/**
	 * Present when the OAuth-app variant is in use (refresh-token rotation). Null for the
	 * legacy bot-token variant. Caller wires a TokenRefreshScheduler when non-null.
	 */
	refreshToken: string | null;
}

/**
 * Build the Slack McpProviderConfig — keychain read for access (mandatory) + refresh
 * (optional). Returns null when no access token is configured (paused_auth signal).
 */
export async function buildSlackProviderConfig(args: BuildSlackProviderConfigArgs): Promise<BuildSlackProviderConfigResult | null> {
	const accessToken = await getProviderToken(args.keychain, 'slack', 'access');
	if (!accessToken) {
		return null;
	}
	const refreshToken = await getProviderToken(args.keychain, 'slack', 'refresh');
	const config: McpProviderConfig = {
		provider: 'slack',
		command: args.command,
		args: args.args,
		env: { SLACK_BOT_TOKEN: accessToken },
		cwd: args.cwd,
	};
	return { config, refreshToken };
}

export { detectSlackRevocation };
