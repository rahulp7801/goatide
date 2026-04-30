/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/triggers.spec.ts — Plan 02-02 Task 3.
//
// Defense-in-depth tests: bypass the (Wave-2) DAO entirely. Use raw better-sqlite3
// statements to assert the SQLite trigger layer fails closed on UPDATE OF recorded_at
// and DELETE — for nodes, edges, AND provenance. These are GRAPH-03 and GRAPH-04.
//
// Per CLAUDE.md ## Learnings: snapshot-style assertions over many micro-tests. The
// six trigger paths share one beforeEach + one toEqual at the end (sanity counts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase } from '../../graph/db.js';

function assertSqliteThrows(fn: () => void, messagePattern: RegExp): void {
	let caught: unknown;
	try {
		fn();
	} catch (e) {
		caught = e;
	}
	expect(caught).toBeDefined();
	expect((caught as Error).message).toMatch(messagePattern);
	// better-sqlite3 surfaces the SQLITE_CONSTRAINT* code on the error.
	expect((caught as { code?: string }).code).toMatch(/SQLITE_CONSTRAINT/);
}

describe('triggers — defense-in-depth Mandate B (GRAPH-03, GRAPH-04)', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('blocks UPDATE OF recorded_at and DELETE on nodes/edges/provenance via raw SQL', () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			// Seed two nodes + one edge + one provenance row using raw SQL (DAO doesn't exist
			// yet in Wave 1). ULID-shaped placeholder strings keep the test deterministic
			// without importing the `ulid` package (this test is supposed to bypass the DAO).
			const validPayload = JSON.stringify({ kind: 'ConstraintNode', body: 'FK NULL coercion is required' });
			sqlite.prepare(
				`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`
			).run('01HZTESTNODEAAAAAAAAAAAAAA', 'ConstraintNode', validPayload, 'Explicit');
			sqlite.prepare(
				`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`
			).run('01HZTESTNODEBBBBBBBBBBBBBB', 'ConstraintNode', validPayload, 'Explicit');
			sqlite.prepare(
				`INSERT INTO edges (id, kind, src_id, dst_id) VALUES (?, ?, ?, ?)`
			).run('01HZTESTEDGEAAAAAAAAAAAAAA', 'parent_of', '01HZTESTNODEAAAAAAAAAAAAAA', '01HZTESTNODEBBBBBBBBBBBBBB');
			sqlite.prepare(
				`INSERT INTO provenance (node_id, source, actor) VALUES (?, ?, ?)`
			).run('01HZTESTNODEAAAAAAAAAAAAAA', 'cli', 'test');

			// Six trigger paths bundled into one test (avoids 6 micro-tests):
			assertSqliteThrows(
				() => sqlite.prepare(`UPDATE nodes SET recorded_at = '1970-01-01T00:00:00.000Z' WHERE id = ?`).run('01HZTESTNODEAAAAAAAAAAAAAA'),
				/immutable/i
			);
			assertSqliteThrows(
				() => sqlite.prepare(`DELETE FROM nodes WHERE id = ?`).run('01HZTESTNODEAAAAAAAAAAAAAA'),
				/append-only/i
			);
			assertSqliteThrows(
				() => sqlite.prepare(`UPDATE edges SET recorded_at = '1970-01-01T00:00:00.000Z' WHERE id = ?`).run('01HZTESTEDGEAAAAAAAAAAAAAA'),
				/immutable/i
			);
			assertSqliteThrows(
				() => sqlite.prepare(`DELETE FROM edges WHERE id = ?`).run('01HZTESTEDGEAAAAAAAAAAAAAA'),
				/append-only/i
			);
			assertSqliteThrows(
				() => sqlite.prepare(`UPDATE provenance SET source = 'tampered' WHERE node_id = ?`).run('01HZTESTNODEAAAAAAAAAAAAAA'),
				/immutable/i
			);
			assertSqliteThrows(
				() => sqlite.prepare(`DELETE FROM provenance WHERE node_id = ?`).run('01HZTESTNODEAAAAAAAAAAAAAA'),
				/append-only/i
			);

			// Sanity: the originally-seeded rows are still there (RAISE(ABORT) only rolled
			// back the offending statements).
			const nodeCount = sqlite.prepare(`SELECT count(*) as n FROM nodes`).get() as { n: number };
			const edgeCount = sqlite.prepare(`SELECT count(*) as n FROM edges`).get() as { n: number };
			const provCount = sqlite.prepare(`SELECT count(*) as n FROM provenance`).get() as { n: number };
			expect({ nodeCount: nodeCount.n, edgeCount: edgeCount.n, provCount: provCount.n }).toEqual({
				nodeCount: 2, edgeCount: 1, provCount: 1,
			});
		} finally {
			close();
		}
	});

	it('does NOT block legitimate UPDATEs on invalidated_at / superseded_by (the supersession path)', () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const validPayload = JSON.stringify({ kind: 'ConstraintNode', body: 'legit body' });
			sqlite.prepare(`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`).run(
				'01HZTESTNODECCCCCCCCCCCCCC', 'ConstraintNode', validPayload, 'Explicit'
			);
			// This MUST succeed — supersession sets invalidated_at + superseded_by; the
			// trigger only fires on UPDATE OF recorded_at.
			const result = sqlite.prepare(
				`UPDATE nodes SET invalidated_at = ?, superseded_by = ? WHERE id = ?`
			).run('2026-01-01T00:00:00.000Z', '01HZTESTNODEDDDDDDDDDDDDDD', '01HZTESTNODECCCCCCCCCCCCCC');
			expect(result.changes).toBe(1);
		} finally {
			close();
		}
	});
});
