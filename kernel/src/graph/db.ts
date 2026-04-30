// kernel/src/graph/db.ts — Phase 2 (Plan 02-02) connection bootstrap.
//
// Per 02-RESEARCH.md ## Pattern: PRAGMA Bootstrap.
// Opens a better-sqlite3 connection at the given path, applies the seven session
// PRAGMAs locked in 02-RESEARCH.md ## Standard Stack, runs drizzle-kit migrations
// (0000_init.sql + 0001_triggers.sql), and returns both the Drizzle handle (for
// type-safe queries from the DAO in Wave 2) and the raw better-sqlite3 handle (for
// tests that need to bypass the DAO and assert structural invariants).
//
// Idempotent: calling openDatabase against an already-migrated DB re-applies PRAGMAs
// (cheap; per-connection) and runs migrations (drizzle's __drizzle_migrations skips
// already-applied migrations).

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface OpenDatabaseHandle {
	db: BetterSQLite3Database;
	sqlite: Database.Database;
	/** Close the underlying connection. */
	close(): void;
}

/**
 * Open a SQLite connection at `dbPath`, apply session PRAGMAs (per GRAPH-11),
 * and run migrations (per GRAPH-09).
 *
 * @param dbPath  Absolute or relative path to the SQLite file. Created if missing.
 * @returns       { db, sqlite, close } — Drizzle handle, raw handle, and a close() helper.
 */
export function openDatabase(dbPath: string): OpenDatabaseHandle {
	const sqlite = new Database(dbPath);

	// GRAPH-11: tuned PRAGMAs for read-heavy traversal workloads.
	// (a) journal_mode=WAL is persistent (modifies file header) but harmless to re-state.
	// (b) foreign_keys is per-connection and CRITICAL (off by default — Pitfall 1).
	// (c) cache_size, mmap_size, busy_timeout, temp_store, synchronous are session-scoped.
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('cache_size = -64000');         // 64 MB (negative = KiB)
	sqlite.pragma('mmap_size = 268435456');       // 256 MB
	sqlite.pragma('foreign_keys = ON');           // Pitfall 1
	sqlite.pragma('temp_store = MEMORY');

	const db = drizzle(sqlite);

	// Resolve the migrations folder relative to this source file. Under ESM (kernel/package.json
	// declares "type": "module" and tsconfig sets module: Node16), `__dirname` is unavailable;
	// `import.meta.url` is the canonical path. vitest+tsx executes the source directly so
	// `here` resolves to kernel/src/graph/ — `migrations/` lives alongside.
	//
	// Wave-3 build-script note (Plan 02-04 owns this): `tsc -p .` doesn't copy non-.ts files,
	// so `dist/graph/migrations/` won't exist after build until the package.json build script
	// is extended to copy migrations/. Wave 1 only runs against src/ via vitest+tsx, so this
	// works today; Wave 3 picks up the dist-side fix.
	const here = path.dirname(fileURLToPath(import.meta.url));
	const migrationsFolder = path.join(here, 'migrations');
	migrate(db, { migrationsFolder });

	return {
		db,
		sqlite,
		close: () => sqlite.close(),
	};
}
