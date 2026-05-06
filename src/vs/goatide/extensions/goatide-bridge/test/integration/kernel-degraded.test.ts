/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Integration tests for CANV-10 — kernel-degraded mode (Plan 04-06).
//
// Drives:
//   1. HeartbeatPoller transitions ConnectionStateMachine to 'degraded' after the miss
//      threshold elapses with no successful heartbeat (test uses tight 100ms / 300ms
//      thresholds + a kernel that's been disposed).
//   2. PendingAttemptsQueue.appendAttempt + drainAll round-trip via real spawned kernel.
//   3. handleKernelDegradedSave non-destructive: writes file + appends queue.
//   4. handleKernelDegradedSave destructive: refuses + does NOT write file or queue.
//
// Like save-gate.test.ts, this spec spawns kernel/dist/main.js as a real child process
// against a temp SQLite DB. Plan 04-07 phase-verify wires the host-launch end-to-end.

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ulid } from 'ulid';
import { KernelClient } from '../../src/kernel/client.js';
import { ConnectionStateMachine } from '../../src/kernel/connection-state.js';
import { HeartbeatPoller } from '../../src/kernel/heartbeat.js';
import { PendingAttemptsQueue, type PendingAttemptRecord } from '../../src/save-gate/pending-attempts.js';
import { handleKernelDegradedSave } from '../../src/save-gate/on-will-save.js';

// kernel/dist/main.js — relative to this test file in the bridge package.
// Layout: <fork-root>/src/vs/goatide/extensions/goatide-bridge/test/integration/kernel-degraded.test.ts
// Kernel:  <fork-root>/kernel/dist/main.js — 7 levels up
const KERNEL_MAIN = path.resolve(__dirname, '../../../../../../../kernel/dist/main.js');

interface VscodeTestStub {
	__test_showErrorMessageSpy: { calls: unknown[][]; respondWith: string | undefined };
}

describe('CANV-10 — kernel-degraded banner + bypass + block (Plan 04-06)', () => {
	let dbPath: string;
	let workDir: string;

	before(function () {
		assert.ok(fs.existsSync(KERNEL_MAIN), `kernel main missing at ${KERNEL_MAIN} (run npm --prefix ../../../../../../../kernel run build first)`);
		dbPath = path.join(os.tmpdir(), `goatide-degraded-${ulid()}.db`);
		workDir = path.join(os.tmpdir(), `goatide-degraded-work-${ulid()}`);
		fs.mkdirSync(workDir, { recursive: true });
	});

	after(async function () {
		this.timeout(10_000);
		await new Promise((r) => setTimeout(r, 200));
		try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
		try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
	});

	it('CANV-10 — HeartbeatPoller transitions state to degraded after missed heartbeats', async function () {
		this.timeout(10_000);
		// Spin up a real kernel, then dispose it (kills the proc + closes the connection)
		// so heartbeat() rejects on every tick. With intervalMs=100 + missThresholdMs=300,
		// the third missed beat (~300ms after the last success) should trip the degraded
		// transition.
		const kernel = new KernelClient({ requestTimeoutMs: 1_000 });
		await kernel.connect(KERNEL_MAIN, dbPath);
		assert.equal(kernel.isConnected(), true, 'kernel should be connected after connect()');

		// The state machine fires a 'crashed' transition synchronously when proc.kill
		// landing — but for THIS test we want to verify the heartbeat-miss path (the
		// hung-but-alive failure mode). We'll reach into the state machine after dispose()
		// flips us to degraded { reason: 'crashed' } and reset to 'connected' so the
		// poller can drive the heartbeat-miss transition.
		const poller = new HeartbeatPoller(kernel, kernel.state, { intervalMs: 100, missThresholdMs: 300 });

		// Capture state transitions for snapshot assertion.
		const transitions: string[] = [];
		const sub = kernel.state.onDidChangeState((s) => {
			if (s.kind === 'degraded') {
				transitions.push(`degraded:${s.reason}`);
			} else {
				transitions.push(s.kind);
			}
		});

		// Dispose the kernel — proc.kill('SIGTERM') fires the exit handler which transitions
		// to degraded { reason: 'crashed' }. Reset to 'connected' so the poller is the one
		// that drives the next transition.
		kernel.dispose();
		await new Promise((r) => setTimeout(r, 100));
		// Re-create a fresh state machine so the disposed one's emitter doesn't cause issues.
		// We use an isolated state + a stub kernel whose heartbeat always rejects.
		const isolatedState = new ConnectionStateMachine();
		isolatedState.transition({ kind: 'connected', lastHeartbeatMs: Date.now() });
		const stubKernel = {
			heartbeat: async (): Promise<never> => {
				throw new Error('connection closed');
			},
		} as unknown as KernelClient;
		const isolatedTransitions: string[] = [];
		isolatedState.onDidChangeState((s) => {
			if (s.kind === 'degraded') {
				isolatedTransitions.push(`degraded:${s.reason}`);
			} else {
				isolatedTransitions.push(s.kind);
			}
		});
		const isolatedPoller = new HeartbeatPoller(stubKernel, isolatedState, { intervalMs: 50, missThresholdMs: 200 });
		isolatedPoller.start();
		// Wait for the miss threshold + a few ticks.
		await new Promise((r) => setTimeout(r, 500));
		isolatedPoller.stop();
		sub.dispose();
		poller.stop();

		// Snapshot: the isolated state should have transitioned to degraded with
		// reason 'heartbeat_miss'.
		assert.deepStrictEqual(
			isolatedTransitions.includes('degraded:heartbeat_miss'),
			true,
			`expected degraded:heartbeat_miss in transitions; got: ${JSON.stringify(isolatedTransitions)}`,
		);
		assert.equal(isolatedState.isDegraded(), true);
	});

	it('CANV-10 — PendingAttemptsQueue.appendAttempt + drainAll round-trip via real kernel', async function () {
		this.timeout(15_000);
		const queueDir = path.join(workDir, `queue-${ulid()}`);
		fs.mkdirSync(queueDir, { recursive: true });
		const queue = new PendingAttemptsQueue(queueDir);

		// Append a record while the kernel is "down" (no kernel needed for append).
		const target = path.join(queueDir, 'queued.ts');
		fs.writeFileSync(target, 'const a = 1;', 'utf8');
		const record: PendingAttemptRecord = {
			staging_path: null,
			target_path: target,
			change_id: ulid(),
			receipt_id: null,
			tier: 'kernel_degraded',
			accept_latency_ms: 0,
			body: `kernel-degraded save of ${target}`,
			anchor: { file: target },
			queued_at: new Date().toISOString(),
		};
		await queue.appendAttempt(record);
		assert.ok(fs.existsSync(queue.path), 'queue file should exist after appendAttempt');

		// readAll should return exactly the record we appended.
		const recovered = await queue.readAll();
		assert.equal(recovered.length, 1);
		assert.equal(recovered[0].change_id, record.change_id);
		assert.equal(recovered[0].tier, 'kernel_degraded');

		// Spawn a kernel + drain the queue. The drain replays via kernel.atomicAccept.
		const kernel = new KernelClient({ requestTimeoutMs: 10_000 });
		await kernel.connect(KERNEL_MAIN, dbPath);
		try {
			const report = await queue.drainAll(kernel);
			assert.equal(report.total, 1, 'drain total should be 1');
			assert.equal(report.drained, 1, 'drain drained should be 1');
			assert.equal(report.failed, 0, 'drain failed should be 0');
			assert.equal(fs.existsSync(queue.path), false, 'queue file should be removed after full-success drain');
		} finally {
			kernel.dispose();
		}
	});

	it('CANV-10 — handleKernelDegradedSave non-destructive: writes file + queues kernel_degraded Attempt', async function () {
		this.timeout(5_000);
		const target = path.join(workDir, `nondestructive-${ulid()}.ts`);
		fs.writeFileSync(target, 'const before = 1;\n', 'utf8');

		const queueDir = path.join(workDir, `queue-nd-${ulid()}`);
		fs.mkdirSync(queueDir, { recursive: true });
		const queue = new PendingAttemptsQueue(queueDir);

		const result = await handleKernelDegradedSave(
			{ uri: { fsPath: target, toString: () => `file://${target}` } },
			'const before = 1;\n',
			'const before = 1;\nconst after = 2;\n',
			queue,
		);
		assert.equal(result, 'queued');
		assert.equal(fs.readFileSync(target, 'utf8'), 'const before = 1;\nconst after = 2;\n', 'file should be written directly');
		const records = await queue.readAll();
		assert.equal(records.length, 1, 'queue should have exactly one record');
		assert.equal(records[0].tier, 'kernel_degraded');
		assert.equal(records[0].target_path, target);
		assert.equal(records[0].staging_path, null);
		assert.equal(records[0].receipt_id, null);
	});

	it('CANV-10 — handleKernelDegradedSave destructive: blocks via showErrorMessage + does NOT write file or queue', async function () {
		this.timeout(5_000);
		// Use a destructive diff path (.env) that detectDestructive will catch via the
		// path-pattern arm regardless of body content. This is robust against the diff-body
		// arm if future regex tightens.
		const target = path.join(workDir, `.env`);
		const before = 'OLD_KEY=old\n';
		const after = 'NEW_KEY=new\n';
		fs.writeFileSync(target, before, 'utf8');

		const queueDir = path.join(workDir, `queue-d-${ulid()}`);
		fs.mkdirSync(queueDir, { recursive: true });
		const queue = new PendingAttemptsQueue(queueDir);

		// Reset the showErrorMessage spy.
		const spy = (vscode as unknown as VscodeTestStub).__test_showErrorMessageSpy;
		spy.calls.length = 0;
		spy.respondWith = undefined;

		const result = await handleKernelDegradedSave(
			{ uri: { fsPath: target, toString: () => `file://${target}` } },
			before,
			after,
			queue,
		);
		// Allow the fire-and-forget showErrorMessage IIFE a microtask to run.
		await new Promise((r) => setTimeout(r, 20));

		assert.equal(result, 'blocked');
		assert.equal(fs.readFileSync(target, 'utf8'), before, 'file must NOT be overwritten on destructive block');
		assert.equal(fs.existsSync(queue.path), false, 'queue file must NOT be created on destructive block');
		assert.ok(spy.calls.length >= 1, 'showErrorMessage should have been called at least once');
		const firstCallMessage = spy.calls[0][0] as string;
		assert.match(firstCallMessage, /destructive save blocked/i);
	});
});
