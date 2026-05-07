/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/offsets.spec.ts — Phase 5 Plan 05-03.
//
// OffsetsDao read/write round-trip against the harvest_offsets table created by the
// 0005 migration in Plan 05-01. The DAO wraps the same better-sqlite3 handle the
// GraphDAO already opens, so test harness reuses openDatabase + mkTempDb.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../../graph/db.js';
import { OffsetsDao } from '../../harvester/offsets.js';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';

describe('Plan 05-03: OffsetsDao read/write round-trip', () => {
	let tmp: TempDb;
	let handle: ReturnType<typeof openDatabase>;
	let dao: OffsetsDao;

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new OffsetsDao(handle.sqlite);
	});

	afterEach(() => {
		try { handle.close(); } catch { /* best-effort */ }
		tmp.dispose();
	});

	it('returns null on missing path; round-trips writes; UPSERTs on repeat write', () => {
		const before = dao.read('/tmp/missing.jsonl');
		dao.write({ absolute_path: '/tmp/x.jsonl', byte_offset: 1024, last_inode: 12345, last_mtime_ms: 1700000000000 });
		const first = dao.read('/tmp/x.jsonl');
		dao.write({ absolute_path: '/tmp/x.jsonl', byte_offset: 4096, last_inode: 67890, last_mtime_ms: 1700000001234 });
		const second = dao.read('/tmp/x.jsonl');

		expect({
			before,
			first: first && {
				absolute_path: first.absolute_path,
				byte_offset: first.byte_offset,
				last_inode: first.last_inode,
				last_mtime_ms: first.last_mtime_ms,
			},
			second: second && {
				absolute_path: second.absolute_path,
				byte_offset: second.byte_offset,
				last_inode: second.last_inode,
				last_mtime_ms: second.last_mtime_ms,
			},
		}).toEqual({
			before: null,
			first: { absolute_path: '/tmp/x.jsonl', byte_offset: 1024, last_inode: 12345, last_mtime_ms: 1700000000000 },
			second: { absolute_path: '/tmp/x.jsonl', byte_offset: 4096, last_inode: 67890, last_mtime_ms: 1700000001234 },
		});
	});
});
