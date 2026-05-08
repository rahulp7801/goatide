/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Per RESEARCH.md ## Validation Architecture: real on-disk SQLite per test, mkdtempSync +
// cleanup, no mocks. Wave 1+ specs import mkTempDb to get an isolated DB path.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

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
/**
 * Run drizzle-kit migrate() with better-sqlite3's unsafeMode flag flipped on.
 *
 * Phase 7 Plan 07-01 (Pitfall 3): migration 0006_protects_edge_kind.sql uses
 * `PRAGMA writable_schema = 1` + `UPDATE sqlite_master SET sql = replace(...)` to extend
 * the edges_kind_allowlist CHECK constraint with 'protects'. better-sqlite3 guards
 * UPDATE on sqlite_master behind an unsafeMode flag; flip it before migrate() and back
 * after, scoped to the migration window. See kernel/src/graph/db.ts for the production
 * code path; specs that bypass openDatabase (raw migrate() callsites) must use this helper
 * to avoid the "table sqlite_master may not be modified" error.
 */
export function migrateInUnsafeMode(sqlite: Database.Database, db: BetterSQLite3Database, migrationsFolder: string): void {
	sqlite.unsafeMode(true);
	try {
		migrate(db, { migrationsFolder });
	} finally {
		sqlite.unsafeMode(false);
	}
}

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
