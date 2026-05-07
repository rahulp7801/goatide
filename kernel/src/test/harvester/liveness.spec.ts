/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/liveness.spec.ts — Phase 5 Wave-0 refusal stub for TELE-06
// (per-source liveness tracking; bridge banner reflects stale sources).
//
// Plan 05-07 will flip these.

import { describe, it } from 'vitest';

describe('TELE-06: harvester liveness tracking', () => {
	it.skip('recordObservation advances last_observation_ts for source', () => {
		throw new Error('Plan 05-07 has not yet implemented recordObservation (liveness side-effect)');
	});

	it.skip('computeLiveness with injected clock flags stale source past threshold', () => {
		throw new Error('Plan 05-07 has not yet implemented computeLiveness');
	});

	it.skip('just-started kernel does not warn before first observation seen', () => {
		throw new Error('Plan 05-07 has not yet implemented computeLiveness (cold-start grace period)');
	});
});
