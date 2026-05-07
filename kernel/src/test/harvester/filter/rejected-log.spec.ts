/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/rejected-log.spec.ts — Phase 5 Wave-0 refusal stub for
// PORT-03 (rejected observations spool to a JSONL log; rotation at 64MB; CLI surface for
// filtering by predicate + time window).
//
// Plan 05-05 flips the first two it.skip; Plan 05-07 flips the CLI test alongside its
// goatide-cli harvest rejections command.

import { describe, it } from 'vitest';

describe('PORT-03: rejected-observation log', () => {
	it.skip('appendRejection writes JSONL line to ~/.config/goatide/rejected_observations.jsonl', () => {
		throw new Error('Plan 05-05 has not yet implemented appendRejection');
	});

	it.skip('log rotates at 64MB threshold to .1/.2; .3 dropped', () => {
		throw new Error('Plan 05-05 has not yet implemented appendRejection (size-based rotation)');
	});

	it.skip('CLI goatide-cli harvest rejections --since 24h --predicate portable filters log', () => {
		throw new Error('Plan 05-07 has not yet implemented goatide-cli harvest rejections');
	});
});
