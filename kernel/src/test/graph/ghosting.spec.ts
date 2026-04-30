/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/ghosting.spec.ts — Plan 02-03 Task 1.
//
// Defense-in-depth coverage of GRAPH-12 (Ghosting refusal). Three sub-suites in one file:
//   1. predicate     — pure-function unit test of hasGhostingTokens().
//   2. Zod layer     — NodePayloadSchema rejects 'thanks/finished/summary' bodies BEFORE
//                      any DB write, with a friendly error message containing 'Ghosting'.
//   3. CHECK layer   — raw SQL INSERT bypassing the DAO is also refused at the SQLite
//                      CHECK constraint (the structural backstop landed in Wave 1).
//
// If only one layer fired, the defense wouldn't be in-depth. Per VALIDATION.md sign-off:
// Ghosting MUST be tested at BOTH the Zod-refinement layer and the CHECK-constraint layer.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase } from '../../graph/db.js';
import { NodePayloadSchema } from '../../graph/payloads.js';
import { hasGhostingTokens } from '../../graph/ghosting.js';
import { GHOSTING_VIOLATIONS, VALID_PAYLOADS } from '../helpers/seed-fixtures.js';

describe('Ghosting rule (GRAPH-12) — defense-in-depth', () => {
	describe('predicate', () => {
		it('matches all three tokens case-insensitively + handles edge cases', () => {
			expect({
				clean:              hasGhostingTokens('hello world'),
				thanks_lower:       hasGhostingTokens('thanks for the help'),
				THANKS_upper:       hasGhostingTokens('THANKS for the help'),
				finished_embedded:  hasGhostingTokens('I have finished'),
				summary_substring:  hasGhostingTokens('the summary table'),  // intentional false-positive (documented)
				empty:              hasGhostingTokens(''),
				non_string_safe:    hasGhostingTokens(undefined as unknown as string),
			}).toEqual({
				clean:              false,
				thanks_lower:       true,
				THANKS_upper:       true,
				finished_embedded:  true,
				summary_substring:  true,
				empty:              false,
				non_string_safe:    false,
			});
		});
	});

	describe('Zod layer (DAO refusal — friendly error)', () => {
		it('rejects each ghosting fixture with a message containing "Ghosting"', () => {
			const results = Object.entries(GHOSTING_VIOLATIONS).map(([key, payload]) => {
				const r = NodePayloadSchema.safeParse(payload);
				return {
					key,
					success: r.success,
					hasGhostingMsg: !r.success && JSON.stringify(r.error).includes('Ghosting'),
				};
			});
			// All five fixtures must fail; all must reference 'Ghosting' in the error.
			expect(results.every((r) => r.success === false && r.hasGhostingMsg === true)).toBe(true);
		});

		it('accepts every valid payload', () => {
			const allValid = Object.values(VALID_PAYLOADS).every((p) => NodePayloadSchema.safeParse(p).success);
			expect(allValid).toBe(true);
		});
	});

	describe('CHECK constraint layer (raw-SQL bypass refusal)', () => {
		let tmp: TempDb;
		beforeEach(() => { tmp = mkTempDb(); });
		afterEach(() => { tmp.dispose(); });

		it('blocks raw INSERT of a ghosting payload at the SQLite CHECK level', () => {
			const { sqlite, close } = openDatabase(tmp.dbPath);
			try {
				let caught: unknown;
				try {
					// Bypass DAO entirely; insert a payload that contains 'thanks'.
					const ghostBody = JSON.stringify({ kind: 'ConstraintNode', body: 'thanks for reviewing' });
					sqlite.prepare(
						`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`
					).run('01HZGHOSTRAWAAAAAAAAAAAAAA', 'ConstraintNode', ghostBody, 'Explicit');
				} catch (e) {
					caught = e;
				}
				expect(caught).toBeDefined();
				expect((caught as { code?: string }).code).toMatch(/SQLITE_CONSTRAINT/);
				// Alternation rationale: SQLite >= 3.41 includes the constraint name (`nodes_ghosting_rule`)
				// in the failure message. better-sqlite3 12.x bundles SQLite >= 3.46 so the named-constraint
				// pathway is what runs on canonical CI. Older builds (or future SQLite changes) emit only
				// the generic word `CHECK` — the alternation tolerates both without weakening the assertion.
				expect((caught as Error).message).toMatch(/nodes_ghosting_rule|CHECK/i);
			} finally { close(); }
		});

		it('does not flag a payload whose body has none of the three tokens', () => {
			const { sqlite, close } = openDatabase(tmp.dbPath);
			try {
				const cleanBody = JSON.stringify({ kind: 'ConstraintNode', body: 'FK columns must coerce empty-string to NULL' });
				const result = sqlite.prepare(
					`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`
				).run('01HZCLEANRAWAAAAAAAAAAAAAA', 'ConstraintNode', cleanBody, 'Explicit');
				expect(result.changes).toBe(1);
			} finally { close(); }
		});
	});
});
