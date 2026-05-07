/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/cli/harvest.spec.ts — Phase 5 Wave-0 refusal stub for the harvester CLI
// surface (PORT-03 rejections filter + PORT-06 metrics table).
//
// Plan 05-07 will flip both it.skip blocks alongside the goatide-cli harvest subcommand.

import { describe, it } from 'vitest';

describe('PORT-03 / PORT-06: goatide-cli harvest subcommand', () => {
	it.skip('PORT-03: goatide-cli harvest rejections --since 24h --predicate <name> filters JSONL log by ISO-8601 ts and predicate', () => {
		throw new Error('Plan 05-07 has not yet implemented goatide-cli harvest rejections');
	});

	it.skip('PORT-06: goatide-cli harvest metrics --days 7 prints (date_utc, source) table with accept-rate column', () => {
		throw new Error('Plan 05-07 has not yet implemented goatide-cli harvest metrics');
	});
});
