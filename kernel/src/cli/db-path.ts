/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/db-path.ts — Phase 2 (Plan 02-04) DB-path resolver.
//
// Owns the (override?: string) -> absolute-path translation, including the parent-dir
// mkdir step. Kept as its own module so unit tests verify path/mkdir behavior in
// isolation (without spawning the CLI).
//
// Per 02-RESEARCH.md ## Open Questions #2:
//   - Linux:   $XDG_DATA_HOME/goatide/graph.db, fallback ~/.local/share/goatide/graph.db
//   - macOS:   ~/Library/Application Support/goatide/graph.db
//   - Windows: %APPDATA%/goatide/graph.db (process.env.APPDATA + '/goatide/graph.db')
//   - All three respect a --db <path> override.

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Resolve where the GoatIDE graph DB lives. CLI override > XDG > platform default.
 * Always creates the parent directory (`mkdir -p`-style) so callers can immediately
 * pass the result to better-sqlite3.
 *
 * @param override Optional CLI --db flag value. May be relative or absolute.
 * @returns        Absolute filesystem path to the SQLite DB file.
 */
export function resolveDbPath(override?: string): string {
	if (override) {
		const abs = path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		return abs;
	}
	const platform = process.platform;
	const home = os.homedir();
	let base: string;
	if (platform === 'win32') {
		base = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
	} else if (platform === 'darwin') {
		base = path.join(home, 'Library', 'Application Support');
	} else {
		base = process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
	}
	const dir = path.join(base, 'goatide');
	fs.mkdirSync(dir, { recursive: true });
	return path.join(dir, 'graph.db');
}
