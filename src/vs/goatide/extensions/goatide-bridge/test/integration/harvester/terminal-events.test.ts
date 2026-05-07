/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/terminal-events.test.ts
//
// Phase 5 Wave-0 refusal stub for TELE-03 (terminal shell-execution watcher via stable VS
// Code APIs onDidStartTerminalShellExecution + onDidEndTerminalShellExecution +
// TerminalShellExecution.read(); REQUIREMENTS-naming substitution per 05-RESEARCH.md ##
// User Constraints — Pseudoterminal.onDidWrite is not the stable surface).
// Plan 05-04 will flip these.

describe('TELE-03: terminal shell-execution watcher', () => {
	it.skip('onDidStartTerminalShellExecution starts read() consumption + onDidEndTerminalShellExecution emits accumulated output (Pitfall 2)', () => {
		throw new Error('Plan 05-04 has not yet implemented registerTerminalEventWatcher');
	});

	it.skip('ANSI strip applied + 32KB truncation marker', () => {
		throw new Error('Plan 05-04 has not yet implemented registerTerminalEventWatcher (ANSI strip + truncation)');
	});

	it.skip('unknown commandLine.value (confidence=0) is skipped silently', () => {
		throw new Error('Plan 05-04 has not yet implemented registerTerminalEventWatcher (unknown-command guard)');
	});
});
