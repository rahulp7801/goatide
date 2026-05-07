/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/auth.ts — Phase 6 (Plan 06-02) bearer-token resolution + validation.
//
// MCP-09 substrate: external Claude-Code CLI sessions authenticate against the loopback
// HTTP server via Authorization: Bearer <token>. The token is resolved from the OS keychain
// (keytar service "goatide.mcp", account "bearer_token") at daemon boot. On first launch the
// key is absent — we generate a 256-bit-hex token via crypto.randomBytes(32) and persist it.
// This mirrors Phase-5 kernel/src/daemon/auth-token.ts but stores in keychain (vs lockfile).
//
// PITFALL 3 DEFENSE — token leak prevention:
//   - validateBearerToken uses crypto.timingSafeEqual after a length check; NEVER `===`.
//   - sha256Fingerprint(token) returns the first 8 hex chars of SHA-256(token); the actual
//     token is NEVER logged. Logs cross-reference via fingerprint only.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Minimal keychain abstraction — production passes the keytar module directly; tests pass
 * an in-memory Map-backed mock (see kernel/src/test/helpers/mcp-fixtures.ts makeKeychainMock).
 */
export interface KeychainAdapter {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
}

export const KEYCHAIN_SERVICE = 'goatide.mcp';
export const KEYCHAIN_ACCOUNT_BEARER = 'bearer_token';

/**
 * Resolve the MCP bearer token. Reads keychain first; if absent and `generate` is true,
 * mints a fresh 256-bit-hex token (64 hex chars) and persists it. Returns null on absent
 * key when `generate` is false (caller decides whether to skip MCP server or prompt).
 */
export async function resolveBearerToken(args: {
	keychain: KeychainAdapter;
	generate?: boolean;
}): Promise<string | null> {
	const existing = await args.keychain.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_BEARER);
	if (existing) {
		return existing;
	}
	if (args.generate) {
		const token = randomBytes(32).toString('hex');
		await args.keychain.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_BEARER, token);
		return token;
	}
	return null;
}

/**
 * Constant-time bearer-token comparison. Length-check first to short-circuit obvious
 * mismatches without revealing length via the timingSafeEqual call (it throws on
 * unequal-length buffers). Returns false on any non-string input.
 */
export function validateBearerToken(presented: string, expected: string): boolean {
	if (typeof presented !== 'string' || typeof expected !== 'string') {
		return false;
	}
	if (presented.length !== expected.length) {
		return false;
	}
	return timingSafeEqual(Buffer.from(presented, 'utf8'), Buffer.from(expected, 'utf8'));
}

/**
 * Return the first 8 hex chars of SHA-256(token). Used as a stable, non-reversible audit
 * identifier in log lines (NEVER log the token itself).
 */
export function sha256Fingerprint(token: string): string {
	return createHash('sha256').update(token).digest('hex').slice(0, 8);
}
