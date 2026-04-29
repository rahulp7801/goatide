// src/vs/goatide/main/spawn-kernel.ts — kernel-supervisor module (Phase-1 stub).
// Per STATE.md ## Decisions: sidecar Node daemon spawned by Electron main on app ready.
// Phase 1: spawn + shutdown only. No restart-on-crash, no JSON-RPC handshake (Phase 2+).
// Source pattern: 01-RESEARCH.md ## Architecture Patterns §"Pattern 2: Kernel-Spawn Hook
// in Electron Main".
//
// FORK-04 invariant: this file lives at src/vs/goatide/main/spawn-kernel.ts — inside
// the allowlisted src/vs/goatide/** subtree. The single allowlisted edit in src/vs/code/**
// is the call site in src/vs/code/electron-main/app.ts (Plan 01-04 Task 4); ALL spawn
// logic lives here so monthly upstream-syncs see only the ≤30-line app.ts call site as
// "GoatIDE-authored".
//
// The .js extension on the import string in app.ts is required by upstream's Node16
// module resolution (NodeNext-style). Keep this file path stable.

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

let kernelProc: ChildProcess | undefined;

/**
 * Spawn the GoatIDE kernel sidecar.
 *
 * @param appRoot - Repo / build root. Must contain `kernel/dist/main.js`.
 *
 * Idempotent: re-calling while the kernel is alive is a no-op.
 *
 * Phase 1: pipes kernel stdout/stderr to the Electron main process console
 * via console.log/console.error so a developer running `npm run start` can
 * see `[kernel] up`.
 *
 * Phase 2+: replace with structured JSON-RPC handshake; add restart-on-crash
 * supervisor with backoff (Plan 04-NN or similar).
 */
export function spawnKernel(appRoot: string): void {
	if (kernelProc) {
		console.log('[goatide:spawn-kernel] kernel already running, skipping');
		return;
	}
	const kernelEntry = path.join(appRoot, 'kernel', 'dist', 'main.js');
	console.log(`[goatide:spawn-kernel] spawning kernel from ${kernelEntry}`);
	kernelProc = spawn(process.execPath, [kernelEntry], {
		stdio: ['ignore', 'pipe', 'pipe'],
		// ELECTRON_RUN_AS_NODE=1 makes the Electron binary behave as plain Node so
		// the kernel runs in pure-Node context (no Electron renderer/main APIs leak
		// into the kernel surface). Source: electronjs.org/docs §"using-native-node-modules".
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		detached: false,
	});
	kernelProc.stdout?.on('data', (b: Buffer) =>
		console.log('[kernel]', b.toString().trim())
	);
	kernelProc.stderr?.on('data', (b: Buffer) =>
		console.error('[kernel-err]', b.toString().trim())
	);
	kernelProc.on('exit', (code, signal) => {
		console.warn(
			`[goatide:spawn-kernel] kernel exited code=${code} signal=${signal}`
		);
		kernelProc = undefined;
		// Phase 1 does not restart-on-crash; Phase 4+ will add a supervisor with backoff.
	});
	kernelProc.on('error', (err) => {
		console.error('[goatide:spawn-kernel] kernel spawn error:', err);
		kernelProc = undefined;
	});
}

/**
 * Send SIGTERM to the kernel and resolve when it exits.
 * Returns immediately if the kernel is not running.
 *
 * Wired into Electron's `before-quit` handler in app.ts (Plan 01-04 Task 4).
 * Uses `void` at the call site — Electron is mid-shutdown, no need to await.
 */
export function shutdownKernel(): Promise<void> {
	return new Promise((resolve) => {
		if (!kernelProc) {
			resolve();
			return;
		}
		const proc = kernelProc;
		proc.once('exit', () => resolve());
		try {
			proc.kill('SIGTERM');
		} catch {
			// Already dead; resolve immediately.
			resolve();
		}
	});
}

/** Test-only: returns true iff the kernel process handle is currently set. */
export function isKernelRunning(): boolean {
	return kernelProc !== undefined;
}
