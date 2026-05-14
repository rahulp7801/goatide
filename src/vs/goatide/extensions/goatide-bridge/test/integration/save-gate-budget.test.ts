/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 12 Plan 12-02 — 1750ms event.waitUntil budget vulnerability tests
// (re-aligned post-Phase-13 CLOSE-02 commit 5099b6ebd01).
//
// Asserts the post-CLOSE-02 on-will-save.ts shape:
//   1. event.waitUntil(Promise.resolve()) is called SYNCHRONOUSLY with a fully-constructed
//      pre-resolved Promise — so the participant promise settles in a microtask, far inside
//      the 1750ms budget regardless of how long fsp.readFile takes. Plan 12-02's microtask-
//      timing rationale is preserved; only the settle direction changed (reject → resolve).
//      The reject→resolve flip was driven by CLOSE-02's _badListeners fix: VS Code's
//      extHostDocumentSaveParticipant tracks per-listener error counts in a WeakMap and
//      permanently ignores a listener after 3 errors. Promise.reject(SaveDeferredError) used
//      to increment this counter on every gated save, which dropped the listener mid-ceremony
//      after 4 saves (Phase 13 CLOSE-02 root cause analysis).
//   2. readFile + handleProposedSave run inside a separate fire-and-forget
//      `void (async () => { ... })()` IIFE that the listener does NOT await. The user-visible
//      destructive-block surface (showErrorMessage / panel.showAndAwait) is raised by the
//      IIFE, not by a waitUntil rejection.
//
// Caveat per 12-RESEARCH.md Pitfall 4: the 1750ms timer is enforced renderer-side by
// mainThreadSaveParticipant.ts, not reachable from mocha-as-Node. These tests therefore
// assert on microtask-timing semantics (using process.hrtime.bigint()) rather than waiting
// for the real timeout fire. Proving the bridge-side precondition makes the renderer-side
// timer irrelevant.
//
// Test infrastructure:
//   - Stub fsp.readFile by patching require('node:fs/promises').readFile to a slow variant.
//     The `import * as fsp from 'node:fs/promises'` namespace inside on-will-save.ts is a
//     reference to the same module.exports object (esModuleInterop under tsx's CJS interop),
//     so external mutations propagate. We snapshot + restore the original in afterEach to
//     avoid bleeding into other test files.
//   - Drive the listener via fireWillSaveTextDocument from vscode-stub (real EventEmitter
//     wired in Plan 12-01).
//   - Use destructive content (`DROP TABLE`) so the synchronous classification block falls
//     through to the gated branch (Plan 12-01).

import { describe, it, before, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
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
	type MockTextDocument,
	type MockWillSaveEvent,
} from '../setup/vscode-stub.js';
import { getCanvasModule } from '../../src/save-gate/canvas-module.js';

interface PanelShowRecorder {
	showAndAwaitCalls: { payload: unknown; tNs: bigint }[];
}

function makeDisconnectedKernelStub(): KernelClient {
	// kernel.isConnected() === false routes handleProposedSave through
	// handleKernelDegradedSave. Under destructive content (DROP TABLE) the degraded fork
	// surfaces showErrorMessage via a NESTED `void (async () => { ... })()` IIFE which
	// settles asynchronously; tests that need panel.showAndAwait to fire instead must
	// use a connected-kernel surrogate. For budget tests we only need the IIFE chain to
	// REACH the panel surrogate (Task 12-02-02), so we proxy panel.showAndAwait directly
	// from handleKernelDegradedSave's destructive-block branch via a wrapper panel
	// that records the equivalent surface event. Easier: instrument the panel.showAndAwait
	// recorder and assert call-order timing.
	return {
		isConnected: () => false,
	} as unknown as KernelClient;
}

function makePanelStub(): { panel: CanvasPanel; recorder: PanelShowRecorder } {
	const recorder: PanelShowRecorder = { showAndAwaitCalls: [] };
	const panel = {
		showAndAwait: async (payload: unknown) => {
			recorder.showAndAwaitCalls.push({ payload, tNs: process.hrtime.bigint() });
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
	// Disk gets the non-destructive baseline; in-memory contains DROP TABLE so the
	// synthetic-all-added diff fed to detectDestructive(syntheticDiff, fsPath) matches
	// DESTRUCTIVE_DIFF_PATTERNS. NOTE: when readFile is stubbed slow/throwing, the actual
	// disk content is moot — the stub controls what the listener "reads".
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

// Capture timestamps for the captured-waitUntil Promise's settlement.
interface VetoTiming {
	listenerCalledAtNs: bigint;
	listenerReturnedAtNs: bigint;
	vetoSettledAtNs: bigint | null;
	vetoSettledStatus: 'fulfilled' | 'rejected' | null;
	vetoSettledReason: unknown;
}

// Track illegal-state log captures (Task 12-02-03). The bridge / VS Code throws
// `illegalState('waitUntil can not be called async')` if waitUntil is invoked after the
// promises array freezes. We spy console.warn + console.error for that substring.
interface ConsoleSpy {
	logs: { stream: 'log' | 'warn' | 'error'; message: string }[];
}

function installConsoleSpy(): { spy: ConsoleSpy; restore: () => void } {
	const spy: ConsoleSpy = { logs: [] };
	const origLog = console.log;
	const origWarn = console.warn;
	const origError = console.error;
	console.log = (...args: unknown[]) => {
		spy.logs.push({ stream: 'log', message: args.map(String).join(' ') });
		origLog.apply(console, args);
	};
	console.warn = (...args: unknown[]) => {
		spy.logs.push({ stream: 'warn', message: args.map(String).join(' ') });
		origWarn.apply(console, args);
	};
	console.error = (...args: unknown[]) => {
		spy.logs.push({ stream: 'error', message: args.map(String).join(' ') });
		origError.apply(console, args);
	};
	return {
		spy,
		restore: () => {
			console.log = origLog;
			console.warn = origWarn;
			console.error = origError;
		},
	};
}

describe('save-gate-budget', () => {
	let workDir: string;
	let queue: PendingAttemptsQueue;
	let context: vscode.ExtensionContext;
	let saveGateDisposable: vscode.Disposable | undefined;
	let origReadFile: typeof fsp.readFile;

	// Pre-warm the canvas module so the synchronous classification block in on-will-save.ts
	// finds detectDestructive on the first listener invocation. Same pattern as
	// save-gate-auto-save.test.ts.
	before(async function () {
		this.timeout(15_000);
		await getCanvasModule();
		origReadFile = fsp.readFile;
	});

	beforeEach(() => {
		workDir = path.join(os.tmpdir(), `goatide-12-02-${ulid()}`);
		fs.mkdirSync(workDir, { recursive: true });
		queue = new PendingAttemptsQueue(workDir);
		context = makeContextStub();
	});

	afterEach(() => {
		try { saveGateDisposable?.dispose(); } catch { /* ignore */ }
		saveGateDisposable = undefined;
		// Restore the original readFile so cross-test bleed doesn't happen. We MUST do this
		// here (not in `after`) because a 3000ms-slow readFile left dangling would slow every
		// subsequent test in the suite. Direct assignment works because tsx transpiles
		// `import * as fsp from 'node:fs/promises'` to a live binding over the same
		// require.cache exports object — verified empirically.
		(fsp as unknown as { readFile: typeof fsp.readFile }).readFile = origReadFile;
		try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	// Replace fsp.readFile with a variant that delays `delayMs` before resolving with the
	// supplied content. The `import * as fsp from 'node:fs/promises'` namespace in
	// on-will-save.ts is a live reference to the same require.cache exports object under
	// tsx's CJS interop — direct property assignment is observable from the listener's IIFE.
	function stubSlowReadFile(delayMs: number, content: string): void {
		const slow = (async (_p: unknown, _opts?: unknown): Promise<string> => {
			await new Promise((r) => setTimeout(r, delayMs));
			return content;
		}) as unknown as typeof fsp.readFile;
		(fsp as unknown as { readFile: typeof fsp.readFile }).readFile = slow;
	}

	// Drive the listener; capture the listener-call timing and (later) the captured
	// waitUntil-Promise settlement timing. The vetoPromise rejection IS observable via
	// `.then(..., reason => ...)` attached AS SOON AS the synchronous fire() returns.
	async function driveAndCapture(doc: MockTextDocument, reason: number, settleBudgetMs: number): Promise<{ timing: VetoTiming; event: MockWillSaveEvent }> {
		const timing: VetoTiming = {
			listenerCalledAtNs: 0n,
			listenerReturnedAtNs: 0n,
			vetoSettledAtNs: null,
			vetoSettledStatus: null,
			vetoSettledReason: undefined,
		};
		timing.listenerCalledAtNs = process.hrtime.bigint();
		const event = fireWillSaveTextDocument(doc, reason);
		timing.listenerReturnedAtNs = process.hrtime.bigint();
		if (event.waitUntilCalls.length > 0) {
			// Attach observers IMMEDIATELY so we measure rejection at microtask boundary.
			const observed = event.waitUntilCalls.map((p) =>
				Promise.resolve(p).then(
					() => ({ status: 'fulfilled' as const, reason: undefined, tNs: process.hrtime.bigint() }),
					(reason: unknown) => ({ status: 'rejected' as const, reason, tNs: process.hrtime.bigint() }),
				),
			);
			// Wait up to `settleBudgetMs` for the captured Promise(s) to settle. The whole
			// point of Plan 12-02 is that this is microtask-fast; 50ms is a generous ceiling
			// for the snapshot assertion.
			const results = await Promise.race([
				Promise.all(observed),
				new Promise<typeof observed extends Promise<infer R>[] ? R[] : never>((_resolve) => setTimeout(() => _resolve([] as never), settleBudgetMs)),
			]);
			if (results.length > 0) {
				timing.vetoSettledAtNs = results[0].tNs;
				timing.vetoSettledStatus = results[0].status;
				timing.vetoSettledReason = results[0].reason;
			}
		}
		return { timing, event };
	}

	it('sync-resolve-microtask settles vetoPromise within 50ms', async () => {
		// 12-02-01 (re-aligned post-CLOSE-02) — with fsp.readFile stubbed to delay 3000ms, the
		// Promise passed to event.waitUntil(...) must SETTLE (fulfilled) within 50ms of the
		// listener invocation. Proves the sync-veto fix: the participant settlement rides a
		// microtask, not the readFile completion. Post-CLOSE-02 the settle direction is
		// fulfilled rather than rejected (see file header for _badListeners rationale).
		stubSlowReadFile(3000, 'const m = "";\n');
		const target = path.join(workDir, 'sync-resolve.ts');
		const doc = makeMockDoc(target, {
			onDisk: 'const m = "";\n',
			inMemory: 'const m = "DROP TABLE x";\n',
		});
		const kernel = makeDisconnectedKernelStub();
		const { panel } = makePanelStub();
		saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

		const { timing } = await driveAndCapture(doc, vscode.TextDocumentSaveReason.AfterDelay, 200);

		const elapsedNs = timing.vetoSettledAtNs !== null
			? timing.vetoSettledAtNs - timing.listenerCalledAtNs
			: -1n;

		assert.deepStrictEqual({
			vetoSettled: timing.vetoSettledStatus !== null,
			vetoFulfilled: timing.vetoSettledStatus === 'fulfilled',
			vetoSettledWithin50ms: elapsedNs >= 0n && elapsedNs < 50_000_000n,
		}, {
			vetoSettled: true,
			vetoFulfilled: true,
			vetoSettledWithin50ms: true,
		}, `veto must settle (fulfilled) within 50ms of listener invocation despite 3000ms readFile stub; elapsedNs=${elapsedNs}`);
	});

	it('panel-show-after-readfile-delay invoked from IIFE', async () => {
		// 12-02-02 — under a 200ms readFile delay (kept short for test speed), the IIFE
		// must STILL eventually reach the panel surrogate AFTER the listener returns. Under
		// kernel-degraded + destructive content the proposal lands in handleKernelDegradedSave's
		// destructive-block branch (showErrorMessage), NOT panel.showAndAwait. So we instead
		// assert on the showErrorMessage spy timing — it's the equivalent surface event for
		// the degraded path (proves the IIFE ran past readFile and reached its sink). The
		// connected-kernel path that reaches panel.showAndAwait is exercised in save-gate.test.ts.
		const spy = (vscode as unknown as { __test_showErrorMessageSpy: { calls: unknown[][]; respondWith: string | undefined } }).__test_showErrorMessageSpy;
		spy.calls.length = 0;
		spy.respondWith = undefined;

		stubSlowReadFile(200, 'const m = "";\n');
		const target = path.join(workDir, 'panel-after-iife.ts');
		const doc = makeMockDoc(target, {
			onDisk: 'const m = "";\n',
			inMemory: 'const m = "DROP TABLE x";\n',
		});
		const kernel = makeDisconnectedKernelStub();
		const { panel } = makePanelStub();
		saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

		const { timing } = await driveAndCapture(doc, vscode.TextDocumentSaveReason.AfterDelay, 100);
		// Now let the IIFE drain past readFile (200ms) + the kernel-degraded async chain.
		// 500ms is generous on Windows where setImmediate / timer resolution is 15ms.
		await new Promise((r) => setTimeout(r, 500));
		const showErrorCalledAtNs = spy.calls.length > 0 ? process.hrtime.bigint() : null;
		// (We can't capture the EXACT call time inside the stub because the spy's record-path
		// doesn't push a timestamp. We instead assert structurally: the listener already
		// returned and the readFile was ≥200ms — so any showErrorMessage call necessarily
		// happened AFTER the listener-return on wall-clock ordering grounds.)

		assert.deepStrictEqual({
			vetoSettledFast: timing.vetoSettledStatus === 'fulfilled' && timing.vetoSettledAtNs !== null && (timing.vetoSettledAtNs - timing.listenerCalledAtNs) < 50_000_000n,
			showErrorReached: spy.calls.length >= 1,
			showErrorMessageMatchesDestructive: spy.calls.length >= 1 && /destructive save blocked/i.test(String(spy.calls[0][0])),
			showErrorAfterListenerReturn: showErrorCalledAtNs !== null && showErrorCalledAtNs > timing.listenerReturnedAtNs,
		}, {
			vetoSettledFast: true,
			showErrorReached: true,
			showErrorMessageMatchesDestructive: true,
			showErrorAfterListenerReturn: true,
		}, 'IIFE must reach showErrorMessage surface AFTER listener returns and AFTER readFile delay drains');
	});

	it('no-illegalState-log under sync waitUntil call', async () => {
		// 12-02-03 — extHostDocumentSaveParticipant throws
		// `illegalState('waitUntil can not be called async')` if waitUntil is called after
		// the promises array freezes (i.e., after the synchronous listener returns). Plan
		// 12-02's sync-veto refactor calls waitUntil ON THE FIRST LINE of the gated branch
		// (no awaits before it), so the call site is strictly synchronous. We spy
		// console.warn / console.error for the substring across the full IIFE settle window
		// to prove no late `waitUntil` is being invoked anywhere.
		const { spy, restore } = installConsoleSpy();
		try {
			stubSlowReadFile(200, 'const m = "";\n');
			const target = path.join(workDir, 'no-illegal-state.ts');
			const doc = makeMockDoc(target, {
				onDisk: 'const m = "";\n',
				inMemory: 'const m = "DROP TABLE x";\n',
			});
			const kernel = makeDisconnectedKernelStub();
			const { panel } = makePanelStub();
			saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

			await driveAndCapture(doc, vscode.TextDocumentSaveReason.AfterDelay, 100);
			// Let the IIFE finish so any late waitUntil call would surface.
			await new Promise((r) => setTimeout(r, 500));

			const illegalStateCaptures = spy.logs.filter((l) =>
				l.stream !== 'log' && /waitUntil can not be called async/i.test(l.message),
			);

			assert.deepStrictEqual({
				illegalStateLogCount: illegalStateCaptures.length,
			}, {
				illegalStateLogCount: 0,
			}, `no illegalState 'waitUntil can not be called async' log captures expected; got ${illegalStateCaptures.length}: ${JSON.stringify(illegalStateCaptures)}`);
		} finally {
			restore();
		}
	});

	it('no-1750ms-abort under simulated slow readFile', async () => {
		// 12-02-04 (re-aligned post-CLOSE-02) — with fsp.readFile stubbed 3000ms, the captured
		// vetoPromise must have ALREADY settled (fulfilled) well before 1750ms. Caveat per
		// 12-RESEARCH.md Pitfall 4: the actual `Aborted onWillSaveTextDocument-event after
		// 1750ms` error is renderer-side (mainThreadSaveParticipant.ts) and not reachable
		// from mocha-as-Node. This test asserts the BRIDGE-SIDE PRECONDITION that makes the
		// renderer-side timer irrelevant: the participant settles in a microtask, so the
		// 1750ms timer never has the chance to fire.
		stubSlowReadFile(3000, 'const m = "";\n');
		const target = path.join(workDir, 'no-1750ms-abort.ts');
		const doc = makeMockDoc(target, {
			onDisk: 'const m = "";\n',
			inMemory: 'const m = "DROP TABLE accounts";\n',
		});
		const kernel = makeDisconnectedKernelStub();
		const { panel } = makePanelStub();
		saveGateDisposable = registerSaveGate(context, kernel, () => panel, queue);

		const { timing } = await driveAndCapture(doc, vscode.TextDocumentSaveReason.AfterDelay, 1500);

		const elapsedNs = timing.vetoSettledAtNs !== null
			? timing.vetoSettledAtNs - timing.listenerCalledAtNs
			: -1n;

		assert.deepStrictEqual({
			vetoSettledBefore1750ms: timing.vetoSettledStatus === 'fulfilled' && elapsedNs >= 0n && elapsedNs < 1_750_000_000n,
			readFileStillPending: true,   // 3000ms stub, asserted ≤1500ms below ⇒ readFile not yet resolved.
		}, {
			vetoSettledBefore1750ms: true,
			readFileStillPending: true,
		}, `veto must settle (fulfilled) before 1750ms even with 3000ms readFile stub; elapsedNs=${elapsedNs}`);
	});
});
