/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/git.spec.ts — Phase 5 Plan 05-03 (TELE-04 kernel half).
//
// Real on-disk simple-git against a temp git repo. Two cases:
//   1. Two-commit repo — enrich returns non-empty diff + message + author + files_changed.
//   2. Single-commit repo (initial commit; no HEAD~1) — enrich returns without throwing,
//      diff is empty, message comes from HEAD log.
//
// We bootstrap the temp repo via simple-git itself rather than spawning git CLI, so the
// test is self-contained.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { enrichGitCommitObservation } from '../../harvester/watchers/git.js';

interface Repo {
	dir: string;
	dispose(): void;
}

async function makeRepo(): Promise<Repo> {
	const dir = mkdtempSync(join(tmpdir(), 'goatide-gitw-'));
	const g = simpleGit(dir);
	await g.init();
	await g.addConfig('user.email', 'test@goatide.local', false, 'local');
	await g.addConfig('user.name', 'Goat Tester', false, 'local');
	return {
		dir,
		dispose: () => {
			try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
		},
	};
}

describe('TELE-04: simple-git diff capture on commit signal', () => {
	let repo: Repo;

	beforeEach(async () => {
		repo = await makeRepo();
	});
	afterEach(() => {
		repo.dispose();
	});

	it('runs git diff HEAD~1 HEAD on a two-commit repo and surfaces empty/initial-commit diff on a one-commit repo', async () => {
		// === Two-commit repo: returns full enrichment ===
		const g = simpleGit(repo.dir);
		writeFileSync(join(repo.dir, 'README.md'), 'first\n');
		await g.add('README.md');
		await g.commit('first commit');

		// Single-commit: enrich must NOT throw; diff empty; message + author from HEAD.
		const initialEnriched = await enrichGitCommitObservation({
			repo_path: repo.dir,
			head_commit_at_emit: null,
		});

		writeFileSync(join(repo.dir, 'README.md'), 'first\nsecond\n');
		await g.add('README.md');
		await g.commit('second commit');

		const enriched = await enrichGitCommitObservation({
			repo_path: repo.dir,
			head_commit_at_emit: null,
		});

		expect({
			initial: {
				diff_empty: !initialEnriched.diff,
				files_changed_undefined: initialEnriched.files_changed === undefined,
				message: initialEnriched.message,
				author: initialEnriched.author,
			},
			twoCommit: {
				diff_has_second: typeof enriched.diff === 'string' && enriched.diff.includes('second'),
				files_changed: enriched.files_changed,
				message: enriched.message,
				author: enriched.author,
			},
		}).toEqual({
			initial: {
				diff_empty: true,
				files_changed_undefined: true,
				message: 'first commit',
				author: 'Goat Tester',
			},
			twoCommit: {
				diff_has_second: true,
				files_changed: 1,
				message: 'second commit',
				author: 'Goat Tester',
			},
		});
	}, 20_000);
});
