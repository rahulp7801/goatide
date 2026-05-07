/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/harvester/terminal-events.ts — Phase 5 Plan 04.
//
// TELE-03: Terminal shell-execution watcher.
//
// Stable shell-integration path. The actual VS Code stable API for capturing terminal
// OUTPUT is window.onDidStartTerminalShellExecution + window.onDidEndTerminalShellExecution
// + TerminalShellExecution.read() AsyncIterable<string>. (REQUIREMENTS-naming substitution
// per 05-RESEARCH.md ## User Constraints — Pseudoterminal.onDidWrite is for OUTBOUND
// extension-to-terminal writes, not the capture surface we want; see Phase-4's
// @vscode/webview-ui-toolkit -> @vscode-elements/elements precedent.)
//
// Pitfall 2: read() returns an AsyncIterable that ONLY yields chunks emitted AFTER
// iteration begins. The watcher MUST subscribe to onDidStartTerminalShellExecution and
// kick off the read-loop there. A naive "subscribe to End-only and then read" pattern
// produces empty observations because the iterable has already drained by the time the
// end-event fires. terminal-events.test.ts test 1 fails such a regression.
//
// Per-execution accumulator (Map<TerminalShellExecution, string[]>) keeps multiple
// concurrent shell sessions from cross-contaminating each other's output. The Map entry
// is deleted on the end-event so executions don't pile up.
//
// Hard ceiling MAX_OUTPUT_PRE_TRUNCATE = 64*1024 bytes (Pitfall 6 spirit). The kernel-side
// normalizeTerminalOutput will further strip ANSI sequences and truncate at 32KB; the
// 64KB pre-truncate ceiling here is defense-in-depth so a runaway terminal can't OOM the
// extension host before the kernel sees the observation.
//
// Skip semantics: empty commandLine.value or confidence===0 (low-confidence
// shell-integration cases per 05-RESEARCH.md ## Pattern: Terminal Watcher caveat) are
// silently skipped — submit nothing rather than emit untrustworthy observations.

import * as vscode from 'vscode';
import { ulid } from 'ulid';

/** Pre-truncate hard ceiling at the bridge boundary. Kernel-side normalize then trims to
 * MAX_OUTPUT_PER_OBS=32KB. */
export const MAX_OUTPUT_PRE_TRUNCATE = 64 * 1024;

interface SubmitObservationArg {
	id: string;
	source: string;
	body?: string;
	output?: string;
	exit_code?: number | null;
	cwd?: string | null;
	ts: string;
	detail?: { confidence?: number; truncated?: boolean };
}

interface KernelClientLike {
	harvesterSubmitObservation: (obs: SubmitObservationArg) => Promise<unknown>;
}

interface ExtensionContextLike {
	subscriptions: { dispose: () => void }[];
}

// vscode.TerminalShellExecution + the start/end event payload. We use a structural
// interface so the test stub (which omits the wider Terminal/TerminalShellIntegration
// surfaces) is still assignable.
interface TerminalShellExecutionLike {
	readonly commandLine: { value: string; confidence: number };
	readonly cwd?: { fsPath: string };
	read(): AsyncIterable<string>;
}

interface TerminalShellExecutionStartEventLike {
	readonly execution: TerminalShellExecutionLike;
}

interface TerminalShellExecutionEndEventLike {
	readonly execution: TerminalShellExecutionLike;
	readonly exitCode: number | null | undefined;
}

/**
 * Wire onDidStart/EndTerminalShellExecution to the kernel via a per-execution accumulator.
 * One observation per shell command (skipping low-confidence and empty-command cases).
 */
export function registerTerminalEventWatcher(
	ctx: ExtensionContextLike,
	kernel: KernelClientLike,
): void {
	// Per-execution buffer. Each TerminalShellExecution is a unique object identity from
	// VS Code so Map<execution, string[]> safely keys multiple concurrent sessions.
	const buffers = new Map<TerminalShellExecutionLike, string[]>();
	// Track running totals so we don't have to .join('').length on every chunk.
	const sizes = new Map<TerminalShellExecutionLike, number>();

	const startSub = (vscode.window as unknown as {
		onDidStartTerminalShellExecution: (l: (e: TerminalShellExecutionStartEventLike) => void) => { dispose: () => void };
	}).onDidStartTerminalShellExecution((e) => {
		const exec = e.execution;
		const buf: string[] = [];
		buffers.set(exec, buf);
		sizes.set(exec, 0);
		// Start the read-loop NOW (Pitfall 2). Fire-and-forget IIFE — the end handler reads
		// from buf even if this loop is mid-iteration when end fires (the next chunk it
		// receives still goes into buf, but the end handler has already snapshotted; that's
		// an at-most-one-chunk slop which the truncated flag captures).
		void (async (): Promise<void> => {
			try {
				for await (const chunk of exec.read()) {
					const cur = sizes.get(exec) ?? 0;
					if (cur >= MAX_OUTPUT_PRE_TRUNCATE) {
						break;
					}
					buf.push(chunk);
					sizes.set(exec, cur + chunk.length);
				}
			} catch (err) {
				console.error('[goatide-bridge] terminal-events read-loop failed', err);
			}
		})();
	});

	const endSub = (vscode.window as unknown as {
		onDidEndTerminalShellExecution: (l: (e: TerminalShellExecutionEndEventLike) => void) => { dispose: () => void };
	}).onDidEndTerminalShellExecution((e) => {
		const exec = e.execution;
		const buf = buffers.get(exec) ?? [];
		const totalSize = sizes.get(exec) ?? 0;
		buffers.delete(exec);
		sizes.delete(exec);

		const cmd = exec.commandLine?.value ?? '';
		const confidence = exec.commandLine?.confidence ?? 0;
		// Skip silently per 05-RESEARCH.md caveat: low-confidence shell-integration produces
		// untrustworthy command attribution.
		if (cmd.length === 0 || confidence === 0) {
			return;
		}

		const captured = buf.join('');
		const truncated = totalSize >= MAX_OUTPUT_PRE_TRUNCATE;

		const obs: SubmitObservationArg = {
			id: ulid(),
			source: 'terminal_shell',
			body: cmd,
			output: captured,
			exit_code: e.exitCode ?? null,
			cwd: exec.cwd?.fsPath ?? null,
			ts: new Date().toISOString(),
			detail: { confidence, truncated },
		};
		void kernel.harvesterSubmitObservation(obs).catch((err) => {
			console.error('[goatide-bridge] terminal-events submitObservation failed', err);
		});
	});

	ctx.subscriptions.push(startSub);
	ctx.subscriptions.push(endSub);
	ctx.subscriptions.push({
		dispose: () => {
			// Drop in-flight execution buffers. Their read-loops may still hold references
			// to the AsyncIterable; the iterables will be GC'd when VS Code releases them.
			buffers.clear();
			sizes.clear();
		},
	});
}
