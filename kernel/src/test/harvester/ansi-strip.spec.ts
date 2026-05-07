/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/ansi-strip.spec.ts — Phase 5 Wave-0 refusal stub for TELE-03
// (kernel-side strip helper integration test, NOT testing strip-ansi's own behavior).
//
// Plan 05-04 will flip the it.skip into a real assertion against normalizeTerminalOutput
// (strip-ansi + 32KB truncation marker).

import { describe, it } from 'vitest';

describe('TELE-03: terminal output normalization (strip-ansi + 32KB truncation)', () => {
	it.skip('normalizeTerminalOutput strips ANSI sequences and truncates at MAX_OUTPUT_PER_OBS=32KB with truncated marker', () => {
		throw new Error('Plan 05-04 has not yet implemented normalizeTerminalOutput');
	});
});
