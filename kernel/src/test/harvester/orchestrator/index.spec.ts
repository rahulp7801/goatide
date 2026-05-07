/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/orchestrator/index.spec.ts — Phase 5 Plan 05-03.
//
// submitRawObservation dispatch over the discriminated-union: git_commit triggers
// enrichment; other sources pass through; provisional filter always-accept; provisional
// promoter no-ops; provisional liveness records the source name.

import { describe, it, expect, vi } from 'vitest';
import { submitRawObservation, type HarvesterDeps, type GitEnrichmentInput, type GitEnrichmentResult } from '../../../harvester/index.js';
import type { RawObservation, ObservationSource } from '../../../harvester/observations.js';

describe('Plan 05-03: submitRawObservation orchestrator', () => {
	it('dispatches per-source: git_commit triggers enrichment; other sources pass through; provisional accept', async () => {
		const enrichGit = vi.fn(
			async (_input: GitEnrichmentInput): Promise<GitEnrichmentResult> => ({
				diff: 'diff --git a/x b/x\n+foo', message: 'fix', author: 'me', files_changed: 1,
			}),
		);
		const promoter = vi.fn(async (_obs: RawObservation): Promise<void> => undefined);
		const liveness = { record: vi.fn((_source: ObservationSource): void => undefined) };
		const deps: HarvesterDeps = { enrichGit, promoter, liveness };

		const claudeIn: RawObservation = {
			id: 'A', source: 'claude_jsonl', body: '{}', ts: 't',
			file_path: '/tmp/a.jsonl', parsed: {},
		};
		const gitIn: RawObservation = {
			id: 'B', source: 'git_commit', body: 'msg', ts: 't',
			repo_path: '/tmp/repo', head_commit_at_emit: 'cafe', head_branch_at_emit: 'master',
		};

		const claudeOut = await submitRawObservation(claudeIn, deps);
		const gitOut = await submitRawObservation(gitIn, deps);

		expect({
			claudeOut,
			gitOut,
			enrichGitCalls: enrichGit.mock.calls.length,
			enrichGitFirstArg: enrichGit.mock.calls[0]?.[0],
			promoterCalls: promoter.mock.calls.length,
			promoterEnrichedDiff: (promoter.mock.calls[1]?.[0] as { diff?: string } | undefined)?.diff,
			livenessSources: liveness.record.mock.calls.map((c) => c[0]),
		}).toEqual({
			claudeOut: { id: 'A', accepted: true },
			gitOut: { id: 'B', accepted: true },
			enrichGitCalls: 1,
			enrichGitFirstArg: { repo_path: '/tmp/repo', head_commit_at_emit: 'cafe' },
			promoterCalls: 2,
			promoterEnrichedDiff: 'diff --git a/x b/x\n+foo',
			livenessSources: ['claude_jsonl', 'git_commit'],
		});
	});
});
