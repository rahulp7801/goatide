/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/watchers/git.ts — Phase 5 Plan 05-03 (TELE-04 kernel half).
//
// enrichGitCommitObservation runs simple-git inside the submitRawObservation pre-filter
// pipeline. The bridge half (registerGitEventWatcher) sends a thin observation containing
// just {repo_path, head_commit_at_emit, head_branch_at_emit}; this enrichment fills in
// {diff, message, author, files_changed} before Plan 05-05's filter sees it.
//
// Initial-commit case (no HEAD~1): simple-git's git.log({from:'HEAD~1', to:'HEAD'}) throws
// because HEAD~1 doesn't exist. We catch + return empty diff / fallback message-from-HEAD.

import { simpleGit } from 'simple-git';
import type { GitEnrichmentInput, GitEnrichmentResult } from '../index.js';

/**
 * Enrich a git_commit observation with diff + commit metadata.
 *
 * Returns an empty enrichment result on failures (missing repo, bad path, initial-commit
 * case where HEAD~1 doesn't exist) so the observation still flows through the harvester
 * pipeline. Plan 05-05's net_new predicate handles deduplication.
 */
export async function enrichGitCommitObservation(input: GitEnrichmentInput): Promise<GitEnrichmentResult> {
	const git = simpleGit(input.repo_path);

	// Try the diff path first: git diff HEAD~1 HEAD. Falls back to empty diff for the
	// initial-commit case (no HEAD~1).
	let diff = '';
	let filesChanged: number | undefined = undefined;
	try {
		const summary = await git.diffSummary(['HEAD~1', 'HEAD']);
		filesChanged = summary.files.length;
		diff = await git.diff(['HEAD~1', 'HEAD']);
	} catch {
		// Initial commit or HEAD~1 doesn't exist; empty diff. files_changed remains undefined.
		// Fall through to log-based message/author lookup.
	}

	// Pull commit metadata from git log -1 (HEAD only). simple-git's {from, to} semantics
	// are exclusive of `from`, so for a one-commit repo the {from:HEAD, to:HEAD} form
	// returns null. Using maxCount:1 returns the HEAD commit unconditionally — works for
	// both regular and initial commits.
	let message: string | undefined = undefined;
	let author: string | undefined = undefined;
	try {
		const log = await git.log({ maxCount: 1 });
		const latest = log.latest;
		if (latest) {
			message = latest.message;
			author = latest.author_name || latest.author_email || undefined;
		}
	} catch {
		// Empty repo (no HEAD at all) — leave undefined.
	}

	const result: GitEnrichmentResult = {};
	if (diff) {
		result.diff = diff;
	}
	if (message !== undefined) {
		result.message = message;
	}
	if (author !== undefined) {
		result.author = author;
	}
	if (filesChanged !== undefined) {
		result.files_changed = filesChanged;
	}
	return result;
}
