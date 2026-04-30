/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Per RESEARCH.md ## Validation Architecture: real on-disk SQLite per test, mkdtempSync +
// cleanup, no mocks. Wave 1+ specs import mkTempDb to get an isolated DB path.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TempDb {
	/** Absolute path to the SQLite file. Pass to better-sqlite3 / drizzle-kit migrate. */
	dbPath: string;
	/** Absolute path to the temp directory containing the SQLite file. */
	dir: string;
	/** Recursively remove the temp directory. Safe to call multiple times. */
	dispose(): void;
}

/**
 * Create a fresh temp directory + SQLite file path for one test.
 *
 * Usage:
 *   let tmp: TempDb;
 *   beforeEach(() => { tmp = mkTempDb(); });
 *   afterEach(() => { tmp.dispose(); });
 *
 * The returned dbPath does NOT exist on disk yet — better-sqlite3 creates it on
 * `new Database(dbPath)`.
 */
export function mkTempDb(): TempDb {
	const dir = mkdtempSync(join(tmpdir(), 'goatide-graph-'));
	const dbPath = join(dir, 'graph.db');
	let disposed = false;
	return {
		dbPath,
		dir,
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// Best-effort cleanup; Windows may briefly hold file handles.
			}
		},
	};
}
