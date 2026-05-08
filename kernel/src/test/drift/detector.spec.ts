/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/detector.spec.ts — Phase 7 (Plan 07-02) DRIFT-01 orchestrator tests.
//
// runDriftDetector orchestrates parsePatch (diff package) → per-hunk added-line extraction →
// per-registered-pattern dispatch (regex / jsonpath / forbidden_import). Returns
// DriftFinding[] sorted deterministically. Mandate-C exact-equality only.
//
// Tests use makeDriftHarness from _setup.ts to seed real ContractNode fixtures into a
// temp SQLite DB; loadContractRegistry materializes them; runDriftDetector consumes the
// registry + a hand-written unified-diff string.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDriftHarness, type DriftHarness } from './_setup.js';
import { loadContractRegistry } from '../../drift/registry.js';
import { runDriftDetector } from '../../drift/detector.js';

/** Build a minimal unified-diff string with ONE hunk of `+` lines and `-` lines. */
function makeDiff(filePath: string, newStart: number, addedLines: string[], deletedLines: string[] = []): string {
	const out: string[] = [];
	out.push(`--- a/${filePath}`);
	out.push(`+++ b/${filePath}`);
	const newLines = addedLines.length;
	const oldLines = deletedLines.length;
	out.push(`@@ -${newStart},${oldLines} +${newStart},${newLines} @@`);
	for (const l of deletedLines) {
		out.push(`-${l}`);
	}
	for (const l of addedLines) {
		out.push(`+${l}`);
	}
	out.push('');
	return out.join('\n');
}

describe('drift/detector — Plan 07-02 (DRIFT-01)', () => {
	let harness: DriftHarness;

	beforeEach(() => {
		harness = makeDriftHarness();
	});

	afterEach(() => {
		harness.cleanup();
	});

	it('empty diff → 0 findings', async () => {
		harness.seedContractFixture('api-security');
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		const findings = runDriftDetector({ diff: '', contractRegistry: registry, asOf });
		expect(findings).toEqual([]);
	});

	it('diff to a file with NO matching contract scope → 0 findings', async () => {
		harness.seedContractFixture('api-security'); // scope: src/app/api/**/*.ts
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		const diff = makeDiff('docs/notes.md', 1, ['# Just a doc edit']);
		const findings = runDriftDetector({ diff, contractRegistry: registry, asOf });
		expect(findings).toEqual([]);
	});

	it('detects regex required-pattern violation in added line', async () => {
		harness.seedContractFixture('api-security'); // requireAuth\( required
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		// Added lines do NOT contain requireAuth(
		const diff = makeDiff('src/app/api/users/route.ts', 1, [
			'export async function GET(req) {',
			'  return NextResponse.json({});',
			'}',
		]);
		const findings = runDriftDetector({ diff, contractRegistry: registry, asOf });
		expect(findings.length).toBeGreaterThanOrEqual(1);
		expect(findings[0].pattern_kind).toBe('regex');
		expect(findings[0].file).toBe('src/app/api/users/route.ts');
		expect(findings[0].message).toContain('Required pattern not present');
	});

	it('detects forbidden_import violation in added line', async () => {
		harness.seedContractFixture('dependency-rules'); // forbidden_import: string-similarity, etc.
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		// dependency-rules anchor is /contracts/dependency_rules.md → forbidden_import
		// only fires when filePath === anchor.file (anchor-defaulting).
		const diff = makeDiff('/contracts/dependency_rules.md', 1, [
			"import sim from 'string-similarity';",
		]);
		const findings = runDriftDetector({ diff, contractRegistry: registry, asOf });
		expect(findings.length).toBeGreaterThanOrEqual(1);
		const fbiFinding = findings.find((f) => f.pattern_kind === 'forbidden_import');
		expect(fbiFinding).toBeDefined();
		expect(fbiFinding?.message).toContain('string-similarity');
	});

	it('detects jsonpath pattern violation in JSON file', async () => {
		harness.seedContractFixture('design-tokens');
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		// Anchor is /contracts/design_tokens.md, but jsonpath patterns have NO scope
		// field at all on the schema, so they default to anchor.file. To trigger
		// against a real .json file, the diff filename must match the anchor (the
		// design-tokens contract's anchor IS the contract markdown file). To make
		// the jsonpath pattern fire, we craft a diff to a file that ends in .json
		// AND matches the anchor file → use a fixture where the anchor file IS .json.
		// Since the fixture's anchor is .md, simulate the production case where
		// loadContractRegistry would have a contract with anchor pointing at a .json.
		// Instead: we test that a .json diff matching the anchor file produces findings.
		// Since fixture anchor is /contracts/design_tokens.md (not .json), no fire.
		// Use a hand-seeded contract instead.

		harness.dao.seed({
			payload: {
				kind: 'ContractNode',
				body: '# Tokens lock\n## Color\nrequires light + dark.',
				anchor: { file: 'src/styles/tokens.json' },
				contract_path: 'src/styles/tokens.json',
				patterns: [
					{ kind: 'jsonpath', path: '$.color.primary.light', op: 'exists' },
				],
			},
			provenance: { source: 'cli', actor: 'detector-test' },
		});

		const registry2 = await loadContractRegistry(harness.dao, asOf);

		// Reconstruct the new file content as JSON missing the path.
		const jsonContent = '{"color":{"primary":{"dark":"#000"}}}';
		const diff = makeDiff('src/styles/tokens.json', 1, [jsonContent]);
		const findings = runDriftDetector({ diff, contractRegistry: registry2, asOf });
		const jpFinding = findings.find((f) => f.pattern_kind === 'jsonpath');
		expect(jpFinding).toBeDefined();
		expect(jpFinding?.message).toContain('exists');
	});

	it('returns deterministic ordering across repeated invocations', async () => {
		harness.seedContractFixture('api-security');
		harness.seedContractFixture('dependency-rules');
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		const diff1 = makeDiff('src/app/api/users/route.ts', 1, [
			'export async function GET(req) {',
			'  return NextResponse.json({});',
			'}',
		]);
		const diff2 = makeDiff('/contracts/dependency_rules.md', 1, [
			"import sim from 'string-similarity';",
			"import lev from 'levenshtein';",
		]);
		const fullDiff = diff1 + '\n' + diff2;

		const a = runDriftDetector({ diff: fullDiff, contractRegistry: registry, asOf });
		const b = runDriftDetector({ diff: fullDiff, contractRegistry: registry, asOf });
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		expect(a.length).toBeGreaterThanOrEqual(2);
	});

	it('pattern.scope filter excludes non-matching files (Pitfall 1 false-positive defense)', async () => {
		harness.seedContractFixture('api-security'); // scope: src/app/api/**/*.ts
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		// File OUTSIDE the scope glob — Python file under src/auth/.
		const diff = makeDiff('src/auth/login.py', 1, [
			'def login():',
			'  pass',
		]);
		const findings = runDriftDetector({ diff, contractRegistry: registry, asOf });
		expect(findings).toEqual([]);
	});

	it('returns empty findings for clean diff (all patterns satisfied)', async () => {
		harness.seedContractFixture('api-security');
		const asOf = new Date().toISOString();
		const registry = await loadContractRegistry(harness.dao, asOf);

		// Added lines DO contain requireAuth(  → pattern satisfied.
		const diff = makeDiff('src/app/api/users/route.ts', 1, [
			'export async function GET(req) {',
			'  await requireAuth(req);',
			'  return NextResponse.json({});',
			'}',
		]);
		const findings = runDriftDetector({ diff, contractRegistry: registry, asOf });
		expect(findings).toEqual([]);
	});
});
