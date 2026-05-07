/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/daemon/paths.ts — Phase 5 (Plan 05-02) platform-aware lockfile + config-dir
// resolver.
//
// Single source of truth for the goatide config directory. resolveDbPath() in
// kernel/src/cli/db-path.ts uses ./goatide as a sibling under platform-app-data; this module
// owns the equivalent for the daemon lockfile so both files stay in lockstep.
//
// Linux:   $XDG_CONFIG_HOME/goatide/  (fallback ~/.config/goatide/)
// macOS:   ~/.config/goatide/         (per Phase-5 RESEARCH ## Pattern: Kernel Daemonization;
//                                       config-XDG-style on macOS keeps the lockfile colocated
//                                       with shells/editors rather than buried under
//                                       Library/Application Support)
// Windows: %APPDATA%/goatide/

import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Resolve the platform-appropriate goatide config directory. Does NOT mkdir — caller is
 * responsible for creating the directory before writing into it (atomicCreateLockfile does
 * its own mkdir).
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
 * Absolute path to the kernel daemon lockfile. Created atomically by startDaemon() and
 * read by both kernel (own-cleanup) and bridge (reconnect-or-spawn).
 */
export function resolveLockfilePath(): string {
	return path.join(resolveGoatideConfigDir(), 'kernel.lock');
}
