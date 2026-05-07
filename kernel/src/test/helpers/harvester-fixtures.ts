/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/helpers/harvester-fixtures.ts — Phase 5 reusable test helpers.
//
// Mirror of canvas-fixtures.ts (Phase 4): pure factory functions, defaults overridable
// via Partial<T>, no live DB inside the helpers. Reused by every Phase-5 spec across
// Plans 05-02..07. The interfaces below intentionally match the wire-shape of the
// in-flight types in kernel/src/harvester/observations.ts (Plan 05-03) — they are
// fixture-only and do NOT replace those source-of-truth definitions when those land.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ulid } from 'ulid';

/**
 * Wire-shape of a raw harvester observation as posted across the bridge<->kernel TCP RPC
 * boundary in Plan 05-03+. Fixture mirrors the eventual source-of-truth definition in
 * kernel/src/harvester/observations.ts — when that lands, this can be replaced with an
 * import. For Wave 0 the duplication is intentional so stubs compile.
 */
export interface RawObservationFixture {
	id: string;
	source: 'claude_jsonl' | 'editor_save' | 'terminal_shell' | 'git_commit';
	body: string;
	file_path: string | null;
	captured_at: string;
	provenance_detail?: Record<string, unknown>;
}

/**
 * Fixture mirror of LockfileContent in kernel/src/daemon/lockfile.ts (Plan 05-02). Allows
 * tests to construct synthetic lockfile contents without depending on the daemon module
 * during Wave 0 stub-authoring.
 */
export interface LockfileContentFixture {
	pid: number;
	rpc_port: number;
	auth_token: string;
	started_at: string;
	version: string;
}

/**
 * Build a fully-formed RawObservation with sensible defaults; overridable via partial.
 * Default source='editor_save' so callers that just need "any observation" get a
 * filter-survivable body shape.
 */
export function makeRawObservation(partial?: Partial<RawObservationFixture>): RawObservationFixture {
	return {
		id: partial?.id ?? ulid(),
		source: partial?.source ?? 'editor_save',
		body: partial?.body ?? 'Renamed UserService.findById to UserService.requireById to enforce non-null contract.',
		file_path: partial?.file_path ?? 'src/services/user.service.ts',
		captured_at: partial?.captured_at ?? new Date().toISOString(),
		provenance_detail: partial?.provenance_detail,
	};
}

/**
 * Pre-marked filter-survivor for promoter tests. Currently identical shape to
 * makeRawObservation (the filter is a runtime predicate, not a structural marker), but
 * exposed as a separate helper so Plan 05-06 can extend the type later if needed.
 */
export function makeAcceptedObservation(partial?: Partial<RawObservationFixture>): RawObservationFixture {
	return makeRawObservation({
		source: 'claude_jsonl',
		body: 'Discount must use BigDecimal arithmetic to avoid float precision drift in the cart subtotal.',
		file_path: 'src/checkout/calculator.ts',
		...partial,
	});
}

/**
 * Build a synthetic LockfileContent. pid defaults to process.pid (alive); port defaults
 * to a random high port (callers needing real binding should call bindEphemeralPort).
 */
export function makeLockfileContent(partial?: Partial<LockfileContentFixture>): LockfileContentFixture {
	return {
		pid: partial?.pid ?? process.pid,
		rpc_port: partial?.rpc_port ?? 50000 + Math.floor(Math.random() * 10000),
		auth_token: partial?.auth_token ?? randomHex(64),
		started_at: partial?.started_at ?? new Date().toISOString(),
		version: partial?.version ?? '0.0.1',
	};
}

interface GoldenCorpusEntry {
	readonly id: string;
	readonly source: RawObservationFixture['source'];
	readonly body: string;
	readonly file_path: string | null;
	readonly expected: {
		readonly kind: 'accept' | 'reject';
		readonly predicate?: string;
		readonly reason?: string;
	};
}

/**
 * Yield (observation, expected_decision) tuples from the hand-crafted golden corpus.
 * Plan 05-05 wires pipeline.spec.ts to iterate this for AND-chain replay.
 */
export function* loadGoldenCorpus(): Generator<{
	observation: RawObservationFixture;
	expected: GoldenCorpusEntry['expected'];
}> {
	const here = dirname(fileURLToPath(import.meta.url));
	const corpusPath = resolve(here, '..', 'harvester', 'filter', 'golden-corpus.json');
	const raw = readFileSync(corpusPath, 'utf8');
	const entries: readonly GoldenCorpusEntry[] = JSON.parse(raw);
	for (const entry of entries) {
		yield {
			observation: makeRawObservation({
				id: entry.id,
				source: entry.source,
				body: entry.body,
				file_path: entry.file_path,
			}),
			expected: entry.expected,
		};
	}
}

/**
 * Injectable monotonic clock for liveness/metrics tests where time advance must be
 * deterministic. now() returns the current internal cursor; advance(deltaMs) moves it.
 */
export function makeStaleClock(initialMs: number): { now: () => number; advance: (deltaMs: number) => void } {
	let cursor = initialMs;
	return {
		now: () => cursor,
		advance: (deltaMs: number) => {
			cursor += deltaMs;
		},
	};
}

function randomHex(charLen: number): string {
	const bytes = new Uint8Array(Math.ceil(charLen / 2));
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, charLen);
}
