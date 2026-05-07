/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/project-relevant.spec.ts — Phase 5 Wave-0 refusal stub for
// PORT-01 (predicate 3 of 5: project-relevant — file_path is inside the active workspace).
//
// Plan 05-05 will flip the it.skip blocks into real assertions against isProjectRelevant.

import { describe, it } from 'vitest';

describe('PORT-01: project-relevant predicate', () => {
	it.skip('accept: file_path inside vscode.workspace.workspaceFolders', () => {
		throw new Error('Plan 05-05 has not yet implemented isProjectRelevant');
	});

	it.skip('reject: file_path outside any workspace folder (e.g., observation about an unrelated project from a Claude transcript)', () => {
		throw new Error('Plan 05-05 has not yet implemented isProjectRelevant (out-of-workspace path)');
	});
});
