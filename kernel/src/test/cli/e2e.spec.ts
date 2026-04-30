/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/cli/e2e.spec.ts — Phase 2 (Plan 02-04) Task 3 RED+GREEN.
//
// End-to-end coverage for `goatide-cli graph` against a real built dist artifact
// (NOT tsx — we exercise the production shape). Five sub-cases cover the three
// ROADMAP success criteria the CLI must satisfy (#1 seed, #2 supersede + as-of,
// #4 ghosting refusal) plus a query-default scan and an unknown-kind error path.
//
// Pre-condition: `npm run build` must have produced dist/cli/index.js and
// dist/graph/migrations/*.sql before this suite runs. The beforeAll guard
// asserts that explicitly so a stale dist can't silently pass.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';

// kernel/package.json declares "type":"module" (Plan 02-01) and tsc emits ESM,
// so __dirname / require() are unavailable. import.meta.url is canonical.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../../..', 'dist', 'cli', 'index.js');

interface CliResult { stdout: string; stderr: string; exitCode: number }

function runCli(args: string[]): CliResult {
	const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
	return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: r.status ?? -1 };
}

describe('goatide-cli graph (e2e — GRAPH-10)', () => {
	let tmp: TempDb;
	beforeAll(() => {
		// Sanity: dist must be built before this suite runs (`npm run build` is part of
		// the verify command chain documented in the plan).
		expect(existsSync(cliPath)).toBe(true);
	});
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('seed: success path returns {id} JSON with a 26-char ULID (Success Criterion #1)', () => {
		const r = runCli(['graph', 'seed', '--db', tmp.dbPath, '--kind', 'constraint', '--body', 'FK columns must coerce empty-string to NULL']);
		expect(r.exitCode).toBe(0);
		expect(r.stderr).toBe('');
		const parsed = JSON.parse(r.stdout) as { id: string };
		expect(parsed.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);  // Crockford base32

		// Round-trip retrieval via the same CLI.
		const q = runCli(['graph', 'query', '--db', tmp.dbPath, '--id', parsed.id, '--json']);
		expect(q.exitCode).toBe(0);
		const rows = JSON.parse(q.stdout) as Array<{
			id: string;
			confidence: string;
			valid_from: string;
			recorded_at: string;
			invalidated_at: string | null;
		}>;
		expect({
			len: rows.length,
			id: rows[0]?.id,
			confidence: rows[0]?.confidence,
			hasValidFrom: !!rows[0]?.valid_from,
			hasRecordedAt: !!rows[0]?.recorded_at,
			invalidated: rows[0]?.invalidated_at,
		}).toEqual({
			len: 1,
			id: parsed.id,
			confidence: 'Explicit',
			hasValidFrom: true,
			hasRecordedAt: true,
			invalidated: null,
		});
	});

	it('supersede + query --at <past-time>: returns OLD then NEW (Success Criterion #2)', async () => {
		const seed = runCli(['graph', 'seed', '--db', tmp.dbPath, '--kind', 'constraint', '--body', 'original body']);
		expect(seed.exitCode).toBe(0);
		const oldId = (JSON.parse(seed.stdout) as { id: string }).id;

		// Capture pre-supersede recorded_at + delay so timestamps differ measurably.
		const tBefore = (JSON.parse(
			runCli(['graph', 'query', '--db', tmp.dbPath, '--id', oldId, '--json']).stdout,
		) as Array<{ recorded_at: string }>)[0].recorded_at;
		await new Promise((r) => setTimeout(r, 10));

		const sup = runCli(['graph', 'supersede', '--db', tmp.dbPath, oldId, '--body', 'revised body']);
		expect(sup.exitCode).toBe(0);
		const newId = (JSON.parse(sup.stdout) as { newId: string }).newId;

		const atPast = runCli(['graph', 'query', '--db', tmp.dbPath, '--at', tBefore, '--json']);
		const atNow = runCli(['graph', 'query', '--db', tmp.dbPath, '--json']);

		const pastRows = JSON.parse(atPast.stdout) as Array<{ id: string }>;
		const nowRows = JSON.parse(atNow.stdout) as Array<{ id: string }>;
		expect({
			pastIds: pastRows.map((r) => r.id),
			nowIds: nowRows.map((r) => r.id),
		}).toEqual({
			pastIds: [oldId],
			nowIds: [newId],
		});
	});

	it('seed with ghosting body: exits non-zero with friendly error (Success Criterion #4)', () => {
		const r = runCli(['graph', 'seed', '--db', tmp.dbPath, '--kind', 'constraint', '--body', 'thanks for the help']);
		expect(r.exitCode).toBe(1);
		expect(r.stderr).toMatch(/Ghosting|thanks/i);
		expect(r.stdout).toBe('');
	});

	it('seed with unknown kind: exits non-zero with kind-allowlist error', () => {
		const r = runCli(['graph', 'seed', '--db', tmp.dbPath, '--kind', 'notarealkind', '--body', 'whatever']);
		expect(r.exitCode).toBe(1);
		expect(r.stderr).toMatch(/unknown kind/i);
	});

	it('query default (no flags) returns active set across all kinds; --json emits parseable JSON', () => {
		runCli(['graph', 'seed', '--db', tmp.dbPath, '--kind', 'constraint', '--body', 'one']);
		runCli(['graph', 'seed', '--db', tmp.dbPath, '--kind', 'decision', '--body', 'two']);
		runCli(['graph', 'seed', '--db', tmp.dbPath, '--kind', 'contract', '--body', 'three']);

		const tableForm = runCli(['graph', 'query', '--db', tmp.dbPath]);
		const jsonForm = runCli(['graph', 'query', '--db', tmp.dbPath, '--json']);

		expect(tableForm.exitCode).toBe(0);
		expect(jsonForm.exitCode).toBe(0);
		const parsed = JSON.parse(jsonForm.stdout) as Array<{ kind: string }>;
		expect({
			kinds: parsed.map((r) => r.kind).sort(),
			tableHasRows: tableForm.stdout.split('\n').length >= 5,
		}).toEqual({
			kinds: ['ConstraintNode', 'ContractNode', 'DecisionNode'],
			tableHasRows: true,
		});
	});
});
