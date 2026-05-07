/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/auth/revocation.spec.ts — Phase 6 (Plan 06-04) MCP-06 per-provider revocation.
//
// Each detector consumes a structured-error shape and returns {revoked, reason}. The fixtures
// in oauth-revocation-fixtures.json codify the documented per-provider revocation taxonomy
// (Slack 3 shapes, GitHub 401+WWW-Authenticate, Linear 401+extensions.code, Jira 401|403);
// this spec exercises the detector against each shape via the dispatcher (detectRevocation).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectRevocation } from '../../../mcp/auth/revocation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturesPath = resolve(__dirname, '..', 'fixtures', 'oauth-revocation-fixtures.json');
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Record<string, Record<string, unknown>>;

describe('MCP-06: per-provider revocation detector returns {revoked: true, reason}', () => {
	it('MCP-06: Slack revocation detector handles 3 distinct error shapes (invalid_auth/account_inactive/token_revoked)', () => {
		const shapes = fixtures.slack as Record<string, unknown>;
		// Slack body comes through the SDK as the response body; wrap it in {body: ...}
		// since the detector reaches into error.body or error.response.body.
		const invalidAuth = detectRevocation('slack', { body: shapes.invalid_auth });
		const accountInactive = detectRevocation('slack', { body: shapes.account_inactive });
		const tokenRevoked = detectRevocation('slack', { body: shapes.token_revoked });
		// A non-revocation shape (ok=false but error not in our 3-shape allowlist) must NOT flag.
		const unrelated = detectRevocation('slack', { body: { ok: false, error: 'rate_limited' } });
		expect({ invalidAuth, accountInactive, tokenRevoked, unrelated }).toEqual({
			invalidAuth: { revoked: true, reason: 'invalid_auth' },
			accountInactive: { revoked: true, reason: 'account_inactive' },
			tokenRevoked: { revoked: true, reason: 'token_revoked' },
			unrelated: { revoked: false },
		});
	});

	it('MCP-06: GitHub revocation detector returns {revoked:true, reason} on 401 + WWW-Authenticate Bearer realm', () => {
		const shape = fixtures.github['401_with_www_authenticate'] as Record<string, unknown>;
		const revoked = detectRevocation('github', shape);
		// 200 + same headers must NOT flag.
		const ok = detectRevocation('github', { status: 200, headers: shape.headers, body: shape.body });
		// 401 without WWW-Authenticate must NOT flag (could be a different 401 reason).
		const noHeader = detectRevocation('github', { status: 401, headers: {}, body: { message: 'something else' } });
		expect({ revoked, ok, noHeader }).toEqual({
			revoked: { revoked: true, reason: 'bad_credentials' },
			ok: { revoked: false },
			noHeader: { revoked: false },
		});
	});

	it('MCP-06: Linear revocation detector returns {revoked:true, reason} on 401 + extensions.code=AUTHENTICATION_ERROR', () => {
		const shape = fixtures.linear['401_authentication_error'] as Record<string, unknown>;
		const revoked = detectRevocation('linear', shape);
		// 401 without GraphQL errors body must NOT flag.
		const noErrors = detectRevocation('linear', { status: 401, body: {} });
		// 401 with errors but no extensions.code must NOT flag.
		const noCode = detectRevocation('linear', { status: 401, body: { errors: [{ message: 'other' }] } });
		expect({ revoked, noErrors, noCode }).toEqual({
			revoked: { revoked: true, reason: 'AUTHENTICATION_ERROR' },
			noErrors: { revoked: false },
			noCode: { revoked: false },
		});
	});

	it('MCP-06: Jira revocation detector returns {revoked:true, reason} on 401 errorMessages OR 403 explicit', () => {
		const unauthorized = fixtures.jira['401_unauthorized'] as Record<string, unknown>;
		const forbidden = fixtures.jira['403_forbidden'] as Record<string, unknown>;
		const revoked401 = detectRevocation('jira', unauthorized);
		const revoked403 = detectRevocation('jira', forbidden);
		// 401 without errorMessages must NOT flag (could be unrelated).
		const noMsgs = detectRevocation('jira', { status: 401, body: { errorMessages: [] } });
		// 200 must NOT flag.
		const ok = detectRevocation('jira', { status: 200, body: {} });
		expect({ revoked401, revoked403, noMsgs, ok }).toEqual({
			revoked401: { revoked: true, reason: 'unauthorized' },
			revoked403: { revoked: true, reason: 'forbidden' },
			noMsgs: { revoked: false },
			ok: { revoked: false },
		});
	});
});
