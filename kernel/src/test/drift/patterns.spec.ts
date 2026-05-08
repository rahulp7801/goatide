/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/patterns.spec.ts — Phase 7 (Plan 07-02) DRIFT-01 unit tests for the
// pure-function pattern evaluators in kernel/src/drift/patterns.ts.
//
// Pitfall-1 false-positive defense is pinned at unit-test level: every pattern variant
// has BOTH a scope-matched-violation case AND a scope-mismatched-no-fire case.
//
// All tests use plain literal inputs (no harness) — pattern evaluators are pure functions
// with zero IO and zero async, so tests run in <50ms per file.

import { describe, it, expect, vi } from 'vitest';
import {
	evalRegexPattern,
	evalJsonpathPattern,
	evalForbiddenImport,
} from '../../drift/patterns.js';
import type { DriftPatternT } from '../../graph/payloads.js';

const CONTRACT_ID = '01HZZZCONTRACT';
const ANCHOR = '/contracts/example.md';

function addedLine(line: string, lineNumber: number): { line: string; lineNumber: number } {
	return { line, lineNumber };
}

describe('drift/patterns — Plan 07-02 (DRIFT-01)', () => {

	describe('evalRegexPattern', () => {
		const requiredPattern: Extract<DriftPatternT, { kind: 'regex' }> = {
			kind: 'regex',
			pattern: 'requireAuth\\(',
			required: true,
			scope: 'src/app/api/**/*.ts',
		};

		it('required:true, pattern missing from added lines → 1 finding', () => {
			const findings = evalRegexPattern(
				[addedLine('export function GET() { return null; }', 10)],
				requiredPattern,
				'src/app/api/users/route.ts',
				ANCHOR,
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
			expect(findings[0]).toMatchObject({
				contract_node_id: CONTRACT_ID,
				contract_anchor_file: ANCHOR,
				pattern_index: 0,
				pattern_kind: 'regex',
				file: 'src/app/api/users/route.ts',
				hunk_line: 10,
				message: 'Required pattern not present in added lines',
			});
		});

		it('required:true, pattern present in any added line → 0 findings', () => {
			const findings = evalRegexPattern(
				[
					addedLine('export async function GET(req) {', 10),
					addedLine('  await requireAuth(req);', 11),
					addedLine('  return NextResponse.json({});', 12),
				],
				requiredPattern,
				'src/app/api/users/route.ts',
				ANCHOR,
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
		});

		it('required:false (forbidden), pattern matches added lines → 1 finding per matching line, sorted by hunk_line', () => {
			const forbiddenPattern: Extract<DriftPatternT, { kind: 'regex' }> = {
				kind: 'regex',
				pattern: 'console\\.log',
				required: false,
				scope: 'src/**/*.ts',
			};
			const findings = evalRegexPattern(
				[
					addedLine('  console.log("debug");', 5),
					addedLine('  doStuff();', 6),
					addedLine('  console.log("trace");', 7),
				],
				forbiddenPattern,
				'src/lib/util.ts',
				ANCHOR,
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(2);
			expect(findings.map((f) => f.hunk_line)).toEqual([5, 7]);
			expect(findings[0].message).toContain('Forbidden pattern matched');
		});

		it('Pitfall-1: pattern.scope mismatched (TS scope vs .py file) → 0 findings even when violation present', () => {
			const findings = evalRegexPattern(
				[addedLine('def login(): pass', 1)],
				requiredPattern,
				'src/auth/login.py',
				ANCHOR,
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
		});

		it('Pitfall-1: pattern.scope undefined; filePath !== contractAnchorFile → 0 findings (anchor-defaulting)', () => {
			const noScopePattern: Extract<DriftPatternT, { kind: 'regex' }> = {
				kind: 'regex',
				pattern: 'TODO',
				required: false,
			};
			const findings = evalRegexPattern(
				[addedLine('// TODO: fix this', 1)],
				noScopePattern,
				'src/some/other/file.ts',
				ANCHOR,
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
		});

		it('Pitfall-1: pattern.scope undefined; filePath === contractAnchorFile → fires correctly', () => {
			const noScopePattern: Extract<DriftPatternT, { kind: 'regex' }> = {
				kind: 'regex',
				pattern: 'TODO',
				required: false,
			};
			const findings = evalRegexPattern(
				[addedLine('// TODO: fix this', 1)],
				noScopePattern,
				ANCHOR,
				ANCHOR,
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
		});
	});

	describe('evalJsonpathPattern', () => {
		const existsPattern: Extract<DriftPatternT, { kind: 'jsonpath' }> = {
			kind: 'jsonpath',
			path: '$.color.primary.light',
			op: 'exists',
		};

		it('op=exists, path resolves → 0 findings', () => {
			const json = JSON.stringify({ color: { primary: { light: '#abc', dark: '#000' } } });
			const findings = evalJsonpathPattern(
				json,
				existsPattern,
				'src/styles/tokens/color.json',
				'src/styles/tokens/color.json',
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
		});

		it('op=exists, path missing → 1 finding', () => {
			const json = JSON.stringify({ color: { primary: { dark: '#000' } } });
			const findings = evalJsonpathPattern(
				json,
				existsPattern,
				'src/styles/tokens/color.json',
				'src/styles/tokens/color.json',
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
			expect(findings[0].pattern_kind).toBe('jsonpath');
			expect(findings[0].message).toContain('exists');
		});

		it('op=eq, value mismatch → 1 finding', () => {
			const eqPattern: Extract<DriftPatternT, { kind: 'jsonpath' }> = {
				kind: 'jsonpath',
				path: '$.version',
				op: 'eq',
				value: '1.0.0',
			};
			const findings = evalJsonpathPattern(
				JSON.stringify({ version: '2.0.0' }),
				eqPattern,
				'pkg.json',
				'pkg.json',
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
			expect(findings[0].message).toContain('eq');
		});

		it('op=in, value not in array → 1 finding', () => {
			const inPattern: Extract<DriftPatternT, { kind: 'jsonpath' }> = {
				kind: 'jsonpath',
				path: '$.spacing[0]',
				op: 'in',
				value: [4, 8, 12, 16, 24, 32, 48, 64],
			};
			const findings = evalJsonpathPattern(
				JSON.stringify({ spacing: [5, 8, 12] }),
				inPattern,
				'tokens.json',
				'tokens.json',
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
			expect(findings[0].message).toContain('in');
		});

		it('filePath does not end in .json/.jsonc → 0 findings (defensive non-JSON skip)', () => {
			const findings = evalJsonpathPattern(
				JSON.stringify({}),
				existsPattern,
				'src/lib/util.ts',
				'src/styles/tokens/color.json',
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
		});

		it('malformed JSON → console.warn + 0 findings (fail open)', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* swallow */ });
			const findings = evalJsonpathPattern(
				'{ not valid json',
				existsPattern,
				'broken.json',
				'broken.json',
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});

	describe('evalForbiddenImport', () => {
		const pattern: Extract<DriftPatternT, { kind: 'forbidden_import' }> = {
			kind: 'forbidden_import',
			module: 'string-similarity',
		};

		it('ES6 import (single-quoted) → 1 finding', () => {
			const findings = evalForbiddenImport(
				[addedLine("import sim from 'string-similarity';", 5)],
				pattern,
				'src/drift/detector.ts',
				'src/drift/detector.ts',
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
			expect(findings[0].pattern_kind).toBe('forbidden_import');
			expect(findings[0].hunk_line).toBe(5);
		});

		it('ES6 import (double-quoted) → 1 finding', () => {
			const findings = evalForbiddenImport(
				[addedLine('import sim from "string-similarity";', 5)],
				pattern,
				'src/drift/detector.ts',
				'src/drift/detector.ts',
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
		});

		it('CommonJS require → 1 finding', () => {
			const findings = evalForbiddenImport(
				[addedLine("const sim = require('string-similarity');", 5)],
				pattern,
				'src/drift/detector.ts',
				'src/drift/detector.ts',
				CONTRACT_ID,
				0,
			);
			expect(findings).toHaveLength(1);
		});

		it('non-import string mention does NOT false-fire', () => {
			const findings = evalForbiddenImport(
				[addedLine("// note: avoid 'string-similarity' library", 5)],
				pattern,
				'src/drift/detector.ts',
				'src/drift/detector.ts',
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
		});

		it('Pitfall-1: filePath !== anchor file (anchor-default scope mismatch) → 0 findings', () => {
			const findings = evalForbiddenImport(
				[addedLine("import sim from 'string-similarity';", 5)],
				pattern,
				'somewhere/else.ts',
				'/contracts/dependency_rules.md',
				CONTRACT_ID,
				0,
			);
			expect(findings).toEqual([]);
		});
	});
});
