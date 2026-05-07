/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promoter/fixtures-replay.ts — Phase 5 Plan 05-06 PORT-04.
//
// Recorded-fixture mode for the Promoter LLM call. CI runs replay-only — never burns
// tokens. Hashing is deterministic over the canonicalized observation (sorted keys);
// the fixture lookup reads `<dir>/<sha256-hex>.json` containing a whitelisted subset of
// Anthropic.MessagesResponse (Pitfall 7: NEVER store id / headers / Bearer tokens).
//
// The whitelist enforced here is a runtime safety net; the
// scripts/ci/refuse-credential-leaks-in-fixtures.sh CI gate is the static-analysis backstop.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RawObservation } from '../observations.js';

/** Whitelisted fields stored on disk. Mirrors a subset of Anthropic.Message. */
export interface FixtureMessageResponse {
	content: ReadonlyArray<
		| { type: 'tool_use'; id: string; name: string; input: unknown }
		| { type: 'text'; text: string }
	>;
	model: string;
	role: 'assistant';
	stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
	usage: { input_tokens: number; output_tokens: number };
}

/**
 * Canonicalize an observation for hashing. Sorted-key JSON ensures the hash is stable
 * across object literal ordering. Note that this hash is intentionally based on the
 * runtime observation shape — including ts and id — so different submissions of an
 * "equivalent" observation get distinct hashes. Recorded fixtures must match the EXACT
 * input the test harness submits.
 */
export function canonicalizeObservation(obs: RawObservation): string {
	return JSON.stringify(obs, Object.keys(obs).sort());
}

/**
 * Compute the on-disk hash key for an observation. Exposed for the test harness which
 * stages fixtures into a scratch dir keyed by hash.
 */
export function hashObservation(obs: RawObservation): string {
	return createHash('sha256').update(canonicalizeObservation(obs)).digest('hex');
}

/**
 * Look up a recorded fixture by canonicalized observation hash. Returns null when no
 * matching fixture exists (the Promoter routes to fixture_miss).
 */
export function fixtureLookup(obs: RawObservation, dir: string): FixtureMessageResponse | null {
	const path = join(dir, `${hashObservation(obs)}.json`);
	if (!existsSync(path)) {
		return null;
	}
	const raw = readFileSync(path, 'utf8');
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	return whitelistResponse(parsed);
}

/**
 * Record a fresh response to disk. Strips fields outside the whitelist (Pitfall 7).
 * Only invoked when env GOATIDE_LLM_FIXTURE_RECORD=1 — production never writes here.
 */
export function fixtureRecord(obs: RawObservation, response: Record<string, unknown>, dir: string): void {
	mkdirSync(dirname(join(dir, 'placeholder')), { recursive: true });
	const filtered = whitelistResponse(response);
	const path = join(dir, `${hashObservation(obs)}.json`);
	writeFileSync(path, JSON.stringify(filtered, null, '\t'));
}

/**
 * Apply the field whitelist. Only content / model / role / stop_reason / usage make it
 * to disk; id / Authorization headers / request_id / etc. are dropped. The narrowing also
 * sanitizes content blocks to the two shapes the Promoter expects (tool_use + text).
 */
function whitelistResponse(raw: Record<string, unknown>): FixtureMessageResponse {
	const content = Array.isArray(raw.content)
		? (raw.content as ReadonlyArray<Record<string, unknown>>).map(narrowContentBlock)
		: [];
	return {
		content,
		model: typeof raw.model === 'string' ? raw.model : '',
		role: 'assistant',
		stop_reason: narrowStopReason(raw.stop_reason),
		usage: narrowUsage(raw.usage),
	};
}

function narrowContentBlock(block: Record<string, unknown>): FixtureMessageResponse['content'][number] {
	if (block.type === 'tool_use') {
		return {
			type: 'tool_use',
			id: typeof block.id === 'string' ? block.id : '',
			name: typeof block.name === 'string' ? block.name : '',
			input: block.input,
		};
	}
	return {
		type: 'text',
		text: typeof block.text === 'string' ? block.text : '',
	};
}

function narrowStopReason(value: unknown): FixtureMessageResponse['stop_reason'] {
	if (value === 'end_turn' || value === 'tool_use' || value === 'max_tokens') {
		return value;
	}
	return 'end_turn';
}

function narrowUsage(value: unknown): { input_tokens: number; output_tokens: number } {
	if (value && typeof value === 'object') {
		const v = value as Record<string, unknown>;
		return {
			input_tokens: typeof v.input_tokens === 'number' ? v.input_tokens : 0,
			output_tokens: typeof v.output_tokens === 'number' ? v.output_tokens : 0,
		};
	}
	return { input_tokens: 0, output_tokens: 0 };
}
