/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/kernel/lockfile-reader.ts — Phase 5 (Plan 05-02).
//
// Bridge-side mirror of kernel/src/daemon/lockfile.ts read-path. The bridge ships as CJS;
// kernel/dist is ESM (Plan 04-05 constraint — TS 5.6 Node16 moduleResolution + the kernel's
// `"type": "module"` package.json setting prevent a static cross-format import). The
// shared shape is small enough that duplicating the read-only subset is cheaper than
// inventing a runtime dynamic-import bridge.
//
// LockfileContent shape MUST stay in lockstep with kernel/src/daemon/lockfile.ts.

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface LockfileContent {
	pid: number;
	rpc_port: number;
	auth_token: string;
	started_at: string;
	version: string;
}

/**
 * Resolve the platform-appropriate goatide config directory. Mirrors
 * kernel/src/daemon/paths.ts resolveGoatideConfigDir().
 */
export function resolveGoatideConfigDir(): string {
	const home = os.homedir();
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
		return path.join(appData, 'goatide');
	}
	const xdg = process.env.XDG_CONFIG_HOME;
	if (xdg && xdg.length > 0) {
		return path.join(xdg, 'goatide');
	}
	return path.join(home, '.config', 'goatide');
}

/**
 * Absolute path to the kernel daemon lockfile. The kernel writes; the bridge reads.
 * Test harnesses can override via the GOATIDE_LOCKFILE_PATH env var (used by both
 * kernel daemon mode and bridge reconnect-or-spawn).
 */
export function resolveLockfilePath(): string {
	const override = process.env.GOATIDE_LOCKFILE_PATH;
	if (override && override.length > 0) {
		return override;
	}
	return path.join(resolveGoatideConfigDir(), 'kernel.lock');
}

/**
 * Read + validate the lockfile. Returns null on missing/corrupt — caller treats null as
 * "no daemon advertised; spawn one".
 */
export function readLockfile(lockfilePath?: string): LockfileContent | null {
	const p = lockfilePath ?? resolveLockfilePath();
	try {
		const raw = readFileSync(p, 'utf8');
		const parsed = JSON.parse(raw) as Partial<LockfileContent>;
		if (
			typeof parsed.pid === 'number' &&
			typeof parsed.rpc_port === 'number' &&
			typeof parsed.auth_token === 'string' &&
			typeof parsed.started_at === 'string' &&
			typeof parsed.version === 'string'
		) {
			return parsed as LockfileContent;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Best-effort signal-0 liveness probe; works on POSIX + Windows (Node maps signal 0 to a
 * process-handle existence check on Windows).
 */
export function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code;
		if (code === 'ESRCH') {
			return false;
		}
		if (code === 'EPERM') {
			return true;
		}
		return false;
	}
}

/**
 * Remove the lockfile if its pid is dead; preserve it if alive. The bridge calls this
 * when its TCP-connect attempt times out against the lockfile's port — the daemon is
 * either gone or wedged, and a wedged daemon is the user's problem (the reconnect command
 * will surface it).
 */
export function clearStaleLockfile(lockfilePath?: string): void {
	const p = lockfilePath ?? resolveLockfilePath();
	const lock = readLockfile(p);
	if (!lock) {
		if (existsSync(p)) {
			try { unlinkSync(p); } catch { /* best-effort */ }
		}
		return;
	}
	if (!isPidAlive(lock.pid)) {
		try { unlinkSync(p); } catch { /* best-effort */ }
	}
}
