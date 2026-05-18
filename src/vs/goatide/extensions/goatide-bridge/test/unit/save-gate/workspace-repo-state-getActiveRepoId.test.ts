/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/save-gate/workspace-repo-state-getActiveRepoId.test.ts -- Phase 21 Plan 21-01.
//
// RED stub. Two cases covering XREPO-02a/b:
// (a) 'WorkspaceRepoState fingerprint:' -- folder with a git remote returns the 12-char
//     SHA-256 fingerprint of the normalized origin URL.
// (b) 'WorkspaceRepoState primary fallback:' -- folder with no git remote returns 'primary'.
//
// Today (Wave 0): WorkspaceRepoState.getActiveRepoId throws 'not implemented yet'.
// Both tests FAIL with that predictable diagnostic. GREEN after Plan 21-02 lands the
// real implementation.
//
// Grep alignment: 'WorkspaceRepoState.*fingerprint' + 'WorkspaceRepoState.*primary.*fallback'.
//
// Mock pattern: mirrors workspace-repos.test.ts (Object.defineProperty for
// vscode.workspace.workspaceFolders; direct property replacement for getExtension).

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

/** Compute the expected fingerprint from first principles (mirrors workspace-repos.ts logic). */
function computeExpectedFingerprint(url: string): string {
	const normalized = url.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
	return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

const FIXTURE_URL = 'https://github.com/x/y.git';
const FIXTURE_FINGERPRINT = computeExpectedFingerprint(FIXTURE_URL);
const FIXTURE_FOLDER_PATH = '/tmp/test-workspace-repo';

function mockWorkspaceFolders(folders: vscode.WorkspaceFolder[] | undefined): () => void {
	const orig = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');
	Object.defineProperty(vscode.workspace, 'workspaceFolders', {
		get: () => folders,
		configurable: true,
	});
	return () => {
		if (orig) {
			Object.defineProperty(vscode.workspace, 'workspaceFolders', orig);
		}
	};
}

function makeWorkspaceFolder(fsPath: string, name: string): vscode.WorkspaceFolder {
	return {
		uri: vscode.Uri.file(fsPath),
		name,
		index: 0,
	};
}

describe('WorkspaceRepoState XREPO-02a/b (RED stub -- Phase 21 Plan 21-01)', () => {

	it('WorkspaceRepoState fingerprint: returns 12-char SHA-256 hex for folder with git remote', async () => {
		const folder = makeWorkspaceFolder(FIXTURE_FOLDER_PATH, 'test-workspace-repo');
		const mockUri = folder.uri;

		const restoreFolders = mockWorkspaceFolders([folder]);

		// Mock vscode.workspace.getWorkspaceFolder to return our test folder for the mock URI.
		// Guard against undefined (the mock vscode environment may not provide this method).
		const origGetWorkspaceFolder = typeof vscode.workspace.getWorkspaceFolder === 'function'
			? vscode.workspace.getWorkspaceFolder.bind(vscode.workspace)
			: undefined;
		(vscode.workspace as unknown as Record<string, unknown>)['getWorkspaceFolder'] = (_uri: vscode.Uri) => folder;

		// Mock vscode.extensions.getExtension to return a synthetic git extension.
		// Use folder.uri.fsPath (not the raw POSIX FIXTURE_FOLDER_PATH literal) so the
		// rootUri.fsPath comparison in enumerateWorkspaceRepos matches on all platforms.
		const origGetExtension = vscode.extensions.getExtension.bind(vscode.extensions);
		(vscode.extensions as unknown as Record<string, unknown>)['getExtension'] = (id: string) => {
			if (id === 'vscode.git') {
				return {
					isActive: true,
					activate: async () => ({
						getAPI: (_version: number) => ({
							repositories: [
								{
									rootUri: { fsPath: folder.uri.fsPath },
									state: {
										remotes: [
											{ name: 'origin', fetchUrl: FIXTURE_URL },
										],
									},
								},
							],
						}),
					}),
				};
			}
			return origGetExtension(id);
		};

		try {
			const { WorkspaceRepoState } = await import('../../../src/save-gate/workspace-repo-state.js');
			WorkspaceRepoState.__resetForTest();
			// GREEN after Plan 21-02 implements the method.
			const result = await WorkspaceRepoState.getActiveRepoId(mockUri);
			assert.strictEqual(result.length, 12, 'result must be 12 chars');
			assert.ok(/^[0-9a-f]{12}$/.test(result), 'result must match /^[0-9a-f]{12}$/');
			assert.strictEqual(result, FIXTURE_FINGERPRINT, 'fingerprint must match SHA-256/12 of normalized URL');
		} finally {
			restoreFolders();
			if (origGetWorkspaceFolder !== undefined) {
				(vscode.workspace as unknown as Record<string, unknown>)['getWorkspaceFolder'] = origGetWorkspaceFolder;
			} else {
				delete (vscode.workspace as unknown as Record<string, unknown>)['getWorkspaceFolder'];
			}
			(vscode.extensions as unknown as Record<string, unknown>)['getExtension'] = origGetExtension;
		}
	});

	it('WorkspaceRepoState primary fallback: returns primary for folder with no git remote', async () => {
		const folder = makeWorkspaceFolder('/tmp/no-git-repo', 'no-git-repo');
		const mockUri = folder.uri;

		const restoreFolders = mockWorkspaceFolders([folder]);

		// Mock workspace folder resolution.
		// Guard against undefined (the mock vscode environment may not provide this method).
		const origGetWorkspaceFolder = typeof vscode.workspace.getWorkspaceFolder === 'function'
			? vscode.workspace.getWorkspaceFolder.bind(vscode.workspace)
			: undefined;
		(vscode.workspace as unknown as Record<string, unknown>)['getWorkspaceFolder'] = (_uri: vscode.Uri) => folder;

		// Mock git extension with NO remotes for this folder.
		// Use folder.uri.fsPath for cross-platform path matching.
		const origGetExtension = vscode.extensions.getExtension.bind(vscode.extensions);
		(vscode.extensions as unknown as Record<string, unknown>)['getExtension'] = (id: string) => {
			if (id === 'vscode.git') {
				return {
					isActive: true,
					activate: async () => ({
						getAPI: (_version: number) => ({
							repositories: [
								{
									rootUri: { fsPath: folder.uri.fsPath },
									state: {
										remotes: [], // no remotes -- triggers 'primary' fallback
									},
								},
							],
						}),
					}),
				};
			}
			return origGetExtension(id);
		};

		try {
			const { WorkspaceRepoState } = await import('../../../src/save-gate/workspace-repo-state.js');
			WorkspaceRepoState.__resetForTest();
			// GREEN after Plan 21-02 implements the 'primary' fallback path.
			const result = await WorkspaceRepoState.getActiveRepoId(mockUri);
			assert.strictEqual(result, 'primary', 'must return primary when no git remote');
		} finally {
			restoreFolders();
			if (origGetWorkspaceFolder !== undefined) {
				(vscode.workspace as unknown as Record<string, unknown>)['getWorkspaceFolder'] = origGetWorkspaceFolder;
			} else {
				delete (vscode.workspace as unknown as Record<string, unknown>)['getWorkspaceFolder'];
			}
			(vscode.extensions as unknown as Record<string, unknown>)['getExtension'] = origGetExtension;
		}
	});
});
