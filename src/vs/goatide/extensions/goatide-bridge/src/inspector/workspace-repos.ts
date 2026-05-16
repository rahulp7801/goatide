/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 17 Plan 17-01 DEEP-06 phase-B -- workspace folder enumeration + fingerprint resolution.
//
// Enumerates vscode.workspace.workspaceFolders, queries each folder's git remote URL via
// the vscode.git extension API (precedent: harvester/git-events.ts:46-60), and returns a
// typed WorkspaceRepo[] for the cross-repo command.
//
// Mandate B fence (refuse-deep05-write.sh scope covers inspector/): this file imports
// ZERO write-RPC symbols. See scripts/ci/refuse-deep05-write.sh BANNED array for the
// canonical token list.

import * as vscode from 'vscode';
import { createHash } from 'node:crypto';

/**
 * Compute the canonical repo_id from a git remote URL. 12-char SHA-256 hex over the
 * normalized URL (lowercase + strip trailing .git + strip trailing slash). Byte-equal
 * with kernel/src/graph/repo-fingerprint.ts (Phase 16 -- Wave-0 parity test pins this).
 */
export function fingerprint(remoteUrl: string): string {
	const normalized = remoteUrl.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
	return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

export interface WorkspaceRepo {
	readonly folder: vscode.WorkspaceFolder;
	readonly repoId: string;           // 12-char SHA-256 fingerprint or 'primary' if no remote
	readonly remoteUrl: string | null; // null when the folder is not a git repo OR has no origin
}

interface GitExtensionExports {
	getAPI(version: number): {
		repositories: ReadonlyArray<{
			rootUri: { fsPath: string };
			state: { remotes?: ReadonlyArray<{ name: string; fetchUrl?: string }> };
		}>;
	};
}

/**
 * Enumerate every workspace folder, derive its repo_id from the git remote, and return
 * a typed WorkspaceRepo[] for the cross-repo command. Returns [] when workspaceFolders is
 * undefined or empty. Returns 'primary' as repoId fallback when no git extension or no
 * origin remote.
 */
export async function enumerateWorkspaceRepos(): Promise<WorkspaceRepo[]> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return [];
	}
	const gitExt = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
	if (!gitExt) {
		return folders.map(folder => ({ folder, repoId: 'primary', remoteUrl: null }));
	}
	const gitApi = (await gitExt.activate()).getAPI(1);
	return folders.map(folder => {
		const repo = gitApi.repositories.find(r => r.rootUri.fsPath === folder.uri.fsPath);
		const remoteUrl = repo?.state?.remotes?.find(r => r.name === 'origin')?.fetchUrl ?? null;
		const repoId = remoteUrl ? fingerprint(remoteUrl) : 'primary';
		return { folder, repoId, remoteUrl };
	});
}
