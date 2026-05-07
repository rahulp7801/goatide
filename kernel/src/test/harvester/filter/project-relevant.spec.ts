/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/project-relevant.spec.ts — Phase 5 Plan 05-05 PORT-01
// predicate 3 (project-relevant — file_path is inside an active workspace folder).

import { describe, it, expect } from 'vitest';
import { isProjectRelevant } from '../../../harvester/filter/project-relevant.js';
import type { FilterContext } from '../../../harvester/filter/index.js';
import type { RawObservation } from '../../../harvester/observations.js';

function makeClaude(file_path: string): RawObservation {
	return { id: 'a', ts: 't', body: 'b', source: 'claude_jsonl', file_path };
}

describe('PORT-01: project-relevant predicate', () => {
	it('accepts paths inside workspaceFolders, rejects outside, accepts no-file_path observations', () => {
		const ctx: FilterContext = {
			dao: {} as unknown as FilterContext['dao'],
			workspaceFolders: ['/home/dev/proj-a', '/home/dev/proj-b'],
			now: () => 0,
		};

		const inside = isProjectRelevant(makeClaude('/home/dev/proj-a/src/x.ts'), ctx);
		const outside = isProjectRelevant(makeClaude('/opt/elastic/config/x.yml'), ctx);
		// Terminal observation with no file_path -> accept (default-pass; verifiable handles).
		const noFile: RawObservation = {
			id: 'a', ts: 't', body: 'ls', source: 'terminal_shell',
			output: '', exit_code: 0, cwd: null,
		};
		const passthrough = isProjectRelevant(noFile, ctx);

		expect({
			inside: inside.ok,
			outside: outside.ok,
			passthrough: passthrough.ok,
		}).toEqual({
			inside: true,
			outside: false,
			passthrough: true,
		});
	});
});
