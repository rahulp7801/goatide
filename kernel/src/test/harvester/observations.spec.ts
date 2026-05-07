/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/observations.spec.ts — Phase 5 Plan 05-03.
//
// Round-trips the RawObservationSchema discriminated-union for each of the four sources +
// validates failure modes (missing required fields; unknown source). RawObservationSchema is
// the single source of truth; the bridge mirror in
// src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts must stay structurally
// identical.

import { describe, it, expect } from 'vitest';
import { RawObservationSchema } from '../../harvester/observations.js';

describe('Plan 05-03: RawObservation discriminated-union schema', () => {
	it('round-trips each of the four source variants and rejects schema-violations', () => {
		const claude = RawObservationSchema.safeParse({
			id: '01HQABCDEF', source: 'claude_jsonl', body: '{"role":"user"}',
			ts: '2026-05-07T00:00:00.000Z', file_path: '/tmp/session.jsonl', parsed: { role: 'user' },
		});
		const editor = RawObservationSchema.safeParse({
			id: '01HQABCDEG', source: 'editor_save', body: 'export function foo() {}',
			ts: '2026-05-07T00:00:00.000Z', file_path: '/tmp/foo.ts', language: 'typescript', line_count: 10,
		});
		const terminal = RawObservationSchema.safeParse({
			id: '01HQABCDEH', source: 'terminal_shell', body: 'npm test',
			ts: '2026-05-07T00:00:00.000Z', output: 'PASS\n', exit_code: 0, cwd: '/tmp',
		});
		const git = RawObservationSchema.safeParse({
			id: '01HQABCDEI', source: 'git_commit', body: 'fix(auth): null guard',
			ts: '2026-05-07T00:00:00.000Z', repo_path: '/tmp/repo',
			head_commit_at_emit: 'deadbeef', head_branch_at_emit: 'master',
		});
		const missingRequired = RawObservationSchema.safeParse({
			id: 'x', source: 'editor_save', body: 'b', ts: 't', file_path: '/p', language: 'ts',
			// missing line_count
		});
		const unknownSource = RawObservationSchema.safeParse({
			id: 'x', source: 'agent_thought' as 'claude_jsonl', body: 'b', ts: 't',
		});

		expect({
			claude_ok: claude.success,
			editor_ok: editor.success,
			terminal_ok: terminal.success,
			git_ok: git.success,
			missing_required_fail: missingRequired.success,
			unknown_source_fail: unknownSource.success,
		}).toEqual({
			claude_ok: true, editor_ok: true, terminal_ok: true, git_ok: true,
			missing_required_fail: false, unknown_source_fail: false,
		});
	});
});
