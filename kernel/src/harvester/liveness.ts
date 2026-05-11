/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/liveness.ts — Phase 5 Plan 05-07 TELE-06.
//
// Per-source liveness watchdog. The kernel maintains an in-memory Map<ObservationSource,
// number> of last-observation timestamps; on each submitRawObservation call the harvester
// orchestrator (kernel/src/harvester/index.ts) invokes recordObservation BEFORE the filter
// cascade — even rejected observations count toward liveness because the source IS alive.
// computeLiveness({now, thresholds}) returns a LivenessReport[] sorted alphabetically by
// source; the bridge LivenessBanner polls kernel.harvesterGetLiveness every 30s.
//
// Cold-start grace period (## User Constraints): a just-started kernel should not warn
// before the first observation lands per source — never-seen sources fall back to the
// boot timestamp so silent_for_ms = (now - bootTs); stale stays false until at least one
// observation has been recorded for that source.

import type { ObservationSource } from './observations.js';

/**
 * Default per-source thresholds (ms). Per 05-RESEARCH.md ## User Constraints recommendations:
 *   claude_jsonl    = 4h
 *   editor_save     = 30min
 *   terminal_shell  = 4h
 *   git_commit      = 24h
 *
 * Production code reads env GOATIDE_LIVENESS_<SOURCE>_MS to override; the daemon constructs
 * the threshold map from env on bootstrap and passes it through to LivenessState.
 */
export const DEFAULT_LIVENESS_THRESHOLDS: Record<ObservationSource, number> = {
	claude_jsonl: 4 * 60 * 60 * 1000,
	editor_save: 30 * 60 * 1000,
	terminal_shell: 4 * 60 * 60 * 1000,
	git_commit: 24 * 60 * 60 * 1000,
	// Phase 6 Plan 06-05 — mcp_external_signal: 4h default. External MCP writes are bursty
	// (a developer might query a Slack thread or GitHub issue once per task) so the threshold
	// matches claude_jsonl + terminal_shell. Override via env GOATIDE_LIVENESS_MCP_EXTERNAL_SIGNAL_MS.
	mcp_external_signal: 4 * 60 * 60 * 1000,
};

/**
 * One per-source liveness datum returned by computeLiveness. The bridge LivenessBanner
 * (Plan 05-07) renders {source, stale} as a status-bar item; CLI consumers may render
 * `silent_for_ms` and `last_observation_iso` for diagnostic context.
 */
export interface LivenessReport {
	source: ObservationSource;
	stale: boolean;
	silent_for_ms: number;
	threshold_ms: number;
	/** Optional ISO-8601 ts of last recorded observation; undefined if never observed. */
	last_observation_iso?: string;
}

/**
 * In-memory liveness state. One instance per kernel process; the daemon constructs it on
 * startup and passes it into HarvesterDeps.liveness so submitRawObservation can call
 * recordObservation. Bridge polls computeLiveness via the harvester.getLiveness RPC.
 */
export class LivenessState {
	private readonly lastTs = new Map<ObservationSource, number>();
	private readonly bootTs: number;
	/**
	 * Phase 11 Plan 11-04 — test-only forcing of stale sources. When set, sources in this
	 * Set are reported `stale: true` regardless of whether they have ever been observed.
	 * Bypasses the cold-start grace period documented at line 88-91 below. Production daemon
	 * spawns with this Set empty; only the visual-ceremony harness populates it via the
	 * GOATIDE_LIVENESS_TEST_FORCE_STALE_SOURCES env var (parsed in daemon/index.ts).
	 */
	private readonly testForcedStaleSources: Set<ObservationSource>;

	constructor(
		now: () => number = Date.now,
		opts: { testForcedStaleSources?: Iterable<ObservationSource> } = {},
	) {
		this.bootTs = now();
		this.testForcedStaleSources = new Set(opts.testForcedStaleSources ?? []);
	}

	/**
	 * Advance last_observation_ts for the given source. Called from submitRawObservation
	 * BEFORE the filter cascade — even rejected observations count.
	 */
	recordObservation(source: ObservationSource, now: number = Date.now()): void {
		this.lastTs.set(source, now);
	}

	/**
	 * Compute liveness for every known source. Reports are sorted alphabetically by source
	 * for stable output (CLI, snapshot tests). Sources never observed fall back to bootTs
	 * (initial-grace) so a freshly-started kernel never warns before the first observation.
	 *
	 * Phase 11 Plan 11-04 (Rule 1 — bug): the cold-start grace period (`last !== undefined`)
	 * keeps never-observed sources non-stale forever, even when the configured threshold
	 * is sub-second. The visual-ceremony harness needs to exercise the LivenessBanner
	 * status-bar item without firing real observations, so testForcedStaleSources (populated
	 * from GOATIDE_LIVENESS_TEST_FORCE_STALE_SOURCES) bypasses the grace period for the
	 * named sources. Empty set in production = previous behavior preserved byte-for-byte.
	 */
	computeLiveness(opts: {
		now: number;
		thresholds?: Partial<Record<ObservationSource, number>>;
	}): LivenessReport[] {
		const merged = { ...DEFAULT_LIVENESS_THRESHOLDS, ...opts.thresholds };
		const sources = Object.keys(merged).sort() as ObservationSource[];
		const out: LivenessReport[] = [];
		for (const source of sources) {
			const last = this.lastTs.get(source);
			const referenceTs = last ?? this.bootTs;
			const silent = opts.now - referenceTs;
			const threshold = merged[source]!;
			const productionStale = last !== undefined && silent > threshold;
			const testForcedStale = this.testForcedStaleSources.has(source) && silent > threshold;
			out.push({
				source,
				stale: productionStale || testForcedStale,
				silent_for_ms: silent,
				threshold_ms: threshold,
				last_observation_iso: last !== undefined ? new Date(last).toISOString() : undefined,
			});
		}
		return out;
	}
}

/**
 * Resolve per-source thresholds from environment overrides. Each env var
 * GOATIDE_LIVENESS_<SOURCE_UPPERCASE>_MS overrides the DEFAULT_LIVENESS_THRESHOLDS entry
 * for that source. Invalid values (non-numeric, NaN, negative) are silently ignored —
 * defense-in-depth so a typo doesn't disable the watchdog.
 */
export function resolveLivenessThresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): Record<ObservationSource, number> {
	const out = { ...DEFAULT_LIVENESS_THRESHOLDS };
	for (const source of Object.keys(out) as ObservationSource[]) {
		const key = `GOATIDE_LIVENESS_${source.toUpperCase()}_MS`;
		const raw = env[key];
		if (raw === undefined) {
			continue;
		}
		const v = Number.parseInt(raw, 10);
		if (Number.isFinite(v) && v > 0) {
			out[source] = v;
		}
	}
	return out;
}
