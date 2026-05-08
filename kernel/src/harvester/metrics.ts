/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/metrics.ts — Phase 5 Plan 05-07 PORT-06.
//
// HarvestMetricsDao wraps the harvest_metrics_daily table created by the 0005 migration
// (Plan 05-01). Three UPSERT counters land per (date_utc, source):
//   - submitted          (incrementSubmitted called on every submitRawObservation entry)
//   - rejected_by_filter (incrementRejected called on every filter reject)
//   - promoted_to_node   (incrementPromoted called when the Promoter classifies)
//
// sustainedZeroSources({days, minDailyVolumeFloor, now}) flags sources where ALL <days>
// recent days saw submitted >= floor AND ALL <days> recent days saw promoted_to_node === 0.
// PORT-06 calibration surface: a source that's seeing volume but never producing nodes is
// either broken (watcher misconfigured) or filter-tuned-too-tight; either way the developer
// needs to know.

import type Database from 'better-sqlite3';
import type { ObservationSource } from './observations.js';

/**
 * Default sustained-zero parameters. Per 05-RESEARCH.md recommendations + PORT-06 spec.
 * Both config-driven via env GOATIDE_PORT06_DAYS and GOATIDE_PORT06_MIN_VOL.
 */
export const DEFAULT_PORT06_DAYS = 7;
export const DEFAULT_PORT06_MIN_VOLUME = 10;

/**
 * One row of harvest_metrics_daily — the (date_utc, source) primary key + four counters.
 *
 * Phase 7 Plan 07-06 (DRIFT-06): contract_overrides counts contract-lock overrides keyed by
 * source='canvas' (the literal source for override Attempts — distinct from the Phase-5
 * harvester sources like 'editor_save', 'terminal_shell', 'git_commit', 'claude_jsonl').
 * Migration 0007 added the column with NOT NULL DEFAULT 0 so Phase-2..6 rows backfill cleanly.
 */
export interface HarvestMetricsRow {
	date_utc: string;            // YYYY-MM-DD UTC
	source: string;              // ObservationSource string OR 'canvas' (Plan 07-06 contract_override source)
	submitted: number;
	rejected_by_filter: number;
	promoted_to_node: number;
	contract_overrides: number;  // Plan 07-06 — DRIFT-06 frequency counter (source='canvas')
}

interface SustainedZeroOpts {
	days: number;
	minDailyVolumeFloor: number;
	now: number;
}

/**
 * Convert a wall-clock millisecond timestamp into the UTC YYYY-MM-DD string used as the
 * harvest_metrics_daily.date_utc primary-key half. Pure function so callers can inject
 * a stable clock for deterministic tests.
 */
export function dateUtcFromMs(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/**
 * DAO for the harvest_metrics_daily table. Construct once per DB connection; share across
 * orchestrator invocations. Methods are synchronous (better-sqlite3 contract).
 */
export class HarvestMetricsDao {
	private readonly upsertSubmittedStmt: Database.Statement;
	private readonly upsertRejectedStmt: Database.Statement;
	private readonly upsertPromotedStmt: Database.Statement;
	private readonly upsertContractOverrideStmt: Database.Statement;
	private readonly queryRangeStmt: Database.Statement;

	constructor(sqlite: Database.Database) {
		// One UPSERT per counter so the +1 is applied to the correct column. ON CONFLICT
		// targets the (date_utc, source) primary key; the WHERE-less DO UPDATE applies to
		// the matched row exclusively (better-sqlite3 + SQLite semantics).
		//
		// Phase 7 Plan 07-06 — every INSERT supplies the contract_overrides column as 0
		// (zero) so the Phase-5 counters and the Phase-7 counter co-exist on the same row
		// shape. Only incrementContractOverride seeds it as 1 / increments by +1.
		this.upsertSubmittedStmt = sqlite.prepare(`
			INSERT INTO harvest_metrics_daily (date_utc, source, submitted, rejected_by_filter, promoted_to_node, contract_overrides)
			VALUES (?, ?, 1, 0, 0, 0)
			ON CONFLICT(date_utc, source) DO UPDATE SET submitted = submitted + 1
		`);
		this.upsertRejectedStmt = sqlite.prepare(`
			INSERT INTO harvest_metrics_daily (date_utc, source, submitted, rejected_by_filter, promoted_to_node, contract_overrides)
			VALUES (?, ?, 0, 1, 0, 0)
			ON CONFLICT(date_utc, source) DO UPDATE SET rejected_by_filter = rejected_by_filter + 1
		`);
		this.upsertPromotedStmt = sqlite.prepare(`
			INSERT INTO harvest_metrics_daily (date_utc, source, submitted, rejected_by_filter, promoted_to_node, contract_overrides)
			VALUES (?, ?, 0, 0, 1, 0)
			ON CONFLICT(date_utc, source) DO UPDATE SET promoted_to_node = promoted_to_node + 1
		`);
		this.upsertContractOverrideStmt = sqlite.prepare(`
			INSERT INTO harvest_metrics_daily (date_utc, source, submitted, rejected_by_filter, promoted_to_node, contract_overrides)
			VALUES (?, ?, 0, 0, 0, 1)
			ON CONFLICT(date_utc, source) DO UPDATE SET contract_overrides = contract_overrides + 1
		`);
		this.queryRangeStmt = sqlite.prepare(`
			SELECT date_utc, source, submitted, rejected_by_filter, promoted_to_node, contract_overrides
			FROM harvest_metrics_daily
			WHERE date_utc >= ?
			ORDER BY date_utc DESC, source ASC
		`);
	}

	incrementSubmitted(source: ObservationSource, now: number = Date.now()): void {
		this.upsertSubmittedStmt.run(dateUtcFromMs(now), source);
	}

	/**
	 * Increment the daily rejected_by_filter counter for the given source.
	 *
	 * The predicate that caused the reject is intentionally NOT stored in the daily roll-up
	 * (PORT-03's rejected_observations.jsonl carries that detail). The predicate parameter
	 * is accepted only so the call site stays self-documenting at the orchestrator boundary.
	 */
	incrementRejected(source: ObservationSource, _predicate: string, now: number = Date.now()): void {
		this.upsertRejectedStmt.run(dateUtcFromMs(now), source);
	}

	incrementPromoted(source: ObservationSource, now: number = Date.now()): void {
		this.upsertPromotedStmt.run(dateUtcFromMs(now), source);
	}

	/**
	 * Phase 7 Plan 07-06 (DRIFT-06): bump the daily contract_overrides counter for the given
	 * source. Source is restricted to the literal 'canvas' because contract_override Attempts
	 * originate from the Canvas modal — there is no other path that writes them. (The type
	 * keeps the surface narrow; future surfaces, e.g. an MCP-driven override flow, would add
	 * a new literal here AND extend the refusal-gate sentinel set.)
	 *
	 * Pitfall-9 shame-loop defense: this counter is read by `goatide-cli harvest metrics`
	 * (opt-in CLI surface) ONLY. The bridge LivenessBanner / SchemaDriftBanner do NOT
	 * subscribe to this counter — silent surfacing would create a self-defeating shame loop
	 * (developers avoid overrides to dodge the badge, not because the contract is sound).
	 */
	incrementContractOverride(source: 'canvas', now: number = Date.now()): void {
		this.upsertContractOverrideStmt.run(dateUtcFromMs(now), source);
	}

	/**
	 * Return all rows from harvest_metrics_daily within the last `days` days (inclusive of
	 * today, derived from `now`). Rows sorted by (date_utc DESC, source ASC).
	 */
	queryLastDays(days: number, now: number = Date.now()): HarvestMetricsRow[] {
		const ONE_DAY_MS = 24 * 60 * 60 * 1000;
		const cutoff = dateUtcFromMs(now - (days - 1) * ONE_DAY_MS);
		return this.queryRangeStmt.all(cutoff) as HarvestMetricsRow[];
	}

	/**
	 * Return the list of sources where EVERY one of the last `days` days saw at least
	 * `minDailyVolumeFloor` submitted observations AND zero promoted_to_node. The floor
	 * filter prevents flagging sources with too little signal to draw a conclusion.
	 *
	 * Implementation walks the day window in JS (one row per (date, source); typical
	 * <days * 4 source> = 28 rows), avoiding a multi-CTE SQL aggregation in the DAO layer.
	 */
	sustainedZeroSources(opts: SustainedZeroOpts): string[] {
		const ONE_DAY_MS = 24 * 60 * 60 * 1000;
		const expectedDays: string[] = [];
		for (let i = 0; i < opts.days; i++) {
			expectedDays.push(dateUtcFromMs(opts.now - i * ONE_DAY_MS));
		}
		const minDate = expectedDays[expectedDays.length - 1];
		const rows = this.queryRangeStmt.all(minDate) as HarvestMetricsRow[];

		// Group rows by source -> Map<date_utc, row>.
		const bySource = new Map<string, Map<string, HarvestMetricsRow>>();
		for (const row of rows) {
			let inner = bySource.get(row.source);
			if (!inner) {
				inner = new Map();
				bySource.set(row.source, inner);
			}
			inner.set(row.date_utc, row);
		}

		const out: string[] = [];
		for (const [source, dateMap] of bySource) {
			let qualifies = true;
			for (const day of expectedDays) {
				const row = dateMap.get(day);
				if (!row) {
					qualifies = false;
					break;
				}
				if (row.submitted < opts.minDailyVolumeFloor) {
					qualifies = false;
					break;
				}
				if (row.promoted_to_node !== 0) {
					qualifies = false;
					break;
				}
			}
			if (qualifies) {
				out.push(source);
			}
		}
		return out.sort();
	}
}

/**
 * Resolve sustained-zero parameters from environment overrides. GOATIDE_PORT06_DAYS and
 * GOATIDE_PORT06_MIN_VOL replace the defaults. Invalid values (non-numeric, NaN, <=0) are
 * silently ignored.
 */
export function resolvePort06ParamsFromEnv(env: NodeJS.ProcessEnv = process.env): { days: number; minDailyVolumeFloor: number } {
	const daysRaw = env.GOATIDE_PORT06_DAYS;
	const minVolRaw = env.GOATIDE_PORT06_MIN_VOL;
	const days = parseIntOrDefault(daysRaw, DEFAULT_PORT06_DAYS);
	const minDailyVolumeFloor = parseIntOrDefault(minVolRaw, DEFAULT_PORT06_MIN_VOLUME);
	return { days, minDailyVolumeFloor };
}

function parseIntOrDefault(raw: string | undefined, fallback: number): number {
	if (raw === undefined) {
		return fallback;
	}
	const v = Number.parseInt(raw, 10);
	if (!Number.isFinite(v) || v <= 0) {
		return fallback;
	}
	return v;
}
