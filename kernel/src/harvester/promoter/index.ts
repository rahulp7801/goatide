/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promoter/index.ts — Phase 5 Plan 05-06 PORT-04.
//
// Candidate Promoter orchestrator. Routes a filter-survivor RawObservation either through
// the recorded-fixture mode (CI / unit-test path; never burns tokens) or the live
// Anthropic Messages API call (production path; gated by an OS-keychain API key).
//
// Result is a discriminated union — kind='classified' carries a NodePayload that
// downstream wiring (kernel/src/harvester/index.ts) seeds via dao.seed with
// confidence='Inferred'. All other kinds drop the observation (no graph write); the
// metrics surface (Plan 05-07) increments the corresponding promoter-failure counter.
//
// Mandate B compliance: this module NEVER writes to the graph directly. It only RETURNS a
// payload; supersession is the caller's responsibility (the promotion gate fires on
// Canvas Accept and on N-corroboration thresholds, both of which use dao.supersede).

import { z } from 'zod';
import { NodePayloadSchema, type NodePayload } from '../../graph/payloads.js';
import type { RawObservation } from '../observations.js';
import { promoterToolDefinition } from './tool-schema.js';
import { buildPrompt } from './prompt.js';
import { fixtureLookup, type FixtureMessageResponse } from './fixtures-replay.js';
import { callAnthropicMessagesCreate, type SdkCallFn } from './llm-client.js';

/**
 * Discriminated-union return shape of {@link promote}. Callers branch on `kind`:
 *  - classified: route to dao.seed(payload, confidence='Inferred')
 *  - no_classification: model declined; drop + metrics.incrementPromoterDeclined
 *  - schema_violation: model emitted invalid tool input; drop + metrics.incrementPromoterFailed
 *  - fixture_miss: replay mode but no recorded fixture; drop + metrics.incrementFixtureMiss
 *  - transport_error: live SDK call failed (or no API key); drop + metrics.incrementTransportError
 */
export type PromoterResult =
	| { kind: 'classified'; payload: NodePayload; model: string; usage: { input_tokens: number; output_tokens: number } }
	| { kind: 'no_classification'; reason: string }
	| { kind: 'schema_violation'; errors: z.ZodIssue[] }
	| { kind: 'fixture_miss'; hash: string }
	| { kind: 'transport_error'; cause: string };

/**
 * Promoter context. fixtureDir, when set, routes to recorded-fixture mode and bypasses
 * the SDK entirely. resolveApiKey is invoked in live mode; sdkCall is the function that
 * actually hits Anthropic. Tests inject all three for deterministic execution.
 */
export interface PromoterContext {
	/** When set, fixtureLookup is the source of truth; sdkCall + resolveApiKey are not used. */
	fixtureDir?: string;
	/** Live-mode API-key resolver (default: kernel/src/harvester/promoter/keytar-resolver.ts). */
	resolveApiKey: () => Promise<string | null>;
	/** Live-mode SDK call. Tests pass a vi.fn(); production wires @anthropic-ai/sdk. */
	sdkCall: SdkCallFn;
	/** Anthropic model id (e.g. 'claude-3-5-sonnet-20241022'). */
	model: string;
}

const MAX_TOKENS_DEFAULT = 1024;

/**
 * Run one observation through the Promoter. Always returns a PromoterResult — never
 * throws (transport errors are surfaced via kind='transport_error'). The caller decides
 * what to do with each branch (graph-write on classified; drop otherwise).
 */
export async function promote(observation: RawObservation, ctx: PromoterContext): Promise<PromoterResult> {
	if (ctx.fixtureDir) {
		const fixture = fixtureLookup(observation, ctx.fixtureDir);
		if (!fixture) {
			return { kind: 'fixture_miss', hash: '<see fixtureLookup>' };
		}
		return parseFixtureOrLiveResponse(fixture);
	}

	const apiKey = await ctx.resolveApiKey();
	if (!apiKey) {
		return { kind: 'transport_error', cause: 'no API key available (keytar + ANTHROPIC_API_KEY both empty)' };
	}

	const { system, userContent } = buildPrompt(observation);
	try {
		const response = await callAnthropicMessagesCreate(ctx.sdkCall, {
			model: ctx.model,
			max_tokens: MAX_TOKENS_DEFAULT,
			system,
			messages: [{ role: 'user', content: userContent }],
			tools: [promoterToolDefinition],
			tool_choice: { type: 'tool', name: promoterToolDefinition.name },
		});
		return parseFixtureOrLiveResponse(response);
	} catch (e) {
		return { kind: 'transport_error', cause: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Parse a fixture or live response. Routes through NodePayloadSchema.safeParse for
 * tool_use blocks; surfaces no_classification when the model returned text instead;
 * surfaces schema_violation when Zod rejects the tool input.
 */
function parseFixtureOrLiveResponse(response: FixtureMessageResponse): PromoterResult {
	const toolUse = response.content.find((b) => b.type === 'tool_use');
	if (!toolUse || toolUse.type !== 'tool_use') {
		const text = response.content.find((b) => b.type === 'text');
		return {
			kind: 'no_classification',
			reason: text?.type === 'text' ? text.text : 'model returned no tool_use and no text',
		};
	}
	const parsed = NodePayloadSchema.safeParse(toolUse.input);
	if (!parsed.success) {
		return { kind: 'schema_violation', errors: parsed.error.issues };
	}
	return {
		kind: 'classified',
		payload: parsed.data,
		model: response.model,
		usage: response.usage,
	};
}

export { resolveAnthropicApiKey } from './keytar-resolver.js';
