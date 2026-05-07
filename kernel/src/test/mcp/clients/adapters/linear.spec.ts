/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/adapters/linear.spec.ts — Phase 6 (Plan 06-04) Linear adapter.
//
// Two contracts pinned:
//   1. OAuth refresh fires 5min before expiry (via TokenRefreshScheduler — exercised at the
//      adapter level by checking the scheduler arms its first timer with the threshold delay).
//   2. 401 with extensions.code=AUTHENTICATION_ERROR triggers revocation.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLinearProviderConfig, detectLinearRevocation } from '../../../../mcp/clients/adapters/linear.js';
import { REFRESH_THRESHOLD_MS, TokenRefreshScheduler } from '../../../../mcp/auth/refresh.js';
import { setProviderToken } from '../../../../mcp/auth/keychain.js';
import { makeKeychainMock, makeStaleClock } from '../../../helpers/mcp-fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtures = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'oauth-revocation-fixtures.json'), 'utf8')) as Record<string, Record<string, unknown>>;

describe('MCP-06: Linear adapter — OAuth refresh + revocation detection', () => {
	it('MCP-06: Linear OAuth refresh fires 5min before expiry (TokenRefreshScheduler)', async () => {
		const keychain = makeKeychainMock();
		await setProviderToken(keychain, 'linear', 'access', 'lin_access_v1');
		await setProviderToken(keychain, 'linear', 'refresh', 'lin_refresh_v1');
		const built = await buildLinearProviderConfig({ keychain, command: 'node', args: ['linear-mcp.cjs'] });

		// Wire a TokenRefreshScheduler against the adapter's refreshToken — 1h until expiry.
		const startMs = 1_700_000_000_000;
		const clock = makeStaleClock(startMs);
		const expiresAtMs = startMs + 60 * 60 * 1000;
		const armedDelays: number[] = [];
		const scheduler = new TokenRefreshScheduler({
			provider: 'linear',
			fetchExpiry: async () => expiresAtMs,
			refresh: async () => undefined,
			clock,
			setTimer: (h, d) => { armedDelays.push(d); return { handler: h, delay: d }; },
			clearTimer: () => undefined,
			backoff: { maxAttempts: 1, baseMs: 0, cooldownMs: 0 },
		});
		await scheduler.start();
		scheduler.stop();

		// Null short-circuit when refresh token missing.
		const partialKeychain = makeKeychainMock();
		await setProviderToken(partialKeychain, 'linear', 'access', 'access_only');
		const nullBuilt = await buildLinearProviderConfig({ keychain: partialKeychain, command: 'node', args: [] });

		expect({
			refreshToken: built?.refreshToken,
			builtConfig: built?.config,
			armedDelays,
			expectedDelay: 60 * 60 * 1000 - REFRESH_THRESHOLD_MS,
			nullBuilt,
		}).toEqual({
			refreshToken: 'lin_refresh_v1',
			builtConfig: {
				provider: 'linear',
				command: 'node',
				args: ['linear-mcp.cjs'],
				env: { LINEAR_API_KEY: 'lin_access_v1' },
				cwd: undefined,
			},
			armedDelays: [55 * 60 * 1000],
			expectedDelay: 55 * 60 * 1000,
			nullBuilt: null,
		});
	});

	it('MCP-06: Linear 401 with extensions.code=AUTHENTICATION_ERROR signals revocation', () => {
		const shape = fixtures.linear['401_authentication_error'] as Record<string, unknown>;
		const revoked = detectLinearRevocation(shape);
		expect(revoked).toEqual({ revoked: true, reason: 'AUTHENTICATION_ERROR' });
	});
});
