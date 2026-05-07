/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/git-events.test.ts
//
// Phase 5 Wave-0 refusal stub for TELE-04 (bridge-side git-commit trigger via the built-in
// vscode.git extension's Repository.onDidCommit; REQUIREMENTS-naming substitution per
// 05-RESEARCH.md ## User Constraints — git.postCommit is not the stable surface).
// Plan 05-03 will flip these.

describe('TELE-04: bridge git-commit trigger', () => {
	it.skip('Repository.onDidCommit triggers harvester.submitObservation with source=git_commit + repo_path + head_commit_at_emit', () => {
		throw new Error('Plan 05-03 has not yet implemented registerGitEventWatcher');
	});

	it.skip('onDidOpenRepository wires the same listener for repos opened post-activation', () => {
		throw new Error('Plan 05-03 has not yet implemented registerGitEventWatcher (late-opened repos)');
	});
});
