/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 4 gap-closure (W12) — AnchorResultCache unit tests.
//
// Per .planning/phases/04-verification-canvas-per-save-tiered/04-VERIFICATION.md ## W12
// Latency Gap. The cache short-circuits repeated kernel.queryNodes RPC calls during the
// per-save Verification Canvas hot path when the same file is saved multiple times within
// a 60-second window. EXACT-key match only (TRAV-06 / Mandate C) — no fuzzy / prefix /
// similarity fallback.

import { describe, it, expect } from 'vitest';
import { AnchorResultCache } from '../../canvas/index.js';
import type { CitationDetail } from '../../canvas/types.js';

const sampleDetails: readonly CitationDetail[] = [
	{ node_id: '01J' + 'A'.repeat(23), kind: 'ConstraintNode' },
];

describe('AnchorResultCache — LRU + TTL + invalidate', () => {
	it('hit returns the cached value; miss returns undefined', () => {
		const cache = new AnchorResultCache();
		cache.set('src/auth.ts|2026-05-06T00:00:00.000Z', sampleDetails);
		expect(cache.get('src/auth.ts|2026-05-06T00:00:00.000Z')).toBe(sampleDetails);
		expect(cache.get('src/other.ts|2026-05-06T00:00:00.000Z')).toBeUndefined();
	});

	it('LRU evicts oldest at capacity', () => {
		const cache = new AnchorResultCache({ maxEntries: 2 });
		cache.set('a|t', sampleDetails);
		cache.set('b|t', sampleDetails);
		cache.set('c|t', sampleDetails); // evicts 'a|t'
		expect(cache.get('a|t')).toBeUndefined();
		expect(cache.get('b|t')).toBe(sampleDetails);
		expect(cache.get('c|t')).toBe(sampleDetails);
	});

	it('get() promotes to most-recently-used', () => {
		const cache = new AnchorResultCache({ maxEntries: 2 });
		cache.set('a|t', sampleDetails);
		cache.set('b|t', sampleDetails);
		cache.get('a|t'); // promote a; now b is LRU
		cache.set('c|t', sampleDetails); // evicts b, not a
		expect(cache.get('a|t')).toBe(sampleDetails);
		expect(cache.get('b|t')).toBeUndefined();
		expect(cache.get('c|t')).toBe(sampleDetails);
	});

	it('TTL expiry returns undefined and removes the entry', () => {
		let now = 1_000_000;
		const cache = new AnchorResultCache({ ttlMs: 60_000, now: () => now });
		cache.set('a|t', sampleDetails);
		now += 30_000;
		expect(cache.get('a|t')).toBe(sampleDetails); // not expired
		now += 31_000; // total elapsed: 61_000 ms > 60_000 ms TTL
		expect(cache.get('a|t')).toBeUndefined();
		expect(cache.size()).toBe(0); // expired entry removed
	});

	it('invalidateByAnchorPath removes all entries with matching prefix', () => {
		const cache = new AnchorResultCache();
		cache.set('src/auth.ts|2026-05-06T00:00:00.000Z', sampleDetails);
		cache.set('src/auth.ts|2026-05-06T00:00:01.000Z', sampleDetails);
		cache.set('src/other.ts|2026-05-06T00:00:00.000Z', sampleDetails);
		const removed = cache.invalidateByAnchorPath('src/auth.ts');
		expect(removed).toBe(2);
		expect(cache.get('src/auth.ts|2026-05-06T00:00:00.000Z')).toBeUndefined();
		expect(cache.get('src/auth.ts|2026-05-06T00:00:01.000Z')).toBeUndefined();
		expect(cache.get('src/other.ts|2026-05-06T00:00:00.000Z')).toBe(sampleDetails);
	});

	it('clear() empties the cache', () => {
		const cache = new AnchorResultCache();
		cache.set('a|t', sampleDetails);
		cache.set('b|t', sampleDetails);
		cache.clear();
		expect(cache.size()).toBe(0);
	});

	it('EXACT match only — no fuzzy / prefix / similarity fallback (TRAV-06 / Mandate C)', () => {
		const cache = new AnchorResultCache();
		cache.set('src/auth.ts|2026-05-06T00:00:00.000Z', sampleDetails);
		// Subset, superset, similar, and case-shifted keys all miss.
		expect(cache.get('src/auth.ts')).toBeUndefined();
		expect(cache.get('src/auth.ts|')).toBeUndefined();
		expect(cache.get('SRC/AUTH.TS|2026-05-06T00:00:00.000Z')).toBeUndefined();
		expect(cache.get('src/Auth.ts|2026-05-06T00:00:00.000Z')).toBeUndefined();
	});
});
