/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/daemon/lockfile.ts — Phase 5 (Plan 05-02) atomic lockfile primitives.
//
// Race-free primitives for the kernel daemon's "I'm the one serving" advertisement. Used
// by startDaemon (kernel side) and by the bridge's reconnect-or-spawn flow (read-only
// subset duplicated under src/vs/goatide/extensions/goatide-bridge/src/kernel/lockfile-reader.ts
// per Plan 04-05 CJS↔ESM constraint).
//
// Pitfall 4 (RESEARCH): two concurrent IDE launches racing to write the same lockfile.
// atomicCreateLockfile uses fs.openSync(path, 'wx', 0o600) — O_CREAT|O_EXCL|O_WRONLY — so
// exactly one of the racing kernels creates the file; the loser sees EEXIST and decides
// whether to clear-stale + retry or exit.
//
// On POSIX the 0o600 mode bits constrain reads to the owning user; on Windows they are
// silently ignored (the file inherits parent ACL — same effective protection because
// %APPDATA%/goatide/ is per-user already).

import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LockfileContent {
	pid: number;
	rpc_port: number;
	auth_token: string;
	started_at: string;
	version: string;
	// Phase 21 XREPO-01 -- canonical realpath of the daemon's graph.db (single-DB WAL isolation fence).
	// Optional for backward compat: old lockfiles (pre-Phase-21) do not carry this field; the
	// dbPath-keyed fence in startDaemon guards via `existing.db_path &&` before comparing.
	db_path?: string;
}

/**
 * Best-effort signal-0 liveness probe. Throws ESRCH if pid is dead, EPERM if pid belongs
 * to another user (still alive). We treat both 'exists' outcomes as alive since EPERM
 * means the kernel is running under a different uid — extremely rare on a single-user
 * developer machine, but treating it as alive is the safer default (refuse to overwrite
 * someone else's lockfile).
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
 * Read + parse the lockfile. Returns null on missing file, corrupt JSON, or schema
 * mismatch — callers should treat null as "no daemon advertised; I should spawn one".
 */
export function readLockfile(path: string): LockfileContent | null {
	try {
		const raw = readFileSync(path, 'utf8');
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
 * Best-effort write. Atomic (creates parent dir, opens with 0o600, writes, closes).
 * Replaces an existing lockfile — caller must guarantee write-permission ordering;
 * atomicCreateLockfile is the racy-safe entry point.
 */
export function writeLockfile(path: string, content: LockfileContent): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(content, null, 2), { mode: 0o600 });
	// On some platforms writeFileSync's mode arg is honored only on file CREATE; chmod
	// after-write is a no-op on Windows and a defense for re-opens elsewhere.
	if (process.platform !== 'win32') {
		try {
			chmodSync(path, 0o600);
		} catch { /* best-effort */ }
	}
}

/**
 * Atomically create the lockfile or report 'exists'. NEVER overwrites — caller decides
 * the next move on 'exists' (read existing, isPidAlive, decide to clear+retry or exit).
 *
 * Uses fs.openSync with the 'wx' flag (O_CREAT|O_EXCL|O_WRONLY) so two concurrent kernel
 * processes racing to advertise themselves get exactly one 'created' result and one
 * 'exists' result — never both 'created'.
 */
export function atomicCreateLockfile(path: string, content: LockfileContent): 'created' | 'exists' {
	mkdirSync(dirname(path), { recursive: true });
	let fd: number;
	try {
		fd = openSync(path, 'wx', 0o600);
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code;
		if (code === 'EEXIST') {
			return 'exists';
		}
		throw e;
	}
	try {
		writeSync(fd, JSON.stringify(content, null, 2));
	} finally {
		closeSync(fd);
	}
	return 'created';
}

/**
 * Read the lockfile, check pid liveness, unlink iff dead. Used by both kernel daemon
 * startup ('I crashed last time; clear my own corpse') and bridge reconnect-or-spawn
 * ('lockfile points at a dead pid; spawn fresh').
 */
export function clearStaleLockfile(path: string): void {
	const lock = readLockfile(path);
	if (!lock) {
		// No lockfile or corrupt — nothing to clear (or remove the corpse).
		if (existsSync(path)) {
			try { unlinkSync(path); } catch { /* best-effort */ }
		}
		return;
	}
	if (!isPidAlive(lock.pid)) {
		try { unlinkSync(path); } catch { /* best-effort */ }
	}
}

/**
 * Lockfile size sanity (defense-in-depth — should never approach this in practice; the
 * payload is ~250 bytes). Exposed for future health-check tooling.
 */
export function lockfileSizeBytes(path: string): number | null {
	try {
		return statSync(path).size;
	} catch {
		return null;
	}
}
