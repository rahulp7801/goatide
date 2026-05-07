/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/justified.spec.ts — Phase 5 Plan 05-05 PORT-01 predicate 5
// (justified — observation includes rationale, not just an event).

import { describe, it, expect } from 'vitest';
import { isJustified } from '../../../harvester/filter/justified.js';
import type { FilterContext } from '../../../harvester/filter/index.js';
import type { RawObservation } from '../../../harvester/observations.js';

const ctx = {} as FilterContext;

describe('PORT-01: justified predicate', () => {
	it('classifies justification by source-specific heuristics', () => {
		const claudePass: RawObservation = {
			id: 'a', ts: 't', body: '{"x":1}', source: 'claude_jsonl', file_path: '/p',
		};
		const editorEmpty: RawObservation = {
			id: 'b', ts: 't', body: '', source: 'editor_save',
			file_path: '/p', language: 'ts', line_count: 0,
		};
		const editorSubstantive: RawObservation = {
			id: 'c', ts: 't', body: '', source: 'editor_save',
			file_path: '/p', language: 'ts', line_count: 42,
		};
		const termSilentSuccess: RawObservation = {
			id: 'd', ts: 't', body: 'ls', source: 'terminal_shell',
			output: '', exit_code: 0, cwd: null,
		};
		const termError: RawObservation = {
			id: 'e', ts: 't', body: 'npm test', source: 'terminal_shell',
			output: '', exit_code: 1, cwd: null,
		};
		const gitWip: RawObservation = {
			id: 'f', ts: 't', body: '', source: 'git_commit',
			repo_path: '/r', head_commit_at_emit: 'c', head_branch_at_emit: 'm',
			message: '', diff: '',
		};

		expect({
			claude: isJustified(claudePass, ctx).ok,
			editorEmpty: isJustified(editorEmpty, ctx).ok,
			editorSubstantive: isJustified(editorSubstantive, ctx).ok,
			termSilentSuccess: isJustified(termSilentSuccess, ctx).ok,
			termError: isJustified(termError, ctx).ok,
			gitWip: isJustified(gitWip, ctx).ok,
		}).toEqual({
			claude: true,
			editorEmpty: false,
			editorSubstantive: true,
			termSilentSuccess: false,
			termError: true,
			gitWip: false,
		});
	});
});
