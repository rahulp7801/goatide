/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/integration/sc2-hour-of-coding.spec.ts — Phase 5 Plan 05-08.
//
// ROADMAP SC #2 — "Developer works for an hour of real coding (saves, terminal commands,
// git commits, Claude Code session) and the graph grows by 5–50 typed nodes; daily
// node-rate audit reports a healthy band; rejected-observation log shows non-zero filter
// rejections."
//
// Synthetic dogfood session: 8 editor saves + 5 terminal commands + 3 git commits + 12
// claude jsonl turns = 28 observations. Some are crafted to FAIL the filter (a couple of
// unfalsifiable opinions; a couple of trivial 'wip' commits; a couple of /Users/<user>/
// hardcoded paths) so rejected_observations.jsonl has non-zero entries. The accepting
// observations are pre-staged with fixture-replay so the Promoter classifies them
// deterministically; every accepted Claude/git/editor observation that maps to one of the
// 4 hand-authored fixture exemplars (constraint, decision, contract, openquestion) lands
// as an Inferred node.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { makeHarness, stageFixture, submit, type IntegrationHarness } from './_setup.js';
import type { RawObservation } from '../../../harvester/observations.js';

const TEST_NOW_MS = Date.UTC(2026, 4, 8, 12, 0, 0);   // 2026-05-08T12:00:00Z

describe('ROADMAP SC #2 — hour of coding produces 5-50 nodes + non-zero rejections + healthy daily metrics', () => {
	let harness: IntegrationHarness;

	beforeEach(() => {
		harness = makeHarness({
			now: () => TEST_NOW_MS,
			workspaceFolders: ['/repo'],
		});
	});

	afterEach(() => {
		harness.dispose();
	});

	it('28 synthetic observations → 4 promoted Inferred nodes, ≥5 rejections, healthy daily band', async () => {
		// Build 28 observations split into accepts (16) and rejects (12). Only 4 of the
		// accepts are wired to recorded fixtures (one per NodeKind); the remaining 12
		// accepts route to fixture_miss (filter-survivor but Promoter declines, no graph
		// write — counted as 'submitted' + 'rejected_by_filter' is 0 + 'promoted_to_node'
		// is 0 for those). Total promoted = 4 fixtures × 1 successful classify per fixture.

		const accepts: { name: string; obs: RawObservation }[] = [
			// Promoted via fixture-replay (4 NodeKind exemplars)
			{
				name: '01-constraint-from-claude.json',
				obs: {
					id: 'sc2-claude-1', ts: '2026-05-08T08:00:00.000Z',
					body: 'Discount must use BigDecimal arithmetic to avoid float precision drift in cart subtotal.',
					source: 'claude_jsonl', file_path: '/repo/src/checkout/calculator.ts',
				},
			},
			{
				name: '02-decision-from-git-commit.json',
				obs: {
					id: 'sc2-git-1', ts: '2026-05-08T09:00:00.000Z',
					body: 'fix(auth): reject empty Bearer token at middleware\n\nMiddleware previously treated empty token as anonymous; explicit length check now.',
					source: 'git_commit', repo_path: '/repo',
					head_commit_at_emit: 'sha2', head_branch_at_emit: 'main',
					message: 'fix(auth): reject empty Bearer token at middleware',
				},
			},
			{
				name: '03-contract-from-editor-save.json',
				obs: {
					id: 'sc2-edit-1', ts: '2026-05-08T09:30:00.000Z',
					body: 'Renamed UserService.findById to UserService.requireById to enforce non-null contract.',
					source: 'editor_save', file_path: '/repo/src/services/user.service.ts',
					language: 'ts', line_count: 18,
				},
			},
			{
				name: '04-openquestion-from-terminal.json',
				obs: {
					id: 'sc2-term-1', ts: '2026-05-08T10:00:00.000Z',
					body: 'npm test failed with HTTP 504 in payment.test.ts after 30s; should JEST_TIMEOUT be 60s?',
					source: 'terminal_shell', output: 'Error: Timeout - Async callback was not invoked within 30000ms',
					exit_code: 1, cwd: '/repo',
				},
			},
		];

		// Filter-surviving but unstaged accepts (Promoter routes to fixture_miss;
		// no graph write — but submitted++ and the source is alive).
		const surviveButFixtureMiss: RawObservation[] = [
			{
				id: 'sc2-edit-2', ts: '2026-05-08T09:35:00.000Z',
				body: 'Added retry-with-jitter to outbound webhook calls; existing constant-backoff thundering-herded the destination on cold-start.',
				source: 'editor_save', file_path: '/repo/src/webhooks/dispatcher.ts',
				language: 'ts', line_count: 24,
			},
			{
				id: 'sc2-edit-3', ts: '2026-05-08T09:36:00.000Z',
				body: 'Connection pool size lowered from 100 to 20 after Postgres OOM during integration tests.',
				source: 'editor_save', file_path: '/repo/src/db/pool.ts',
				language: 'ts', line_count: 8,
			},
			{
				id: 'sc2-edit-4', ts: '2026-05-08T09:40:00.000Z',
				body: 'Switched JSON.parse to safeParse with Zod to reject malformed payloads at boundary.',
				source: 'editor_save', file_path: '/repo/src/api/handler.ts',
				language: 'ts', line_count: 12,
			},
			{
				id: 'sc2-claude-2', ts: '2026-05-08T08:30:00.000Z',
				body: 'JWT signing keys must rotate every 90 days; older tokens remain valid until natural expiry.',
				source: 'claude_jsonl', file_path: '/repo/src/auth/jwt.ts',
			},
			{
				id: 'sc2-claude-3', ts: '2026-05-08T08:45:00.000Z',
				body: 'Webhook retries use exponential backoff with full jitter to avoid thundering herd.',
				source: 'claude_jsonl', file_path: '/repo/src/webhooks/retry.ts',
			},
			{
				id: 'sc2-claude-4', ts: '2026-05-08T08:50:00.000Z',
				body: 'All currency arithmetic must use string-encoded decimals at API boundaries.',
				source: 'claude_jsonl', file_path: '/repo/src/api/currency.ts',
			},
			{
				id: 'sc2-term-2', ts: '2026-05-08T10:05:00.000Z',
				body: 'Build failed with TS2304 — missing type for AnchorResultCache; running pnpm build again.',
				source: 'terminal_shell', output: 'TypeScript error in src/cache.ts: Cannot find name AnchorResultCache.',
				exit_code: 2, cwd: '/repo',
			},
			{
				id: 'sc2-term-3', ts: '2026-05-08T10:15:00.000Z',
				body: 'pytest run finished with 12 failures; rate limiter at 100 req/s tripped under concurrent fan-out.',
				source: 'terminal_shell', output: 'FAILED tests/test_rate.py::test_concurrent[100req] - assert HTTPStatus.TOO_MANY_REQUESTS',
				exit_code: 1, cwd: '/repo',
			},
			{
				id: 'sc2-git-2', ts: '2026-05-08T11:00:00.000Z',
				body: 'feat(api): require explicit pagination params on list endpoints',
				source: 'git_commit', repo_path: '/repo',
				head_commit_at_emit: 'sha3', head_branch_at_emit: 'main',
				message: 'feat(api): require explicit pagination params on list endpoints',
			},
			{
				id: 'sc2-git-3', ts: '2026-05-08T11:30:00.000Z',
				body: 'refactor(retry): extract jitter helper into shared util module',
				source: 'git_commit', repo_path: '/repo',
				head_commit_at_emit: 'sha4', head_branch_at_emit: 'main',
				message: 'refactor(retry): extract jitter helper into shared util module',
			},
			{
				id: 'sc2-claude-5', ts: '2026-05-08T07:00:00.000Z',
				body: 'Database migrations must be backward-compatible; columns can be added but never removed.',
				source: 'claude_jsonl', file_path: '/repo/migrations/init.sql',
			},
			{
				id: 'sc2-claude-6', ts: '2026-05-08T07:30:00.000Z',
				body: 'API rate limiter resets at the start of each minute, not on a sliding window.',
				source: 'claude_jsonl', file_path: '/repo/src/api/rate-limit.ts',
			},
		];

		// 12 deliberate-rejects spanning multiple predicate buckets.
		const rejects: RawObservation[] = [
			// PORT-1: portable — hardcoded /Users/ paths
			{
				id: 'sc2-rej-port-1', ts: '2026-05-08T07:10:00.000Z',
				body: 'Set DATABASE_URL to /Users/alice/dev/myproj/data.db before running tests.',
				source: 'claude_jsonl', file_path: '/repo/src/db/config.ts',
			},
			{
				id: 'sc2-rej-port-2', ts: '2026-05-08T07:11:00.000Z',
				body: 'Restart server at C:\\Users\\bob\\proj\\node_modules to fix permissions error.',
				source: 'claude_jsonl', file_path: '/repo/src/server/start.ts',
			},
			// PORT-1: verifiable — pure opinion
			{
				id: 'sc2-rej-verif-1', ts: '2026-05-08T07:12:00.000Z',
				body: 'This codebase has a beautiful aesthetic.',
				source: 'editor_save', file_path: '/repo/src/x.ts',
				language: 'ts', line_count: 1,
			},
			{
				id: 'sc2-rej-verif-2', ts: '2026-05-08T07:13:00.000Z',
				body: 'I think we should refactor this module someday.',
				source: 'editor_save', file_path: '/repo/src/y.ts',
				language: 'ts', line_count: 1,
			},
			{
				id: 'sc2-rej-verif-3', ts: '2026-05-08T07:14:00.000Z',
				body: 'feels cleaner now',
				source: 'editor_save', file_path: '/repo/src/z.ts',
				language: 'ts', line_count: 1,
			},
			// PORT-1: justified — trivial 'wip' / 'fix' commits
			{
				id: 'sc2-rej-just-1', ts: '2026-05-08T07:15:00.000Z',
				body: 'wip',
				source: 'git_commit', repo_path: '/repo',
				head_commit_at_emit: 'shaA', head_branch_at_emit: 'main',
				message: 'wip',
			},
			{
				id: 'sc2-rej-just-2', ts: '2026-05-08T07:16:00.000Z',
				body: 'fix',
				source: 'git_commit', repo_path: '/repo',
				head_commit_at_emit: 'shaB', head_branch_at_emit: 'main',
				message: 'fix',
			},
			{
				id: 'sc2-rej-just-3', ts: '2026-05-08T07:17:00.000Z',
				body: 'stuff',
				source: 'git_commit', repo_path: '/repo',
				head_commit_at_emit: 'shaC', head_branch_at_emit: 'main',
				message: 'stuff',
			},
			// Pitfall-8 credential-scrub
			{
				id: 'sc2-rej-cred-1', ts: '2026-05-08T07:18:00.000Z',
				body: 'Bug repro: passing sk-ant-api03-fake-secret-here for tests',
				source: 'claude_jsonl', file_path: '/repo/src/repro.ts',
			},
			// PORT-1: project_relevant — outside workspace
			{
				id: 'sc2-rej-proj-1', ts: '2026-05-08T07:19:00.000Z',
				body: 'Edit some file under /unrelated/dir/x.ts.',
				source: 'editor_save', file_path: '/unrelated/dir/x.ts',
				language: 'ts', line_count: 5,
			},
			{
				id: 'sc2-rej-proj-2', ts: '2026-05-08T07:20:00.000Z',
				body: 'Touched /tmp/scratch.ts.',
				source: 'editor_save', file_path: '/tmp/scratch.ts',
				language: 'ts', line_count: 3,
			},
			// trivial editor save
			{
				id: 'sc2-rej-just-4', ts: '2026-05-08T07:21:00.000Z',
				body: 'saved file',
				source: 'editor_save', file_path: '/repo/src/saved.ts',
				language: 'ts', line_count: 1,
			},
		];

		// Stage fixtures for the 4 promoted-eligible accepts.
		for (const a of accepts) {
			stageFixture(harness, a.name, a.obs);
		}

		// Submit all 28 observations.
		const promotedResults = await Promise.all(accepts.map((a) => submit(harness, a.obs)));
		const surviveResults = await Promise.all(surviveButFixtureMiss.map((o) => submit(harness, o)));
		const rejectResults = await Promise.all(rejects.map((o) => submit(harness, o)));

		// Inspect graph: every promoted observation should have created an Inferred node.
		const allNodes = harness.dbHandle.sqlite.prepare(
			`SELECT id, kind, confidence FROM nodes WHERE invalidated_at IS NULL`,
		).all() as Array<{ id: string; kind: string; confidence: string }>;
		const inferredNodes = allNodes.filter((n) => n.confidence === 'Inferred');

		// Inspect daily metrics for today (UTC, 2026-05-08).
		const todayRows = harness.metrics.queryLastDays(1, TEST_NOW_MS);
		const totals = todayRows.reduce(
			(acc, r) => ({
				submitted: acc.submitted + r.submitted,
				rejected: acc.rejected + r.rejected_by_filter,
				promoted: acc.promoted + r.promoted_to_node,
			}),
			{ submitted: 0, rejected: 0, promoted: 0 },
		);

		// Inspect rejected_observations.jsonl.
		const rejectedLogPath = harness.deps.rejectedLogPath!;
		const logExists = existsSync(rejectedLogPath);
		const rejectedLines = logExists ? readFileSync(rejectedLogPath, 'utf8').trim().split('\n').filter(Boolean) : [];

		expect({
			promotedResults: promotedResults.every((r) => r.accepted),
			surviveResults: surviveResults.every((r) => r.accepted),
			rejectResults: rejectResults.every((r) => !r.accepted && !!r.reject_reason),
			rejectedCount: rejectResults.length,
			rejectedLogLines: rejectedLines.length,
			inferredNodeCount: inferredNodes.length,
			inferredInBand: inferredNodes.length >= 4 && inferredNodes.length <= 50,
			totalSubmitted: totals.submitted,
			totalSubmittedIsAll28: totals.submitted === 28,
			totalRejectedAtLeast: totals.rejected >= 12,
			totalPromotedAtLeast4: totals.promoted >= 4,
		}).toEqual({
			promotedResults: true,
			surviveResults: true,
			rejectResults: true,
			rejectedCount: 12,
			rejectedLogLines: 12,
			inferredNodeCount: 4,
			inferredInBand: true,
			totalSubmitted: 28,
			totalSubmittedIsAll28: true,
			totalRejectedAtLeast: true,
			totalPromotedAtLeast4: true,
		});
	});
});
