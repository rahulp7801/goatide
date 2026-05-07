/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/ansi-strip.spec.ts — Phase 5 Plan 04 (TELE-03 kernel-side
// normalize helper).
//
// Asserts the integration shape: normalizeTerminalOutput strips ANSI sequences via
// strip-ansi 7.x AND truncates at MAX_OUTPUT_PER_OBS=32KB AND signals truncated:true on
// overflow. (We do NOT re-test strip-ansi's own ANSI detection — that's its package's
// concern. This is the kernel-side helper integration test.)

import { describe, it, expect } from 'vitest';
import { normalizeTerminalOutput, MAX_OUTPUT_PER_OBS } from '../../harvester/normalize-output.js';

describe('TELE-03: terminal output normalization (strip-ansi + 32KB truncation)', () => {
	it('normalizeTerminalOutput strips ANSI sequences and truncates at MAX_OUTPUT_PER_OBS=32KB with truncated marker', () => {
		// Input has ANSI color + cursor sequences mixed with plaintext, length < 32KB.
		const ansiInput = '\x1b[31mred text\x1b[0m \x1b[2K\x1b[1Aplain';
		const cleanResult = normalizeTerminalOutput(ansiInput);
		expect(cleanResult.cleaned).toBe('red text plain');
		expect(cleanResult.truncated).toBe(false);

		// 50KB plaintext (no ANSI) — must truncate at 32KB.
		const big = 'A'.repeat(50 * 1024);
		const truncResult = normalizeTerminalOutput(big);
		expect(truncResult.cleaned.length).toBe(MAX_OUTPUT_PER_OBS);
		expect(truncResult.truncated).toBe(true);

		// Mixed ANSI + plaintext crossing the 32KB boundary: cleaned length is exactly
		// MAX_OUTPUT_PER_OBS after strip + slice.
		const mixedHead = '\x1b[31m';
		const mixedTail = '\x1b[0m';
		const fillerLen = MAX_OUTPUT_PER_OBS + 100;
		const mixed = mixedHead + 'B'.repeat(fillerLen) + mixedTail;
		const mixedResult = normalizeTerminalOutput(mixed);
		expect(mixedResult.cleaned.length).toBe(MAX_OUTPUT_PER_OBS);
		expect(mixedResult.truncated).toBe(true);
		// Confirm the ANSI prefix did get stripped (otherwise the leading bytes would be
		// the escape sequence, not 'B').
		expect(mixedResult.cleaned[0]).toBe('B');

		// Edge: input exactly at MAX_OUTPUT_PER_OBS after strip → not truncated.
		const exact = 'C'.repeat(MAX_OUTPUT_PER_OBS);
		const exactResult = normalizeTerminalOutput(exact);
		expect(exactResult.cleaned.length).toBe(MAX_OUTPUT_PER_OBS);
		expect(exactResult.truncated).toBe(false);
	});
});
