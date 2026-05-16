/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/cli/helpers.spec.ts — Phase 2 (Plan 02-04) Task 1 RED.
// Unit tests for db-path resolver + format helpers. Spec is unit-level (no spawn);
// the e2e suite in Task 3 covers child-process behavior.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ZodError } from 'zod';

import { resolveDbPath } from '../../cli/db-path.js';
import { formatNodeTable, formatNodeJson, formatError } from '../../cli/format.js';
import { NodePayloadSchema } from '../../graph/index.js';
import type { NodeRow } from '../../graph/index.js';

describe('cli/db-path.resolveDbPath', () => {
	let tmpRoot: string;
	beforeEach(() => { tmpRoot = mkdtempSync(path.join(tmpdir(), 'goatide-cli-dbpath-')); });
	afterEach(() => { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

	it('returns absolute path and creates parent dir when override provided', () => {
		const target = path.join(tmpRoot, 'nested', 'sub', 'graph.db');
		const result = resolveDbPath(target);
		expect({
			isAbsolute: path.isAbsolute(result),
			equalsOverride: result === target,
			parentExists: existsSync(path.dirname(result)),
		}).toEqual({ isAbsolute: true, equalsOverride: true, parentExists: true });
	});

	it('returns platform-default path and creates parent dir when no override', () => {
		const result = resolveDbPath();
		expect({
			isAbsolute: path.isAbsolute(result),
			endsWithGraphDb: result.endsWith('graph.db'),
			containsGoatide: result.includes('goatide'),
			parentExists: existsSync(path.dirname(result)),
		}).toEqual({ isAbsolute: true, endsWithGraphDb: true, containsGoatide: true, parentExists: true });
	});
});

describe('cli/format', () => {
	const sampleRow: NodeRow = {
		id: '01HXXXXXXXXXXXXXXXXXXXXXX0',
		kind: 'ConstraintNode',
		payload: { kind: 'ConstraintNode', body: 'FK columns must coerce empty-string to NULL' },
		confidence: 'Explicit',
		valid_from: '2026-04-30T01:00:00.000Z',
		invalidated_at: null,
		recorded_at: '2026-04-30T01:00:00.000Z',
		superseded_by: null,
		repo_id: 'primary',
	};

	it('formatNodeTable returns "No results.\\n" on empty array', () => {
		expect(formatNodeTable([])).toBe('No results.\n');
	});

	it('formatNodeTable contains all required column headers and the row id/kind/confidence', () => {
		const out = formatNodeTable([sampleRow]);
		expect({
			hasIdHeader: out.includes('id'),
			hasKindHeader: out.includes('kind'),
			hasConfidenceHeader: out.includes('confidence'),
			hasValidFromHeader: out.includes('valid_from'),
			hasRecordedAtHeader: out.includes('recorded_at'),
			hasRowId: out.includes(sampleRow.id),
			hasRowKind: out.includes('ConstraintNode'),
			hasRowConfidence: out.includes('Explicit'),
			hasBody: out.includes('FK columns must coerce empty-string to NULL'),
		}).toEqual({
			hasIdHeader: true, hasKindHeader: true, hasConfidenceHeader: true,
			hasValidFromHeader: true, hasRecordedAtHeader: true,
			hasRowId: true, hasRowKind: true, hasRowConfidence: true, hasBody: true,
		});
	});

	it('formatNodeJson returns a JSON.parse-able array', () => {
		const out = formatNodeJson([sampleRow]);
		const parsed = JSON.parse(out) as NodeRow[];
		expect({
			isArray: Array.isArray(parsed),
			len: parsed.length,
			id: parsed[0]?.id,
			kind: parsed[0]?.kind,
		}).toEqual({ isArray: true, len: 1, id: sampleRow.id, kind: 'ConstraintNode' });
	});

	it('formatError handles ZodError, generic Error, and unknown', () => {
		// Trigger a real ZodError for the Ghosting refinement.
		let zodErr: unknown = null;
		try {
			NodePayloadSchema.parse({ kind: 'ConstraintNode', body: 'thanks for the help' });
		} catch (e) { zodErr = e; }

		expect(zodErr).toBeInstanceOf(ZodError);
		const zodOut = formatError(zodErr, 'seed failed');
		const errOut = formatError(new Error('boom'), 'op failed');
		const strOut = formatError('string-thing', 'op failed');
		expect({
			zodPrefix: zodOut.startsWith('seed failed:'),
			zodMentionsGhosting: /Ghosting|ghosting|thanks/i.test(zodOut),
			errorMessage: errOut,
			stringFallback: strOut,
		}).toEqual({
			zodPrefix: true,
			zodMentionsGhosting: true,
			errorMessage: 'op failed: boom',
			stringFallback: 'op failed: string-thing',
		});
	});
});
