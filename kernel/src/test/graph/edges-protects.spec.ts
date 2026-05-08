/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/edges-protects.spec.ts — Phase 7 (Plan 07-01) cross-driver schema spec.
//
// Pitfall 3 from 07-RESEARCH.md: SQLite forbids ALTER TABLE ... ADD CHECK; Mandate B forbids
// DROP+RECREATE on the canonical edges table. The 0006_protects_edge_kind.sql migration
// installs a TRIGGER (`edges_kind_allowlist_trigger`) that re-enforces the 5-member edge-kind
// allowlist on INSERT and UPDATE.
//
// This spec bypasses the DAO — uses raw better-sqlite3 INSERT against a freshly migrated DB —
// to assert that the trigger fires for both drivers (drizzle and raw SQL). Mirrors the
// triggers.spec.ts pattern from Plan 02-02.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase } from '../../graph/db.js';

describe("Plan 07-01 — edges 'protects' kind allowlist (cross-driver via trigger)", () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it("accepts kind='protects' via raw INSERT and rejects kind='illegal_kind' via trigger ABORT", () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			// Seed two anchor nodes (the trigger is on edges, not nodes — node FK still applies).
			const validPayload = JSON.stringify({ kind: 'ContractNode', body: 'contract X' });
			sqlite.prepare(`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`)
				.run('01PROTECTSTESTAAAAAAAAAAAA', 'ContractNode', validPayload, 'Explicit');
			sqlite.prepare(`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`)
				.run('01PROTECTSTESTBBBBBBBBBBBB', 'ContractNode', validPayload, 'Explicit');

			// 'protects' must succeed under the new trigger.
			const protectsResult = sqlite.prepare(
				`INSERT INTO edges (id, kind, src_id, dst_id) VALUES (?, ?, ?, ?)`
			).run('01PROTECTSTESTEDGE0000000A', 'protects', '01PROTECTSTESTAAAAAAAAAAAA', '01PROTECTSTESTBBBBBBBBBBBB');

			// 'illegal_kind' must abort with the trigger's RAISE message.
			let caught: unknown;
			try {
				sqlite.prepare(`INSERT INTO edges (id, kind, src_id, dst_id) VALUES (?, ?, ?, ?)`)
					.run('01PROTECTSTESTEDGE0000000B', 'illegal_kind', '01PROTECTSTESTAAAAAAAAAAAA', '01PROTECTSTESTBBBBBBBBBBBB');
			} catch (e) {
				caught = e;
			}

			// Snapshot-style: bundle the success-row count + the rejection error code/message.
			const edgeCount = (sqlite.prepare(`SELECT count(*) as n FROM edges`).get() as { n: number }).n;
			expect({
				protectsChanges: protectsResult.changes,
				edgeCount,
				illegalCaught: caught instanceof Error,
				illegalMessageMatches: caught instanceof Error && /edges_kind_allowlist/.test(caught.message),
				illegalCode: (caught as { code?: string } | undefined)?.code,
			}).toEqual({
				protectsChanges: 1,
				edgeCount: 1,
				illegalCaught: true,
				illegalMessageMatches: true,
				illegalCode: expect.stringMatching(/SQLITE_CONSTRAINT/),
			});
		} finally {
			close();
		}
	});

	it("accepts each of the four pre-existing kinds (parent_of/references/supersedes/derived_from) on a freshly migrated DB", () => {
		const { sqlite, close } = openDatabase(tmp.dbPath);
		try {
			const validPayload = JSON.stringify({ kind: 'ContractNode', body: 'contract' });
			sqlite.prepare(`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`)
				.run('01BACKCOMPATAAAAAAAAAAAAAA', 'ContractNode', validPayload, 'Explicit');
			sqlite.prepare(`INSERT INTO nodes (id, kind, payload, confidence) VALUES (?, ?, ?, ?)`)
				.run('01BACKCOMPATBBBBBBBBBBBBBB', 'ContractNode', validPayload, 'Explicit');

			const inserts = ['parent_of', 'references', 'supersedes', 'derived_from'];
			let i = 0;
			for (const k of inserts) {
				const id = `01BACKCOMPATEDGE${String(i).padStart(10, '0')}`;
				sqlite.prepare(`INSERT INTO edges (id, kind, src_id, dst_id) VALUES (?, ?, ?, ?)`)
					.run(id, k, '01BACKCOMPATAAAAAAAAAAAAAA', '01BACKCOMPATBBBBBBBBBBBBBB');
				i++;
			}
			const edgeCount = (sqlite.prepare(`SELECT count(*) as n FROM edges`).get() as { n: number }).n;
			expect(edgeCount).toBe(4);
		} finally {
			close();
		}
	});
});
