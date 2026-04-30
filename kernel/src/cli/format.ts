/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/format.ts — Phase 2 (Plan 02-04) output formatting helpers.
//
// Two ergonomics:
//   - seed/supersede return ONE id → JSON {"id":"..."} / {"newId":"..."}
//   - query returns a SET → table by default; --json for scripting
// Errors → stderr; non-zero exit code; ZodError specially formatted with the path.
//
// Per 02-RESEARCH.md ## Open Questions #5.

import type { NodeRow } from '../graph/index.js';
import { ZodError } from 'zod';

const COLS = ['id', 'kind', 'confidence', 'valid_from', 'recorded_at'] as const;
type Col = typeof COLS[number];

/**
 * Render NodeRow[] as a fixed-width table.
 *
 * Body is appended on a separate indented tail line per row so it doesn't blow out
 * the column budget. Full structured payloads stay accessible via --json.
 */
export function formatNodeTable(rows: NodeRow[]): string {
	if (rows.length === 0) {
		return 'No results.\n';
	}
	const widths = Object.fromEntries(COLS.map((c) => [c, c.length])) as Record<Col, number>;
	for (const r of rows) {
		for (const c of COLS) {
			const v = String((r as unknown as Record<string, unknown>)[c] ?? '');
			if (v.length > widths[c]) {
				widths[c] = v.length;
			}
		}
	}
	const lines: string[] = [];
	lines.push(COLS.map((c) => c.padEnd(widths[c])).join('  '));
	lines.push(COLS.map((c) => '-'.repeat(widths[c])).join('  '));
	for (const r of rows) {
		lines.push(COLS.map((c) => String((r as unknown as Record<string, unknown>)[c] ?? '').padEnd(widths[c])).join('  '));
	}
	// Append body lines (indented tail) for readability without spending column budget.
	for (const r of rows) {
		const body = (r.payload as { body?: string })?.body ?? '';
		lines.push(`  └─ body: ${body}`);
	}
	return lines.join('\n') + '\n';
}

/** Emit NodeRow[] as a pretty-printed JSON array (script-friendly). */
export function formatNodeJson(rows: NodeRow[]): string {
	return JSON.stringify(rows, null, 2) + '\n';
}

/** Convert Zod / generic / unknown errors into a single-line stderr message. */
export function formatError(e: unknown, fallback: string): string {
	if (e instanceof ZodError) {
		const issue = e.issues[0];
		const issuePath = issue?.path?.join('.') || '(root)';
		const message = issue?.message ?? 'validation failed';
		return `${fallback}: ${message} (at ${issuePath})`;
	}
	if (e instanceof Error) {
		return `${fallback}: ${e.message}`;
	}
	return `${fallback}: ${String(e)}`;
}
