/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 21 XREPO-02 -- WorkspaceRepoState bridge module (real implementation).
//
// Single source-of-truth for "what is the active document's repo_id?" on every save.
// Consulted by on-will-save.ts (proposeEdit) and tier-dispatch.ts (recordRejection +
// atomicAccept) to thread repo_id through the 3 write-RPC call sites (XREPO-02c/d/e).
//
// Caching strategy:
//   Map<string, WorkspaceRepo> keyed by WorkspaceFolder.uri.toString(). The cache is
//   populated lazily on first getActiveRepoId() call for a given folder and is
//   invalidated ONLY on vscode.workspace.onDidChangeWorkspaceFolders (folder-stable
//   invariant: git origin URL changes within the same folder are not handled in v2.1 --
//   deferred to v2.2 per ADR 21-ADR-single-db-wal-isolation.md Open Questions).
//
// Mandate B fence note:
//   This file lives under save-gate/ which is OUTSIDE the refuse-deep05-write.sh
//   inspector/ scope. Importing KernelClient (write-path symbols) is permitted here.
//   The guard scripts scan only inspector/ for banned write-RPC tokens.
//
// Tripartite parity: getActiveRepoId imports enumerateWorkspaceRepos from
//   ../inspector/workspace-repos.js -- the save-gate and inspector layers share the
//   SAME fingerprint helper (no third copy). Pitfall D tripartite parity is preserved.

import * as vscode from 'vscode';
import { enumerateWorkspaceRepos, type WorkspaceRepo } from '../inspector/workspace-repos.js';

/**
 * Static service that resolves the active document's repo_id from the git extension.
 * Initialized once in extension.ts activate() before any save events fire (N3 ordering).
 */
export class WorkspaceRepoState {
	private static cache: Map<string, WorkspaceRepo> = new Map();
	private static disposable: vscode.Disposable | null = null;

	/**
	 * Initialize the WorkspaceRepoState service and register the folder-change listener.
	 * Must be called once in extension.ts activate() before any save events fire.
	 * Idempotent: a second call is a no-op (the disposable guard prevents double-registration).
	 *
	 * CLAUDE.md disposable discipline: the listener disposable is pushed onto
	 * context.subscriptions so VS Code tears it down on extension deactivation.
	 */
	static initialize(context: vscode.ExtensionContext): void {
		if (WorkspaceRepoState.disposable !== null) {
			return; // idempotent
		}
		const sub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			WorkspaceRepoState.cache.clear();
		});
		context.subscriptions.push(sub);
		WorkspaceRepoState.disposable = sub;
	}

	/**
	 * Resolve the repo_id for the workspace folder that contains the given URI.
	 * Returns the 12-char SHA-256 fingerprint when a git origin is present,
	 * or 'primary' as a fallback when the folder is not a git repo or has no origin remote.
	 *
	 * Open Decision Sec.7 resolution: called ONCE per save in on-will-save.ts handleProposedSave
	 * and the resolved value is threaded to both proposeEdit and dispatchTier to avoid 4+
	 * redundant cache lookups per save.
	 *
	 * @param uri  The document URI whose workspace folder should be resolved.
	 */
	static async getActiveRepoId(uri: vscode.Uri): Promise<string> {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		if (!folder) {
			return 'primary';
		}
		const key = folder.uri.toString();
		let cached = WorkspaceRepoState.cache.get(key);
		if (!cached) {
			const repos = await enumerateWorkspaceRepos();
			for (const r of repos) {
				WorkspaceRepoState.cache.set(r.folder.uri.toString(), r);
			}
			cached = WorkspaceRepoState.cache.get(key);
		}
		return cached?.repoId ?? 'primary';
	}

	/**
	 * Test-only reset hook. Clears the cache so each test starts with a clean state.
	 */
	static __resetForTest(): void {
		WorkspaceRepoState.cache.clear();
		WorkspaceRepoState.disposable = null;
	}
}
