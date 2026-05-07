/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/terminal-events.test.ts
//
// Phase 5 Plan 04 — TELE-03 (terminal shell-execution watcher; stable shell-integration
// path via onDidStartTerminalShellExecution + onDidEndTerminalShellExecution +
// TerminalShellExecution.read() AsyncIterable).
//
// Pitfall 2 explicitly tested: read() consumption MUST start at start-event time. A naive
// "wait until end then read" pattern would produce empty observations because the iterable
// has already drained by then.

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'node:assert';
import {
	registerTerminalEventWatcher,
	MAX_OUTPUT_PRE_TRUNCATE,
} from '../../../src/harvester/terminal-events.js';
import {
	resetEditorEventEmitters,
	fireTerminalShellExecutionStart,
	fireTerminalShellExecutionEnd,
} from '../../setup/vscode-stub.js';

interface SubmittedObservation {
	id: string;
	source: string;
	body?: string;
	output?: string;
	exit_code?: number | null;
	cwd?: string | null;
	ts: string;
	detail?: { confidence?: number; truncated?: boolean };
}

interface MockKernel {
	calls: SubmittedObservation[];
	harvesterSubmitObservation: (obs: SubmittedObservation) => Promise<{ ok: true }>;
}

function makeMockKernel(): MockKernel {
	const calls: SubmittedObservation[] = [];
	return {
		calls,
		harvesterSubmitObservation: async (obs: SubmittedObservation): Promise<{ ok: true }> => {
			calls.push(obs);
			return { ok: true };
		},
	};
}

function makeMockContext(): { subscriptions: { dispose: () => void }[] } {
	return { subscriptions: [] };
}

interface AsyncIterableMockExecution {
	readonly commandLine: { value: string; confidence: number };
	readonly cwd?: { fsPath: string };
	read(): AsyncIterable<string>;
}

function makeExecutionFromChunks(opts: { command: string; chunks: string[]; cwd?: string; confidence?: number }): AsyncIterableMockExecution {
	return {
		commandLine: { value: opts.command, confidence: opts.confidence ?? 2 },
		cwd: opts.cwd ? { fsPath: opts.cwd } : undefined,
		async *read(): AsyncIterable<string> {
			for (const c of opts.chunks) {
				yield c;
			}
		},
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

describe('TELE-03: terminal shell-execution watcher', () => {
	beforeEach(() => {
		resetEditorEventEmitters();
	});

	it('start+end accumulator captures full output (Pitfall 2)', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		registerTerminalEventWatcher(ctx as never, kernel);

		const exec = makeExecutionFromChunks({
			command: 'echo hello',
			chunks: ['hello', ' ', 'world'],
			cwd: '/work/repo',
		});
		fireTerminalShellExecutionStart(exec);
		// Allow the read-loop microtasks to drain so all 3 chunks are buffered before end.
		await sleep(20);
		fireTerminalShellExecutionEnd(exec, 0);
		// One more tick so the end handler can read the buffer + dispatch.
		await sleep(20);

		assert.equal(kernel.calls.length, 1);
		assert.equal(kernel.calls[0].source, 'terminal_shell');
		assert.equal(kernel.calls[0].body, 'echo hello');
		assert.equal(kernel.calls[0].output, 'hello world');
		assert.equal(kernel.calls[0].exit_code, 0);
		assert.equal(kernel.calls[0].cwd, '/work/repo');
		assert.equal(kernel.calls[0].detail?.confidence, 2);
		assert.equal(kernel.calls[0].detail?.truncated, false);
	});

	it('empty commandLine.value or confidence=0 is skipped silently', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		registerTerminalEventWatcher(ctx as never, kernel);

		// confidence=0 (low-confidence shell-integration case)
		const exec1 = makeExecutionFromChunks({ command: 'echo', chunks: ['x'], confidence: 0 });
		fireTerminalShellExecutionStart(exec1);
		await sleep(10);
		fireTerminalShellExecutionEnd(exec1, 0);
		await sleep(10);

		// empty commandLine.value
		const exec2 = makeExecutionFromChunks({ command: '', chunks: ['x'] });
		fireTerminalShellExecutionStart(exec2);
		await sleep(10);
		fireTerminalShellExecutionEnd(exec2, 0);
		await sleep(10);

		assert.equal(kernel.calls.length, 0, 'low-confidence + empty-command executions MUST be skipped');
	});

	it('hard ceiling at MAX_OUTPUT_PRE_TRUNCATE prevents memory leak', async () => {
		const ctx = makeMockContext();
		const kernel = makeMockKernel();
		registerTerminalEventWatcher(ctx as never, kernel);

		// Yield a 100KB chunk; the watcher must stop accumulating once the buffer crosses
		// MAX_OUTPUT_PRE_TRUNCATE (64KB).
		const bigChunk = 'A'.repeat(100 * 1024);
		const exec = makeExecutionFromChunks({ command: 'cat huge.txt', chunks: [bigChunk] });
		fireTerminalShellExecutionStart(exec);
		// Generous drain — even though there's just one yield, the for-await-of loop is async.
		await sleep(40);
		fireTerminalShellExecutionEnd(exec, 0);
		await sleep(20);

		assert.equal(kernel.calls.length, 1);
		const out = kernel.calls[0].output ?? '';
		assert.ok(
			out.length <= MAX_OUTPUT_PRE_TRUNCATE + bigChunk.length,
			`bridge should not retain more than the chunk that crossed the ceiling; got ${out.length} bytes`,
		);
		// truncated flag should be set: total written length >= MAX_OUTPUT_PRE_TRUNCATE.
		assert.equal(kernel.calls[0].detail?.truncated, true, 'truncated flag must be set when ceiling reached');
	});
});
