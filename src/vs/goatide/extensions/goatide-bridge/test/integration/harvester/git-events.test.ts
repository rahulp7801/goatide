/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/git-events.test.ts
//
// Phase 5 Plan 05-03 (TELE-04 bridge half) — Repository.onDidCommit triggers
// kernel.harvesterSubmitObservation with source='git_commit' and the thin shape
// (repo_path, head_commit_at_emit, head_branch_at_emit). registerGitEventWatcher must:
//   1. Subscribe to onDidCommit on every existing repo at activation time.
//   2. Subscribe to onDidOpenRepository so post-activation repos are wired too.
//   3. Tolerate a missing 'vscode.git' extension (return early without throwing).
//
// REQUIREMENTS-naming substitution per 05-RESEARCH.md ## User Constraints — REQUIREMENTS.md
// TELE-04 spells `git.postCommit` but the stable surface in extensions/git/src/api/git.d.ts
// is Repository.onDidCommit. Plan 05-08 will land the inline annotation.

import * as assert from 'node:assert/strict';
import { addMockGitRepository } from '../../setup/vscode-stub.js';
import { registerGitEventWatcher } from '../../../src/harvester/git-events.js';

interface DisposableLike { dispose(): void }

class EventEmitterStub<T> {
	private readonly listeners = new Set<(e: T) => void>();
	readonly event = (listener: (e: T) => void): DisposableLike => {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	};
	fire(e: T): void {
		for (const l of this.listeners) {
			l(e);
		}
	}
}

interface SubmitCall {
	source: string;
	repo_path: string;
	head_commit_at_emit: string | null;
	head_branch_at_emit: string | null;
}

interface TestKernelLike {
	harvesterSubmitObservation: (input: SubmitCall) => Promise<{ id: string; accepted: boolean }>;
}

interface CtxLike {
	subscriptions: DisposableLike[];
}

describe('TELE-04: bridge git-commit trigger', () => {
	it('Repository.onDidCommit + onDidOpenRepository both forward observations to kernel.harvesterSubmitObservation', async () => {
		const calls: SubmitCall[] = [];
		const kernel: TestKernelLike = {
			harvesterSubmitObservation: async (input: SubmitCall) => {
				calls.push(input);
				return { id: 'k', accepted: true };
			},
		};
		const ctx: CtxLike = { subscriptions: [] };

		// Pre-activation repo (existing at activate time).
		const preCommitEmitter = new EventEmitterStub<void>();
		const preRepo = {
			rootUri: { fsPath: '/tmp/repo-pre' },
			state: { HEAD: { commit: 'cafebabe', name: 'master' } },
			onDidCommit: preCommitEmitter.event,
		};
		addMockGitRepository(preRepo);

		registerGitEventWatcher(ctx, kernel);

		// Fire pre-existing repo's commit event.
		preCommitEmitter.fire();
		await new Promise((r) => setTimeout(r, 10));

		// Late-opened repo wired via onDidOpenRepository.
		const lateCommitEmitter = new EventEmitterStub<void>();
		const lateRepo = {
			rootUri: { fsPath: '/tmp/repo-late' },
			state: { HEAD: { commit: 'deadbeef', name: 'feature' } },
			onDidCommit: lateCommitEmitter.event,
		};
		addMockGitRepository(lateRepo);
		await new Promise((r) => setTimeout(r, 10));
		lateCommitEmitter.fire();
		await new Promise((r) => setTimeout(r, 10));

		assert.deepStrictEqual(
			calls.map((c) => ({
				source: c.source,
				repo_path: c.repo_path,
				head_commit_at_emit: c.head_commit_at_emit,
				head_branch_at_emit: c.head_branch_at_emit,
			})),
			[
				{ source: 'git_commit', repo_path: '/tmp/repo-pre', head_commit_at_emit: 'cafebabe', head_branch_at_emit: 'master' },
				{ source: 'git_commit', repo_path: '/tmp/repo-late', head_commit_at_emit: 'deadbeef', head_branch_at_emit: 'feature' },
			],
		);

		// Disposing context cleans up subscriptions.
		for (const d of ctx.subscriptions) {
			d.dispose();
		}
	});
});
