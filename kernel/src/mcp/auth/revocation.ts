/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/auth/revocation.ts — Phase 6 (Plan 06-04) MCP-06 per-provider revocation detectors.
//
// Each provider has its own revocation error shape. Concentrated here so the pool's handleError
// can dispatch a single `detectRevocation(provider, error)` call and surface a uniform
// {revoked, reason} result. Documented shapes (06-RESEARCH.md ## Pattern: Per-Client Resilience):
//
//  - Slack:  body.ok === false && body.error in {invalid_auth, account_inactive, token_revoked}
//  - GitHub: status === 401 && headers['WWW-Authenticate']?.startsWith('Bearer ')
//  - Linear: status === 401 && body.errors[0].extensions.code === 'AUTHENTICATION_ERROR'
//  - Jira:   (status === 401 && body.errorMessages?.length > 0) || status === 403
//
// The detectors are pure (no I/O): they accept a structured-error shape (status / headers / body)
// and return {revoked: boolean, reason?: string}. The caller (pool or adapter) is responsible for
// extracting the structured error from whatever wire transport surfaced the failure (HTTP fetch,
// SDK Client error, etc.).

import type { McpProviderName } from '../clients/types.js';

/**
 * Result of a revocation check. `revoked: true` means the pool should transition the provider
 * to 'paused_auth' and surface a banner (Plan 06-06's bridge wiring). `reason` is a stable
 * machine-readable tag for telemetry / log enrichment (e.g. 'invalid_auth', 'token_revoked').
 */
export interface RevocationCheckResult {
	revoked: boolean;
	reason?: string;
}

/**
 * Loose structural shape for the input. Adapters can pass any object — the per-provider
 * detector reaches into whichever fields its shape requires. `unknown` deliberately so this
 * stays decoupled from the SDK's error class hierarchy.
 */
export type StructuredError = Record<string, unknown>;

/**
 * Slack revocation: body.ok=false + body.error in 3 shapes.
 *   - invalid_auth: token recognised as malformed or expired.
 *   - account_inactive: workspace suspended.
 *   - token_revoked: user / admin explicitly revoked.
 */
export function detectSlackRevocation(error: StructuredError): RevocationCheckResult {
	const body = extractBody(error);
	if (!body) {
		return { revoked: false };
	}
	if (body.ok === false && typeof body.error === 'string') {
		const code = body.error;
		if (code === 'invalid_auth' || code === 'account_inactive' || code === 'token_revoked') {
			return { revoked: true, reason: code };
		}
	}
	return { revoked: false };
}

/**
 * GitHub revocation: 401 + WWW-Authenticate Bearer realm. Used for both PAT and OAuth flows.
 */
export function detectGitHubRevocation(error: StructuredError): RevocationCheckResult {
	const status = extractStatus(error);
	if (status !== 401) {
		return { revoked: false };
	}
	const headers = extractHeaders(error);
	if (!headers) {
		return { revoked: false };
	}
	// Header lookup is case-insensitive; node's fetch lowercases by default but raw axios-style
	// dictionaries may preserve case — try both common casings.
	const auth = headers['WWW-Authenticate'] ?? headers['www-authenticate'];
	if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
		return { revoked: true, reason: 'bad_credentials' };
	}
	return { revoked: false };
}

/**
 * Linear revocation: 401 + body.errors[0].extensions.code === 'AUTHENTICATION_ERROR'.
 * Linear's GraphQL transport surfaces auth failures as a top-level errors array with a
 * structured `extensions.code` discriminator.
 */
export function detectLinearRevocation(error: StructuredError): RevocationCheckResult {
	const status = extractStatus(error);
	if (status !== 401) {
		return { revoked: false };
	}
	const body = extractBody(error);
	if (!body) {
		return { revoked: false };
	}
	const errors = body.errors;
	if (!Array.isArray(errors) || errors.length === 0) {
		return { revoked: false };
	}
	const first = errors[0];
	if (first && typeof first === 'object') {
		const extensions = (first as Record<string, unknown>).extensions;
		if (extensions && typeof extensions === 'object') {
			const code = (extensions as Record<string, unknown>).code;
			if (code === 'AUTHENTICATION_ERROR') {
				return { revoked: true, reason: 'AUTHENTICATION_ERROR' };
			}
		}
	}
	return { revoked: false };
}

/**
 * Jira revocation: (401 + body.errorMessages?.length > 0) || 403.
 *   - 401 + errorMessages: token invalid (e.g. revoked or expired API token v1).
 *   - 403: Atlassian's explicit "your token had access removed" / IP block / etc.
 *
 * Plan 06-04 ships v1 (API token); OAuth 2.1 flow + its distinct revocation taxonomy is a
 * Phase-6-iter task.
 */
export function detectJiraRevocation(error: StructuredError): RevocationCheckResult {
	const status = extractStatus(error);
	if (status === 403) {
		return { revoked: true, reason: 'forbidden' };
	}
	if (status === 401) {
		const body = extractBody(error);
		if (body) {
			const messages = body.errorMessages;
			if (Array.isArray(messages) && messages.length > 0) {
				return { revoked: true, reason: 'unauthorized' };
			}
		}
	}
	return { revoked: false };
}

/**
 * Dispatch by provider name. Pool's handleError uses this single entry point so the
 * per-provider error-shape parsing stays inside revocation.ts.
 */
export function detectRevocation(provider: McpProviderName, error: StructuredError): RevocationCheckResult {
	switch (provider) {
		case 'slack': return detectSlackRevocation(error);
		case 'github': return detectGitHubRevocation(error);
		case 'linear': return detectLinearRevocation(error);
		case 'jira': return detectJiraRevocation(error);
	}
}

// --- Internal helpers --------------------------------------------------------------------

function extractStatus(error: StructuredError): number | undefined {
	const direct = error.status;
	if (typeof direct === 'number') {
		return direct;
	}
	const response = error.response as Record<string, unknown> | undefined;
	if (response && typeof response.status === 'number') {
		return response.status;
	}
	return undefined;
}

function extractHeaders(error: StructuredError): Record<string, string> | undefined {
	const direct = error.headers;
	if (direct && typeof direct === 'object') {
		return direct as Record<string, string>;
	}
	const response = error.response as Record<string, unknown> | undefined;
	if (response && response.headers && typeof response.headers === 'object') {
		return response.headers as Record<string, string>;
	}
	return undefined;
}

function extractBody(error: StructuredError): Record<string, unknown> | undefined {
	const direct = error.body;
	if (direct && typeof direct === 'object') {
		return direct as Record<string, unknown>;
	}
	const response = error.response as Record<string, unknown> | undefined;
	if (response && response.body && typeof response.body === 'object') {
		return response.body as Record<string, unknown>;
	}
	return undefined;
}
