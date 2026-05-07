/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/metrics.spec.ts — Phase 5 Wave-0 refusal stub for PORT-06
// (per-source daily accept-rate metrics via harvest_metrics_daily UPSERT; sustained-zero
// detection for early diagnosis of broken watchers).
//
// Plan 05-07 will flip the first three; the CLI test flips alongside Plan 05-07's CLI
// command landing.

import { describe, it } from 'vitest';

describe('PORT-06: harvester daily metrics', () => {
	it.skip('incrementSubmitted/Rejected/Promoted upserts harvest_metrics_daily by (date_utc, source)', () => {
		throw new Error('Plan 05-07 has not yet implemented incrementMetrics');
	});

	it.skip('date_utc derived via injected clock', () => {
		throw new Error('Plan 05-07 has not yet implemented incrementMetrics (clock injection)');
	});

	it.skip('sustainedZeroSources detects 7-day zero-with-floor (>=10/day) pattern', () => {
		throw new Error('Plan 05-07 has not yet implemented sustainedZeroSources');
	});

	it.skip('CLI goatide-cli harvest metrics prints expected table', () => {
		throw new Error('Plan 05-07 has not yet implemented goatide-cli harvest metrics');
	});
});
