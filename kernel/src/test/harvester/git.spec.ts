/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/git.spec.ts — Phase 5 Wave-0 refusal stub for TELE-04 (kernel half).
//
// Plan 05-03 will flip each it.skip into a real assertion against enrichGitCommitObservation
// (simple-git diff capture on commit signal). The bridge half (Repository.onDidCommit
// listener) is stubbed in src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/git-events.test.ts.

import { describe, it } from 'vitest';

describe('TELE-04: simple-git diff capture on commit signal', () => {
	it.skip('enrichGitCommitObservation runs git.diff([HEAD~1, HEAD]) and returns {diff, message, author, files_changed}', () => {
		throw new Error('Plan 05-03 has not yet implemented enrichGitCommitObservation');
	});

	it.skip('tolerates initial-commit case (no HEAD~1) by emitting empty diff', () => {
		throw new Error('Plan 05-03 has not yet implemented enrichGitCommitObservation (initial-commit guard)');
	});
});
