/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/auth.spec.ts — Phase 6 (Plan 06-02) MCP-09 bearer-token auth.
//
// Flipped from the Wave-0 it.skip stubs Plan 06-01 landed.

import { describe, it, expect } from 'vitest';
import {
	resolveBearerToken,
	validateBearerToken,
	sha256Fingerprint,
	KEYCHAIN_SERVICE,
	KEYCHAIN_ACCOUNT_BEARER,
} from '../../../mcp/server/auth.js';
import { makeKeychainMock } from '../../helpers/mcp-fixtures.js';

describe('MCP-09: bearer-token authentication for the local MCP HTTP server', () => {
	it('MCP-09: validateBearerToken short-circuits false on length mismatch', () => {
		// Different-length inputs MUST short-circuit to false BEFORE the timingSafeEqual call
		// (which throws on unequal-length buffers). The length check is the pre-condition for
		// the constant-time compare to even be valid.
		expect(validateBearerToken('short', 'longer-token-string')).toBe(false);
	});

	it('MCP-09: validateBearerToken returns true via timingSafeEqual on match', () => {
		const known = 'feed'.repeat(16); // 64 hex chars — same shape as live tokens
		expect(validateBearerToken(known, known)).toBe(true);
		// Mismatch on equal-length input still returns false (timingSafeEqual path).
		expect(validateBearerToken('a'.repeat(64), 'b'.repeat(64))).toBe(false);
	});

	it('MCP-09: resolveBearerToken with auto-generate creates 64-hex token in keychain', async () => {
		const keychain = makeKeychainMock();
		const token = await resolveBearerToken({ keychain, generate: true });
		expect(token).not.toBeNull();
		expect(token).toMatch(/^[0-9a-f]{64}$/);

		// Second call should return the same persisted token (idempotency).
		const second = await resolveBearerToken({ keychain, generate: true });
		expect(second).toBe(token);

		// Sanity-check the keychain stored the token under the documented service/account.
		const stored = await keychain.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_BEARER);
		expect(stored).toBe(token);
	});

	it('MCP-09: resolveBearerToken without generate returns null on absent key', async () => {
		const keychain = makeKeychainMock();
		const token = await resolveBearerToken({ keychain, generate: false });
		expect(token).toBeNull();
	});

	it('MCP-09: sha256Fingerprint returns deterministic 8-hex-char prefix', () => {
		const known = 'feed'.repeat(16);
		const fp = sha256Fingerprint(known);
		expect(fp).toMatch(/^[0-9a-f]{8}$/);
		// Stable across calls — it's a pure hash.
		expect(sha256Fingerprint(known)).toBe(fp);
		// Different input -> different fingerprint.
		expect(sha256Fingerprint('a'.repeat(64))).not.toBe(fp);
	});
});
