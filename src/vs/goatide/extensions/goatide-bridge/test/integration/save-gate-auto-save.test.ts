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

import { describe, it, before, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ulid } from 'ulid';
import { registerSaveGate } from '../../src/save-gate/on-will-save.js';
import { PendingAttemptsQueue } from '../../src/save-gate/pending-attempts.js';
import type { KernelClient } from '../../src/kernel/client.js';
import type { CanvasPanel } from '../../src/canvas/panel.js';
import {
	fireWillSaveTextDocument,
	setWorkspaceConfigurationValue,
	type MockTextDocument,
	type MockWillSaveEvent,
} from '../setup/vscode-stub.js';
import { getCanvasModule } from '../../src/save-gate/canvas-module.js';

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

async function settleVeto(event: MockWillSaveEvent): Promise<{ gated: boolean; settledStatus: 'fulfilled' | 'rejected' | 'none' }> {
	// Post-CLOSE-02 (commit 5099b6ebd01) save-gate calls event.waitUntil(Promise.resolve())
	// instead of Promise.reject(SaveDeferredError) to avoid VS Code's _badListeners throttle.
	// "gated" now means the listener fell through past the silent-tier early-return and
	// actually constructed a waitUntil promise — proven by `waitUntilCalls.length > 0`. The
	// destructive-block surface (showErrorMessage / panel.showAndAwait) is raised by the
	// fire-and-forget IIFE that runs after the listener returns; tests assert on the
	// IIFE-side surface, not on the waitUntil rejection.
	if (event.waitUntilCalls.length === 0) {
		return { gated: false, settledStatus: 'none' };
	}
	const results = await Promise.allSettled(event.waitUntilCalls);
	const firstStatus = results[0]?.status ?? 'fulfilled';
	return { gated: true, settledStatus: firstStatus };
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

	// Pre-warm the canvas module ONCE for the whole describe block. The Task 12-01-05
	// refactor moved canvas-module loading into activate() — for hermetic mocha tests we
	// call getCanvasModule() ourselves so getCanvasModuleSync() inside the listener has a
	// hot cache. Task 12-01-04 (Manual path) doesn't need the pre-warm because Manual
	// skips the sync-classification block entirely; the other 3 tests do.
	before(async function () {
		this.timeout(15_000);
		await getCanvasModule();
	});

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

	it('AfterDelay-destructive surfaces destructive-block warning', async () => {
		// 12-01-01 (re-aligned post-CLOSE-02) — auto-save (TextDocumentSaveReason.AfterDelay) on
		// a destructive change (file body contains `DROP TABLE`) must NOT short-circuit on the
		// `event.reason !== Manual` early-return that existed pre-Plan-12-01 at
		// on-will-save.ts:62-65, must call event.waitUntil(Promise.resolve()), and the
		// fire-and-forget IIFE must reach the destructive-block surface
		// (showErrorMessage under kernel-degraded mode).
		//
		// Post-CLOSE-02 (commit 5099b6ebd01) the waitUntil promise resolves rather than rejects
		// — the IIFE-driven destructive-block surface is the user-visible veto signal, not the
		// promise rejection. Asserts: listener fell through (waitUntilCalls.length === 1) and
		// resolved fulfilled (no _badListeners increment), kernel-degraded showErrorMessage
		// spy fires with the expected text.
		const target = path.join(workDir, 'migration.ts');
		const doc = makeMockDoc(target, {
			onDisk: 'const m = "";\n',
			inMemory: 'const m = "DROP TABLE x";\n',
		});
		const kernel = makeDisconnectedKernelStub();
		const { panel } = makePanelStub();
		saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

		const event = fireWillSaveTextDocument(doc, vscode.TextDocumentSaveReason.AfterDelay);
		const { gated, settledStatus } = await settleVeto(event);
		await drainMicrotasks();

		assert.equal(gated, true, 'AfterDelay destructive must fall through past the silent-tier early-return (pre-Plan-12-01 bypass closed)');
		assert.equal(settledStatus, 'fulfilled', 'waitUntil must resolve, not reject (CLOSE-02 _badListeners fix)');
		assert.ok(spy.calls.length >= 1, `expected showErrorMessage to surface; spy.calls=${spy.calls.length}`);
		const firstMessage = spy.calls[0][0] as string;
		assert.match(firstMessage, /destructive save blocked/i);
	});

	it('AfterDelay-silent-passes through without veto', async () => {
		// 12-01-02 — auto-save on a trivial (non-destructive, non-high-impact) change must
		// preserve the existing pass-through (CONTEXT.md Option B explicitly preserves
		// auto-save UX for silent-tier saves). The listener early-returns BEFORE calling
		// waitUntil, so event.waitUntilCalls.length === 0 and no showErrorMessage fires.
		const target = path.join(workDir, 'trivial.ts');
		const doc = makeMockDoc(target, {
			onDisk: 'const x = 0;\n',
			inMemory: 'const x = 1;\n',
		});
		const kernel = makeDisconnectedKernelStub();
		const { panel, recorder } = makePanelStub();
		saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

		const event = fireWillSaveTextDocument(doc, vscode.TextDocumentSaveReason.AfterDelay);
		const { gated } = await settleVeto(event);
		await drainMicrotasks();

		assert.equal(gated, false, 'silent-tier AfterDelay must pass through (no gate)');
		assert.equal(event.waitUntilCalls.length, 0, 'event.waitUntil must NOT be called for silent-tier non-Manual saves');
		assert.equal(spy.calls.length, 0, 'showErrorMessage must NOT surface for silent-tier saves');
		assert.equal(recorder.showAndAwaitCalls.length, 0, 'panel.showAndAwait must NOT be called for silent-tier saves');
	});

	it('FocusOut-high-impact opens modal', async () => {
		// 12-01-03 — TextDocumentSaveReason.FocusOut on a save against a file whose
		// fsPath contains a workspace-settings goatide.contracts.highImpactAllowlist
		// substring must fall through to the proposal flow regardless of reason.
		//
		// Under kernel-degraded + non-destructive the proposal lands in
		// handleKernelDegradedSave's non-destructive branch which writes the file directly
		// + queues a kernel_degraded Attempt. CRITICALLY, the veto still fires because the
		// canvas WOULD have shown the modal in connected mode — the bridge under degraded
		// mode trades the modal for an immediate write + queued replay. We assert: (a) the
		// veto fires (proves the listener fell through past the silent-tier early-return),
		// and (b) the queue has the kernel_degraded record (proves handleProposedSave ran).
		setWorkspaceConfigurationValue('goatide', 'contracts.highImpactAllowlist', [
			'/contracts/security/',
			'/contracts/api/',
			'/contracts/data/',
		]);
		// Build a path that contains '/contracts/security/' as a substring (rooted-with-/
		// normalization mirrors kernel/src/canvas/classifier.ts normalizeForMatch).
		const subdir = path.join(workDir, 'contracts', 'security');
		fs.mkdirSync(subdir, { recursive: true });
		const target = path.join(subdir, 'auth.md');
		const doc = makeMockDoc(target, {
			onDisk: '# Auth contract original\n',
			inMemory: '# Auth contract — edited paragraph\n',
		});
		const kernel = makeDisconnectedKernelStub();
		const { panel } = makePanelStub();
		saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

		const event = fireWillSaveTextDocument(doc, vscode.TextDocumentSaveReason.FocusOut);
		const { gated, settledStatus } = await settleVeto(event);
		await drainMicrotasks();

		assert.equal(gated, true, 'FocusOut on high-impact-citation path must fall through (gate fires regardless of reason)');
		assert.equal(settledStatus, 'fulfilled', 'waitUntil must resolve, not reject (CLOSE-02 _badListeners fix)');
		// Queue must hold a kernel_degraded record — proves handleProposedSave reached
		// handleKernelDegradedSave's non-destructive branch (the listener fell through past the
		// silent-tier early-return and the IIFE drained the full proposal chain).
		const records = await queue.readAll();
		assert.equal(records.length, 1, `expected one kernel_degraded record after high-impact non-destructive FocusOut save; got ${records.length}`);
		assert.equal(records[0].tier, 'kernel_degraded');
		assert.equal(records[0].target_path, target);
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
		const { gated, settledStatus } = await settleVeto(event);
		await drainMicrotasks();

		assert.equal(gated, true, 'Manual destructive must fall through past the silent-tier early-return (regression fence)');
		assert.equal(settledStatus, 'fulfilled', 'waitUntil must resolve, not reject (CLOSE-02 _badListeners fix)');
		assert.ok(spy.calls.length >= 1, `expected showErrorMessage to surface; spy.calls=${spy.calls.length}`);
		const firstMessage = spy.calls[0][0] as string;
		assert.match(firstMessage, /destructive save blocked/i);
	});
});
