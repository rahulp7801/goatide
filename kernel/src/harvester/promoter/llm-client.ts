/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promoter/llm-client.ts — Phase 5 Plan 05-06 PORT-04.
//
// Anthropic SDK wrapper for the Candidate Promoter. Pitfall 5: maxRetries:0 on the SDK
// client itself — we don't want the SDK retrying on Zod-validation parse failures (same
// input would re-fail and burn tokens). Transport-only retries (5xx / network) are
// handled here with a small exponential-backoff helper capped at 3 attempts.

import type { FixtureMessageResponse } from './fixtures-replay.js';

/**
 * Minimal slice of @anthropic-ai/sdk we actually use. Declared structurally so the
 * Promoter doesn't import the SDK in test paths that should not pay the cost.
 */
export interface AnthropicMessagesCreateParams {
	model: string;
	max_tokens: number;
	system: string;
	messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
	tools: ReadonlyArray<{ name: string; description?: string; input_schema: unknown }>;
	tool_choice: { type: 'tool'; name: string };
}

/**
 * Subset of the live Anthropic response shape. The fixture mode returns the same shape
 * (FixtureMessageResponse is structurally compatible).
 */
export type AnthropicMessagesCreateResponse = FixtureMessageResponse;

/**
 * Function shape for the live SDK call. The promoter routes through this when fixture
 * mode is inactive. Tests inject a vi.fn() to verify it is NOT called when fixtures
 * cover the observation.
 */
export type SdkCallFn = (params: AnthropicMessagesCreateParams) => Promise<AnthropicMessagesCreateResponse>;

/**
 * Retry transport-only errors (5xx, network) up to 3 attempts with exponential backoff
 * (50ms / 200ms / 800ms). Zod-validation failures get ZERO retries — the caller filters
 * those out before invoking the retry helper.
 */
export async function callAnthropicMessagesCreate(
	sdkCall: SdkCallFn,
	params: AnthropicMessagesCreateParams,
): Promise<AnthropicMessagesCreateResponse> {
	const delays = [50, 200, 800];
	let lastError: unknown;
	for (let attempt = 0; attempt < delays.length; attempt++) {
		try {
			return await sdkCall(params);
		} catch (e) {
			lastError = e;
			if (!isTransientTransportError(e) || attempt === delays.length - 1) {
				throw e;
			}
			await new Promise((r) => setTimeout(r, delays[attempt]));
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Heuristic check: 5xx HTTP errors and network-level failures are transient; auth
 * failures (401/403) and Bad-Request (400 from a malformed tool schema) are NOT.
 */
function isTransientTransportError(e: unknown): boolean {
	if (!e || typeof e !== 'object') {
		return false;
	}
	const err = e as { status?: number; code?: string; name?: string };
	if (typeof err.status === 'number' && err.status >= 500 && err.status < 600) {
		return true;
	}
	if (typeof err.code === 'string' && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND')) {
		return true;
	}
	if (err.name === 'APIConnectionError' || err.name === 'APIConnectionTimeoutError') {
		return true;
	}
	return false;
}
