/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/pipeline.spec.ts — Phase 5 Plan 05-05 PORT-01 (AND-chain
// short-circuit) + PORT-02 (silent rejection — no UI surface) + golden-corpus replay.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { runFilter, type FilterContext } from '../../../harvester/filter/index.js';
import { computeAnchorTuple } from '../../../harvester/filter/anchor-tuple.js';
import type { RawObservation } from '../../../harvester/observations.js';
import type { GraphDAO, NodeRow } from '../../../graph/dao.js';

const here = dirname(fileURLToPath(import.meta.url));

interface CorpusEntry {
	id: string;
	source: 'claude_jsonl' | 'editor_save' | 'terminal_shell' | 'git_commit';
	body: string;
	file_path: string | null;
	expected: { kind: 'accept' | 'reject'; predicate?: string; reason?: string };
}

function loadCorpus(): readonly CorpusEntry[] {
	const text = readFileSync(resolve(here, 'golden-corpus.json'), 'utf8');
	return JSON.parse(text) as readonly CorpusEntry[];
}

/**
 * Translate a fixture entry into a properly-typed RawObservation. The fixture format has
 * `file_path` for every source for human-authoring convenience; the runtime schema places
 * file_path only on claude_jsonl and editor_save (terminal_shell exposes cwd; git_commit
 * exposes repo_path). For pipeline replay we map the shapes faithfully.
 */
function toObservation(entry: CorpusEntry): RawObservation {
	const base = { id: entry.id, ts: '2026-05-07T00:00:00.000Z', body: entry.body };
	switch (entry.source) {
		case 'claude_jsonl':
			return { ...base, source: 'claude_jsonl', file_path: entry.file_path ?? '' };
		case 'editor_save':
			return {
				...base, source: 'editor_save', file_path: entry.file_path ?? '',
				language: 'ts', line_count: entry.body.length > 0 ? 1 : 0,
			};
		case 'terminal_shell':
			return {
				...base, source: 'terminal_shell', output: '', exit_code: 0,
				cwd: entry.file_path ?? null,
			};
		case 'git_commit':
			return {
				...base, source: 'git_commit', repo_path: entry.file_path ?? '/repo',
				head_commit_at_emit: 'cafe', head_branch_at_emit: 'main',
				message: entry.body, diff: entry.body.length > 0 ? 'diff' : '',
			};
	}
}

/**
 * Build a stub GraphDAO that returns a synthetic match for every observation flagged as a
 * net_new rejection in the golden corpus. The matcher uses anchor file_path equality (the
 * same key the production net_new predicate uses), then the predicate verifies body-hash
 * equality in JS.
 */
function buildCorpusDao(corpus: readonly CorpusEntry[]): GraphDAO {
	const acceptIndex = new Map<string, CorpusEntry>();
	for (const e of corpus) {
		if (e.expected.kind === 'accept' && e.file_path) {
			acceptIndex.set(e.file_path, e);
		}
	}
	return {
		queryByAnchor: ({ jsonPath, value }: { jsonPath: string; value: string }): NodeRow[] => {
			if (jsonPath !== '$.anchor.file') {
				return [];
			}
			const matching = acceptIndex.get(value);
			if (!matching) {
				return [];
			}
			return [{
				id: `existing-${matching.id}`,
				kind: 'Constraint',
				payload: { kind: 'Constraint', body: matching.body, anchor: { file: value } },
				confidence: 'Inferred',
				valid_from: 't', invalidated_at: null, recorded_at: 't', superseded_by: null,
			} as unknown as NodeRow];
		},
	} as unknown as GraphDAO;
}

describe('PORT-01 / PORT-02: filter pipeline AND-chain + silent rejection + golden replay', () => {
	it('AND-chains predicates, short-circuits on first false, never calls dao.seed/promoter on reject', async () => {
		// Construct an observation that fails portable (machine path) — should never reach
		// later predicates, never call dao.seed, never call promoter.
		const obs: RawObservation = {
			id: 'a', ts: 't', body: 'set DATABASE_URL to /Users/alice/dev/data.db',
			source: 'claude_jsonl', file_path: '/home/dev/proj/src/x.ts',
		};
		const queryByAnchor = vi.fn().mockReturnValue([]);
		const ctx: FilterContext = {
			dao: { queryByAnchor } as unknown as GraphDAO,
			workspaceFolders: ['/home/dev/proj'],
			now: () => 0,
		};

		const decision = await runFilter(obs, ctx);

		expect({
			kind: decision.kind,
			predicate: decision.kind === 'reject' ? decision.predicate : undefined,
			daoCalls: queryByAnchor.mock.calls.length,
		}).toEqual({
			kind: 'reject',
			predicate: 'portable',
			daoCalls: 0,
		});
	});

	it('replays golden-corpus.json and asserts every entry matches its expected decision', async () => {
		const corpus = loadCorpus();
		const dao = buildCorpusDao(corpus);
		const workspaceFolders = ['src/', '/home/dev/proj'];
		const ctx: FilterContext = { dao, workspaceFolders, now: () => 0 };

		const results = [];
		for (const entry of corpus) {
			const obs = toObservation(entry);
			// Tweak: project_relevant predicate uses workspaceFolders prefix-match. The
			// fixture corpus uses paths like 'src/checkout/calculator.ts' for in-workspace
			// observations and absolute paths like '/home/dev/other-repo/...' for out-of.
			// Add 'src/' prefix to workspaceFolders so relative-path fixtures pass.
			//
			// For net-new replay: the corpus has duplicate-body fixtures. The first
			// occurrence (accept) is indexed; the second (reject) sees the synthetic match.
			// To make this work in a single pass we pre-load the index above; we do NOT
			// run the accept-first observations through runFilter because that would
			// require seeding back into the dao mid-replay. Instead we verify the
			// expected decision directly: when the corpus says expected.kind === 'reject'
			// with predicate === 'net_new', we know the dao is pre-loaded for that key.
			const decision = await runFilter(obs, ctx);
			results.push({
				id: entry.id,
				expectedKind: entry.expected.kind,
				actualKind: decision.kind,
				expectedPredicate: entry.expected.predicate,
				actualPredicate: decision.kind === 'reject' ? decision.predicate : undefined,
			});
		}

		// Assert every entry matches in one snapshot. Failures here pinpoint exactly which
		// fixture diverges, including its predicate.
		const mismatches = results.filter(
			(r) => r.actualKind !== r.expectedKind
				|| (r.expectedKind === 'reject' && r.actualPredicate !== r.expectedPredicate),
		);
		expect(mismatches).toEqual([]);
	});

	it('exposes computeAnchorTuple as the exact-equality key for net-new dedup', () => {
		const obs: RawObservation = {
			id: 'a', ts: 't', body: 'hello world', source: 'claude_jsonl', file_path: 'src/x.ts',
		};
		const tuple = computeAnchorTuple(obs);
		expect({
			file_path: tuple.file_path,
			symbol: tuple.symbol,
			body_hash_len: tuple.body_hash.length,
			body_hash_hex: /^[0-9a-f]{64}$/.test(tuple.body_hash),
		}).toEqual({
			file_path: 'src/x.ts',
			symbol: undefined,
			body_hash_len: 64,
			body_hash_hex: true,
		});
	});
});
