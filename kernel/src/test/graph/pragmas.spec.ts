/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/pragmas.spec.ts — Plan 02-02 Task 3.
// Asserts that openDatabase applies the seven session PRAGMAs (GRAPH-11) and that
// they read back at the expected values. Per CLAUDE.md ## Learnings, snapshot all
// seven settings in one toEqual to keep the test single-purpose.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase } from '../../graph/db.js';

describe('PRAGMAs (GRAPH-11)', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('applies WAL + foreign_keys + tuned cache/mmap/busy/temp on openDatabase', () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const pragmas = {
				journal_mode: sqlite.pragma('journal_mode', { simple: true }),
				foreign_keys: sqlite.pragma('foreign_keys', { simple: true }),
				cache_size:   sqlite.pragma('cache_size',   { simple: true }),
				mmap_size:    sqlite.pragma('mmap_size',    { simple: true }),
				busy_timeout: sqlite.pragma('busy_timeout', { simple: true }),
				temp_store:   sqlite.pragma('temp_store',   { simple: true }),
				synchronous:  sqlite.pragma('synchronous',  { simple: true }),
			};
			expect(pragmas).toEqual({
				journal_mode: 'wal',
				foreign_keys: 1,
				cache_size:   -64000,
				mmap_size:    268435456,
				busy_timeout: 5000,
				temp_store:   2,           // MEMORY = 2 in SQLite's enum
				synchronous:  1,           // NORMAL = 1
			});
		} finally {
			close();
		}
	});
});
