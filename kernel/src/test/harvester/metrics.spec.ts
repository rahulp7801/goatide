/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/metrics.spec.ts — Phase 5 Plan 05-07 PORT-06.
//
// HarvestMetricsDao wraps harvest_metrics_daily (0005 migration). UPSERT increments by
// (date_utc, source); date_utc derived from injectable clock; sustainedZeroSources flags
// sources with `days` consecutive volume >= floor AND zero promoted_to_node.
//
// CLI test (4th it.skip in this file historically) lives in cli/harvest.spec.ts; this
// spec covers the DAO surface only.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../../graph/db.js';
import {
	HarvestMetricsDao,
	DEFAULT_PORT06_DAYS,
	DEFAULT_PORT06_MIN_VOLUME,
} from '../../harvester/metrics.js';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';

describe('PORT-06: harvester daily metrics', () => {
	let tmp: TempDb;
	let handle: ReturnType<typeof openDatabase>;
	let dao: HarvestMetricsDao;

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new HarvestMetricsDao(handle.sqlite);
	});

	afterEach(() => {
		try { handle.close(); } catch { /* best-effort */ }
		tmp.dispose();
	});

	it('increment* upserts by (date_utc, source); clock-injected date_utc; sustainedZeroSources honors floor', () => {
		// Test 1 — increment* upserts by date+source. 5 incrementSubmitted on the same UTC day
		// at the same source coalesce into a single row with submitted=5.
		const day1 = Date.UTC(2026, 0, 1, 5, 0, 0);                // 2026-01-01T05:00:00Z
		for (let i = 0; i < 5; i++) {
			dao.incrementSubmitted('editor_save', day1);
		}

		// Test 2 — clock-injection: incrementSubmitted on a DIFFERENT UTC date creates a new row.
		const day2 = Date.UTC(2026, 0, 2, 5, 0, 0);                // 2026-01-02T05:00:00Z
		dao.incrementSubmitted('editor_save', day2);

		const editorRows = dao.queryLastDays(31, day2 + 1);

		// Test 3 — sustainedZeroSources: seed 7 days × 4 sources × {submitted: 15, promoted: 0}
		// for claude_jsonl (sustained-zero) + {submitted: 15, promoted: 5} for editor_save
		// (NOT sustained-zero, has promotions). days=7, floor=10 should return ['claude_jsonl'].
		const sustainedRefDay = Date.UTC(2026, 1, 8, 12, 0, 0);    // 2026-02-08T12:00:00Z
		const ONE_DAY_MS = 24 * 60 * 60 * 1000;
		for (let d = 0; d < 7; d++) {
			const t = sustainedRefDay - d * ONE_DAY_MS;
			for (let i = 0; i < 15; i++) {
				dao.incrementSubmitted('claude_jsonl', t);
				dao.incrementSubmitted('editor_save', t);
			}
			for (let i = 0; i < 5; i++) {
				dao.incrementPromoted('editor_save', t);
			}
		}
		const sustainedFull = dao.sustainedZeroSources({
			days: 7,
			minDailyVolumeFloor: 10,
			now: sustainedRefDay,
		});

		// Test 4 — floor not met: seed claude_jsonl with 7 days × {submitted: 5, promoted: 0}
		// (below floor=10) at a DIFFERENT reference day; sustainedZeroSources returns []
		// because the daily volume floor isn't met.
		const lowVolRefDay = Date.UTC(2026, 3, 8, 12, 0, 0);       // 2026-04-08T12:00:00Z
		for (let d = 0; d < 7; d++) {
			const t = lowVolRefDay - d * ONE_DAY_MS;
			for (let i = 0; i < 5; i++) {
				dao.incrementSubmitted('claude_jsonl', t);
			}
		}
		const sustainedFloor = dao.sustainedZeroSources({
			days: 7,
			minDailyVolumeFloor: 10,
			now: lowVolRefDay,
		});

		// Combined snapshot.
		expect({
			editorRowsByDate: editorRows
				.filter((r) => r.source === 'editor_save')
				.map((r) => ({ date_utc: r.date_utc, submitted: r.submitted }))
				.sort((a, b) => a.date_utc.localeCompare(b.date_utc)),
			sustainedFull,
			sustainedFloor,
			defaultDays: DEFAULT_PORT06_DAYS,
			defaultMinVolume: DEFAULT_PORT06_MIN_VOLUME,
		}).toEqual({
			editorRowsByDate: [
				{ date_utc: '2026-01-01', submitted: 5 },
				{ date_utc: '2026-01-02', submitted: 1 },
			],
			sustainedFull: ['claude_jsonl'],
			sustainedFloor: [],
			defaultDays: 7,
			defaultMinVolume: 10,
		});
	});

	it('incrementRejected upserts rejected_by_filter without disturbing submitted/promoted', () => {
		const t = Date.UTC(2026, 0, 1, 5, 0, 0);
		dao.incrementSubmitted('editor_save', t);
		dao.incrementSubmitted('editor_save', t);
		dao.incrementRejected('editor_save', 'portable', t);
		dao.incrementRejected('editor_save', 'portable', t);
		dao.incrementRejected('editor_save', 'verifiable', t);
		dao.incrementPromoted('editor_save', t);

		const rows = dao.queryLastDays(7, t + 1);

		expect(rows.find((r) => r.source === 'editor_save')).toEqual({
			date_utc: '2026-01-01',
			source: 'editor_save',
			submitted: 2,
			rejected_by_filter: 3,
			promoted_to_node: 1,
			contract_overrides: 0,         // Plan 07-06 — additive column on HarvestMetricsRow
		});
	});
});
