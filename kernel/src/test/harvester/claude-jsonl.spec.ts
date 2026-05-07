/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/claude-jsonl.spec.ts — Phase 5 Wave-0 refusal stub for TELE-01.
//
// Plan 05-03 will replace each it.skip with a real assertion against startClaudeJsonlWatcher
// (chokidar tail with persisted byte-offset, inode-rotation handling, and truncation
// detection). The stub bodies throw with REFUSAL-BY-NAME so a fresh-clone contributor
// running `npx vitest run` sees both the requirement ID and the upcoming plan number.

import { describe, it } from 'vitest';

describe('TELE-01: chokidar tail with persisted offsets', () => {
	it.skip('tails JSONL file and emits one observation per line', () => {
		throw new Error('Plan 05-03 has not yet implemented startClaudeJsonlWatcher');
	});

	it.skip('persists byte offset across kernel restart and resumes from last byte', () => {
		throw new Error('Plan 05-03 has not yet implemented startClaudeJsonlWatcher (offset persistence via harvest_offsets table)');
	});

	it.skip('detects inode rotation and restarts from byte 0', () => {
		throw new Error('Plan 05-03 has not yet implemented startClaudeJsonlWatcher (inode rotation handling)');
	});

	it.skip('detects file truncation (size < recorded offset) and restarts from byte 0', () => {
		throw new Error('Plan 05-03 has not yet implemented startClaudeJsonlWatcher (truncation handling)');
	});
});
