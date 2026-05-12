/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 12 Plan 12-01 — auto-save bypass fix (CONTEXT.md Option B).
//
// Tests assert that on-will-save.ts gates destructive + high-impact-citation saves regardless
// of `event.reason`, while silent-tier non-Manual saves still pass through. The fixture pattern:
//
//   1. Build a mock kernel that reports `isConnected() === false` so the listener routes through
//      `handleProposedSave` → `handleKernelDegradedSave`. The destructive branch surfaces
//      `vscode.window.showErrorMessage` (captured by `vscode.__test_showErrorMessageSpy` from
//      test/setup/vscode-stub.ts).
//   2. Register the save-gate via `registerSaveGate(ctx, kernel, getPanel, queue)`.
//   3. Fire a mock `TextDocumentWillSaveEvent` via `fireWillSaveTextDocument(doc, reason)`. The
//      helper captures every `event.waitUntil(thenable)` call on `event.waitUntilCalls`.
//   4. Assert on the captured veto promise + the showErrorMessage spy + the queue contents.
//
// Why kernel-degraded mode for the proposal sink: this lets the tests stay hermetic (no spawned
// kernel sidecar) while still exercising the FULL listener path through to a side-effect-bearing
// surface. The destructive-block error message is the bridge's "modal" equivalent under degraded
// state; the live-kernel modal path is covered by the existing save-gate.test.ts Manual baseline.

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ulid } from 'ulid';
import { registerSaveGate, SaveDeferredError } from '../../src/save-gate/on-will-save.js';
import { PendingAttemptsQueue } from '../../src/save-gate/pending-attempts.js';
import type { KernelClient } from '../../src/kernel/client.js';
import type { CanvasPanel } from '../../src/canvas/panel.js';
import {
	fireWillSaveTextDocument,
	type MockTextDocument,
	type MockWillSaveEvent,
} from '../setup/vscode-stub.js';

interface VscodeTestStub {
	__test_showErrorMessageSpy: { calls: unknown[][]; respondWith: string | undefined };
}

interface PanelShowRecorder {
	showAndAwaitCalls: unknown[];
}

function makeDisconnectedKernelStub(): KernelClient {
	return {
		isConnected: () => false,
	} as unknown as KernelClient;
}

function makePanelStub(): { panel: CanvasPanel; recorder: PanelShowRecorder } {
	const recorder: PanelShowRecorder = { showAndAwaitCalls: [] };
	const panel = {
		showAndAwait: async (payload: unknown) => {
			recorder.showAndAwaitCalls.push(payload);
			return { kind: 'reject', change_id: 'noop' };
		},
		hide: async () => true,
		dispose: () => undefined,
		registerOverrideHandler: () => undefined,
		postComplianceReportPartial: async () => true,
		postComplianceReportFull: async () => true,
	} as unknown as CanvasPanel;
	return { panel, recorder };
}

function makeContextStub(): vscode.ExtensionContext {
	const subscriptions: { dispose: () => void }[] = [];
	return { subscriptions } as unknown as vscode.ExtensionContext;
}

function makeMockDoc(filePath: string, opts: { onDisk: string; inMemory: string }): MockTextDocument & { getText: () => string; fileName: string } {
	// Write the on-disk content (the "original" the listener reads via fsp.readFile inside
	// the vetoPromise). The in-memory content is what doc.getText() returns and matches the
	// "modified" the user is trying to save. createPatch(disk, inMemory) yields the
	// unified-diff that on-will-save / handleKernelDegradedSave feeds to detectDestructive.
	fs.writeFileSync(filePath, opts.onDisk, 'utf8');
	return {
		uri: {
			toString: () => `file://${filePath}`,
			fsPath: filePath,
		},
		languageId: 'typescript',
		lineCount: opts.inMemory.split('\n').length,
		fileName: filePath,
		getText: () => opts.inMemory,
	};
}

async function settleVeto(event: MockWillSaveEvent): Promise<{ vetoed: boolean; error: Error | null }> {
	// Walk every captured waitUntil(...) promise; if any one rejects (the canonical
	// SaveDeferredError path) we treat the save as vetoed. waitUntilCalls is a [] when no
	// veto happened — the silent-tier pass-through case.
	if (event.waitUntilCalls.length === 0) {
		return { vetoed: false, error: null };
	}
	const results = await Promise.allSettled(event.waitUntilCalls);
	for (const r of results) {
		if (r.status === 'rejected') {
			return { vetoed: true, error: r.reason as Error };
		}
	}
	return { vetoed: false, error: null };
}

async function drainMicrotasks(): Promise<void> {
	// The fire-and-forget handleProposedSave is dispatched via `void handleProposedSave(...)`
	// inside the vetoPromise's async chain. After the vetoPromise resolves/rejects, we need
	// to let the kernel-degraded fork's showErrorMessage call run through its own async
	// IIFE. 50ms is generous for an in-process Promise chain + a setImmediate flush.
	await new Promise((r) => setTimeout(r, 50));
}

describe('save-gate-auto-save', () => {
	let workDir: string;
	let queue: PendingAttemptsQueue;
	let context: vscode.ExtensionContext;
	let saveGateDisposable: vscode.Disposable | undefined;
	let spy: { calls: unknown[][]; respondWith: string | undefined };

	beforeEach(() => {
		workDir = path.join(os.tmpdir(), `goatide-12-01-${ulid()}`);
		fs.mkdirSync(workDir, { recursive: true });
		queue = new PendingAttemptsQueue(workDir);
		context = makeContextStub();
		spy = (vscode as unknown as VscodeTestStub).__test_showErrorMessageSpy;
		spy.calls.length = 0;
		spy.respondWith = undefined;
	});

	afterEach(() => {
		try { saveGateDisposable?.dispose(); } catch { /* ignore */ }
		saveGateDisposable = undefined;
		try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	it('AfterDelay-destructive vetoes save and reveals canvas', () => {
		// 12-01-01 — auto-save (TextDocumentSaveReason.AfterDelay) on a destructive change
		// (e.g., file body contains `DROP TABLE`) must invoke event.waitUntil(Promise.reject(...))
		// and reveal the Verification Canvas, NOT short-circuit the way `event.reason !== Manual`
		// currently does at on-will-save.ts:62-65.
		assert.fail('NOT IMPLEMENTED — Plan 12-01 Task 01');
	});

	it('AfterDelay-silent-passes through without veto', () => {
		// 12-01-02 — auto-save on a silent-tier change (no destructive markers, no high-impact
		// contract citation) must STILL pass through without a veto (CONTEXT.md Option B
		// explicitly preserves auto-save UX for trivial changes — only destructive + high-impact
		// saves are gated regardless of reason).
		assert.fail('NOT IMPLEMENTED — Plan 12-01 Task 02');
	});

	it('FocusOut-high-impact opens modal', () => {
		// 12-01-03 — TextDocumentSaveReason.FocusOut on a save citing a high-impact contract
		// anchor (e.g., a path matching `goatide.contracts.highImpactAllowlist`) must open the
		// modal Verification Canvas tier, NOT pass through.
		assert.fail('NOT IMPLEMENTED — Plan 12-01 Task 03');
	});

	it('Manual-destructive-still-vetoed regression guard', async () => {
		// 12-01-04 — regression sentinel: TextDocumentSaveReason.Manual on a destructive change
		// must continue to be vetoed + reach the destructive-block surface. This task lands
		// FIRST (before the on-will-save.ts refactor in Task 12-01-05) and must already be
		// GREEN against the unmodified source — because the existing reason-check lets Manual
		// through to handleProposedSave. The Task 12-01-05 refactor must keep this green:
		// the regression fence catches accidental narrowing of the manual-save path.
		const target = path.join(workDir, 'destructive-manual.ts');
		const doc = makeMockDoc(target, {
			onDisk: 'const m = "";\n',
			inMemory: 'const m = "DROP TABLE accounts";\n',
		});
		const kernel = makeDisconnectedKernelStub();
		const { panel } = makePanelStub();
		saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

		const event = fireWillSaveTextDocument(doc, vscode.TextDocumentSaveReason.Manual);
		const { vetoed, error } = await settleVeto(event);
		await drainMicrotasks();

		assert.equal(vetoed, true, 'Manual destructive must remain vetoed (regression fence)');
		assert.ok(error instanceof SaveDeferredError, `expected SaveDeferredError, got ${error?.constructor?.name}`);
		assert.ok(spy.calls.length >= 1, `expected showErrorMessage to surface; spy.calls=${spy.calls.length}`);
		const firstMessage = spy.calls[0][0] as string;
		assert.match(firstMessage, /destructive save blocked/i);
		// File must NOT be overwritten (the disk original is preserved on destructive-block).
		assert.equal(fs.readFileSync(target, 'utf8'), 'const m = "";\n');
	});
});
