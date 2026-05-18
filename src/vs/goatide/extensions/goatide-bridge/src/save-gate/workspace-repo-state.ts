/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 21 XREPO-02 -- WorkspaceRepoState bridge module (Wave 0 stub).
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
// Plan 21-02 lands the real implementation; this file currently throws on every call.

import * as vscode from 'vscode';
import type { WorkspaceRepo } from '../inspector/workspace-repos.js';

/**
 * Static service that resolves the active document's repo_id from the git extension.
 * Plan 21-02 implements the real body; Wave-0 stub throws on every call so bridge
 * test stubs fail with a predictable 'not implemented yet' diagnostic.
 */
export class WorkspaceRepoState {
	private static cache: Map<string, WorkspaceRepo> = new Map();
	private static disposable: vscode.Disposable | null = null;

	/**
	 * Initialize the WorkspaceRepoState service and register the folder-change listener.
	 * Must be called once in extension.ts activate() before any save events fire.
	 * Plan 21-02 implements the real body.
	 */
	static initialize(_context: vscode.ExtensionContext): void {
		throw new Error('WorkspaceRepoState not implemented yet (Phase 21 Wave 0 stub)');
	}

	/**
	 * Resolve the repo_id for the workspace folder that contains the given URI.
	 * Returns the 12-char SHA-256 fingerprint when a git origin is present,
	 * or 'primary' as a fallback when the folder is not a git repo or has no origin remote.
	 * Plan 21-02 implements the real body.
	 *
	 * @param uri  The document URI whose workspace folder should be resolved.
	 */
	static async getActiveRepoId(_uri: vscode.Uri): Promise<string> {
		throw new Error('WorkspaceRepoState not implemented yet (Phase 21 Wave 0 stub)');
	}

	/**
	 * Test-only reset hook. Clears the cache so each test starts with a clean state.
	 * The real `initialize` is responsible for populating the cache; this hook allows
	 * tests to reset between runs without calling initialize (which throws in Wave 0).
	 */
	static __resetForTest(): void {
		WorkspaceRepoState.cache.clear();
	}
}
