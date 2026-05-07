/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/normalize-output.ts — Phase 5 Plan 04 (TELE-03 kernel-side
// terminal-output normalization).
//
// Strips ANSI escape sequences via strip-ansi 7.x (Plan 05-01 dependency) and truncates
// the result at MAX_OUTPUT_PER_OBS = 32 * 1024 bytes. Pure function; no I/O. Centralised
// here so the bridge stays lean (no strip-ansi dep added to bridge package.json) — the
// bridge sends raw output and the kernel's harvester.submitObservation handler normalizes
// before forwarding to the filter/promoter pipeline.
//
// Truncation is character-count not byte-count: strip-ansi returns a string and the
// downstream RawObservationSchema body is a JS string. The 32KB limit corresponds to the
// observation row's storage budget in harvest_metrics_daily / nodes (per 05-RESEARCH.md
// ## Sizing).

import stripAnsi from 'strip-ansi';

/** Per-observation maximum cleaned-output length. Crossing this triggers truncation
 * marker in the observation's detail field. */
export const MAX_OUTPUT_PER_OBS = 32 * 1024;

export interface NormalizedOutput {
	cleaned: string;
	truncated: boolean;
}

/**
 * Strip ANSI sequences and truncate at MAX_OUTPUT_PER_OBS. Returns truncated:true if the
 * post-strip length exceeded the limit (the cleaned field is exactly MAX_OUTPUT_PER_OBS
 * chars in that case).
 */
export function normalizeTerminalOutput(raw: string): NormalizedOutput {
	const stripped = stripAnsi(raw);
	if (stripped.length <= MAX_OUTPUT_PER_OBS) {
		return { cleaned: stripped, truncated: false };
	}
	return { cleaned: stripped.slice(0, MAX_OUTPUT_PER_OBS), truncated: true };
}
