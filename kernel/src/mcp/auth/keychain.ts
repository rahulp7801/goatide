/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/auth/keychain.ts — Phase 6 (Plan 06-04) MCP-03 keychain wrapper.
//
// Per-provider OS-keychain credential storage via keytar 7.9 (the same pin Phase 5 uses for the
// Promoter API key). Mirrors kernel/src/harvester/promoter/keytar-resolver.ts in shape:
//
//   service = 'goatide.mcp'
//   account = `${provider}.${kind}_token`        // e.g. 'github.api_token', 'slack.access_token'
//
// Kind taxonomy (chosen per checker B2 — option a — recommended):
//   - 'api':     single-credential models with no refresh dance (GitHub PAT, Jira API token v1).
//   - 'access':  OAuth access token (Slack OAuth xoxp/xoxb, Linear OAuth, future Jira OAuth 2.1).
//   - 'refresh': OAuth refresh token paired with 'access' for refresh-token rotation.
//
// Null short-circuit: getProviderToken returns null when the keychain entry is absent. The caller
// (per-provider adapter or pool) decides between (a) skipping provider startup with a 'paused_auth'
// state surface or (b) prompting the user via `goatide-cli mcp configure <provider>` — Plan 06-06
// owns the CLI surface. We deliberately do NOT add an env-var fallback (unlike Phase 5's promoter
// resolver) because the four providers have no canonical env-var name; configure-CLI is the path.

import type { McpProviderName } from '../clients/types.js';

/**
 * Token kind taxonomy for per-provider credential storage. See file header for semantics.
 *  - 'api':     single-credential models (no refresh dance).
 *  - 'access':  OAuth access token (paired with 'refresh' when a rotation flow exists).
 *  - 'refresh': OAuth refresh token paired with 'access'.
 */
export type TokenKind = 'access' | 'refresh' | 'api';

/**
 * The keychain service identifier. All MCP provider tokens are stored under this single
 * service value to keep `keytar findCredentials` enumerable; the `account` discriminator
 * carries the per-provider + per-kind namespacing.
 */
export const KEYCHAIN_SERVICE = 'goatide.mcp';

/**
 * Adapter surface mirroring keytar's three core operations. Real production wires through to
 * the live `keytar` package via `makeLiveKeychainAdapter()`; tests use `makeKeychainMock()`
 * from kernel/src/test/helpers/mcp-fixtures.ts so the host OS keychain is never touched.
 */
export interface KeychainAdapter {
	getPassword: (service: string, account: string) => Promise<string | null>;
	setPassword: (service: string, account: string, password: string) => Promise<void>;
	deletePassword: (service: string, account: string) => Promise<boolean>;
}

/**
 * Build the canonical account string for a (provider, kind) pair. Exported so adapter tests
 * can assert exact-string keychain reads without re-deriving the format.
 */
export function providerAccount(provider: McpProviderName, kind: TokenKind): string {
	return `${provider}.${kind}_token`;
}

/**
 * Resolve a per-provider token from the keychain. Returns null when the entry is absent
 * (caller short-circuits to graceful degrade — never throws on missing key).
 */
export async function getProviderToken(
	keychain: KeychainAdapter,
	provider: McpProviderName,
	kind: TokenKind,
): Promise<string | null> {
	const account = providerAccount(provider, kind);
	const stored = await keychain.getPassword(KEYCHAIN_SERVICE, account);
	if (stored && stored.length > 0) {
		return stored;
	}
	return null;
}

/**
 * Persist a per-provider token. Idempotent: same (provider, kind) pair overwrites in place.
 * Caller is responsible for token rotation timing — the TokenRefreshScheduler in refresh.ts
 * is the canonical writer for OAuth access/refresh pairs.
 */
export async function setProviderToken(
	keychain: KeychainAdapter,
	provider: McpProviderName,
	kind: TokenKind,
	token: string,
): Promise<void> {
	const account = providerAccount(provider, kind);
	await keychain.setPassword(KEYCHAIN_SERVICE, account, token);
}

/**
 * Drop a per-provider token. Returns true when an entry was deleted, false when the key was
 * absent. Used by `goatide-cli mcp configure --revoke <provider>` (Plan 06-06).
 */
export async function deleteProviderToken(
	keychain: KeychainAdapter,
	provider: McpProviderName,
	kind: TokenKind,
): Promise<boolean> {
	const account = providerAccount(provider, kind);
	return keychain.deletePassword(KEYCHAIN_SERVICE, account);
}

/**
 * Build a live KeychainAdapter wrapping the `keytar` package. Lazy-imports keytar's native
 * binding so unit tests that pass an in-memory mock never pay the load cost. Best-effort
 * error handling: a malfunctioning keychain swallows to null on read; throws on write so the
 * caller can surface a concrete configure-CLI failure.
 */
export function makeLiveKeychainAdapter(): KeychainAdapter {
	return {
		getPassword: async (service, account) => {
			try {
				const keytar = await import('keytar');
				return await keytar.getPassword(service, account);
			} catch {
				return null;
			}
		},
		setPassword: async (service, account, password) => {
			const keytar = await import('keytar');
			await keytar.setPassword(service, account, password);
		},
		deletePassword: async (service, account) => {
			const keytar = await import('keytar');
			return keytar.deletePassword(service, account);
		},
	};
}
