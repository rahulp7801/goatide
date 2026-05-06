/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/canvas/anchor-cache.ts — Phase 4 gap-closure (W12; 04-VERIFICATION.md).
//
// LRU + TTL cache at the bridge<->kernel boundary on (anchorPath, asOf) -> CitationDetail[].
// Short-circuits repeated `kernel.queryNodes` RPC calls during the per-save Verification
// Canvas hot path when the same file is saved multiple times within a 60-second window.
//
// EXACT-key invariant (TRAV-06 / Mandate C): keys are compared verbatim. There is no fuzzy
// match, no prefix match, no similarity match. A miss falls through to the source of truth
// (kernel.queryNodes); never to a "did you mean" fallback.
//
// Eviction: LRU bounded at DEFAULT_MAX_ENTRIES = 100. Setting the 101st entry evicts the
// least-recently-used. `get()` on a hit promotes the entry to most-recently-used by
// delete-then-re-set (Map insertion order = LRU recency).
//
// Expiry: TTL at DEFAULT_TTL_MS = 60_000. A get() more than TTL ms after that key's set()
// returns undefined AND removes the entry. The class does not run a timer; expiry is checked
// on access (lazy invalidation - sufficient since the cache is bounded).
//
// Invalidation: `invalidateByAnchorPath(path)` removes ALL entries whose key starts with
// `${path}|`. Used by the bridge save-gate when a save mutates the graph (DAO seed/supersede
// advances graph_snapshot_tx_time; the cache key embeds asOf so stale entries are unreachable
// by construction - but invalidateByAnchorPath is provided for explicit eviction flows).

import type { CitationDetail } from './types.js';

export const DEFAULT_MAX_ENTRIES = 100;
export const DEFAULT_TTL_MS = 60_000;

interface CacheEntry {
	value: readonly CitationDetail[];
	expiresAt: number;
}

export interface AnchorResultCacheOptions {
	maxEntries?: number;
	ttlMs?: number;
	now?: () => number; // injected for testability
}

export class AnchorResultCache {
	private readonly maxEntries: number;
	private readonly ttlMs: number;
	private readonly now: () => number;
	private readonly entries = new Map<string, CacheEntry>();

	constructor(options: AnchorResultCacheOptions = {}) {
		this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.now = options.now ?? (() => Date.now());
	}

	/**
	 * Look up an entry. EXACT key match only. Returns undefined on miss or TTL expiry.
	 * On a hit, promotes the entry to most-recently-used.
	 */
	get(key: string): readonly CitationDetail[] | undefined {
		const entry = this.entries.get(key);
		if (entry === undefined) {
			return undefined;
		}
		if (this.now() >= entry.expiresAt) {
			this.entries.delete(key);
			return undefined;
		}
		// Promote to most-recently-used by re-inserting.
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}

	/**
	 * Store an entry. Evicts the least-recently-used entry if at capacity.
	 */
	set(key: string, value: readonly CitationDetail[]): void {
		if (this.entries.has(key)) {
			this.entries.delete(key);
		} else if (this.entries.size >= this.maxEntries) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey !== undefined) {
				this.entries.delete(oldestKey);
			}
		}
		this.entries.set(key, {
			value,
			expiresAt: this.now() + this.ttlMs,
		});
	}

	/**
	 * Invalidate all entries whose key starts with `${anchorPath}|`. Returns the number
	 * of entries removed. EXACT prefix match - does not fuzzy-match path components.
	 */
	invalidateByAnchorPath(anchorPath: string): number {
		const prefix = `${anchorPath}|`;
		let removed = 0;
		for (const key of Array.from(this.entries.keys())) {
			if (key.startsWith(prefix)) {
				this.entries.delete(key);
				removed++;
			}
		}
		return removed;
	}

	clear(): void {
		this.entries.clear();
	}

	size(): number {
		return this.entries.size;
	}
}
