/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/harvester/git-events.ts
//   — Phase 5 Plan 05-03 (TELE-04 bridge half).
//
// Subscribes to the built-in vscode.git extension's Repository.onDidCommit event and
// forwards a thin git_commit observation to the kernel. The kernel-side
// enrichGitCommitObservation enriches with simple-git diff + log before the filter
// pipeline (Plan 05-05) sees it.
//
// Key behaviors:
//   1. Tolerate a missing 'vscode.git' extension (Code OSS profiles may ship without it).
//   2. Wire every existing repository at activation time.
//   3. Wire repositories opened post-activation via api.onDidOpenRepository.
//   4. Push every disposable to ctx.subscriptions so dispose-on-deactivate is automatic.
//
// REQUIREMENTS-naming substitution per 05-RESEARCH.md ## User Constraints — REQUIREMENTS.md
// TELE-04 spells `git.postCommit`; the actual stable surface in
// extensions/git/src/api/git.d.ts is Repository.onDidCommit. Plan 05-08 lands the inline
// REQUIREMENTS.md annotation.

import * as vscode from 'vscode';
import { ulid } from 'ulid';

interface SubmitObservationArg {
	id: string;
	source: 'git_commit';
	body: string;
	ts: string;
	repo_path: string;
	head_commit_at_emit: string | null;
	head_branch_at_emit: string | null;
}

interface KernelClientLike {
	harvesterSubmitObservation: (obs: SubmitObservationArg) => Promise<unknown>;
}

interface ExtensionContextLike {
	subscriptions: { dispose(): void }[];
}

interface GitRepositoryShape {
	rootUri: { fsPath: string };
	state: { HEAD: { commit?: string; name?: string } | undefined };
	onDidCommit: vscode.Event<unknown>;
}

interface GitAPIShape {
	repositories: ReadonlyArray<GitRepositoryShape>;
	onDidOpenRepository: vscode.Event<GitRepositoryShape>;
}

interface GitExtensionExports {
	getAPI(version: number): GitAPIShape;
}

/**
 * Register the git-commit bridge watcher. No-op (returns early) if the built-in
 * 'vscode.git' extension is not available — some Code OSS profiles ship without it.
 */
export function registerGitEventWatcher(
	ctx: ExtensionContextLike,
	kernel: KernelClientLike,
): void {
	const gitExt = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
	if (!gitExt) {
		console.error('[goatide-bridge] vscode.git extension not available; TELE-04 disabled');
		return;
	}

	const api = gitExt.exports.getAPI(1);

	const wireRepo = (repo: GitRepositoryShape): void => {
		const sub = repo.onDidCommit(() => {
			const head = repo.state.HEAD;
			const obs: SubmitObservationArg = {
				id: ulid(),
				source: 'git_commit',
				body: '',
				ts: new Date().toISOString(),
				repo_path: repo.rootUri.fsPath,
				head_commit_at_emit: head?.commit ?? null,
				head_branch_at_emit: head?.name ?? null,
			};
			// Fire-and-forget. The kernel-side enrichGitCommitObservation does the heavy
			// simple-git work; the bridge stays responsive even if the kernel is slow.
			void kernel.harvesterSubmitObservation(obs).catch((err) => {
				console.error('[goatide-bridge] git-events submitObservation failed', err);
			});
		});
		ctx.subscriptions.push(sub);
	};

	for (const repo of api.repositories) {
		wireRepo(repo);
	}

	const lateSub = api.onDidOpenRepository((repo) => {
		wireRepo(repo);
	});
	ctx.subscriptions.push(lateSub);
}
