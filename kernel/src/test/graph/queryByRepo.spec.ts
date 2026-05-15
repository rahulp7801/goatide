/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/queryByRepo.spec.ts — Phase 16 Plan 16-01 Task 3.
// 3-case RED suite at Wave-0 close: dao.queryByRepo is a throw-stub that throws
// 'Wave 1 implements - Plan 16-02'. Wave 1 (Plan 16-02) GREEN-flips all 3 cases.
// VALIDATION.md task rows 16-00-07..09 grep target: verbatim case-name strings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';

describe('dao.queryByRepo', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('returns only primary-repo nodes for repoId="primary"', () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Wave-0 throw-stub: Wave 1 (Plan 16-02) fills the real Drizzle body.
			expect(() => dao.queryByRepo('primary', new Date().toISOString())).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});

	it('honors bitemporal asOf for repo-scoped reads', () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Wave-0 throw-stub: Wave 1 (Plan 16-02) fills the bitemporal predicate body.
			expect(() => dao.queryByRepo('primary', new Date().toISOString())).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});

	it('returns [] for an empty repo', () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Wave-0 throw-stub: Wave 1 (Plan 16-02) GREEN-flips with [] for unknown repoId.
			expect(() => dao.queryByRepo('nonexistent-repo', new Date().toISOString())).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});
});
