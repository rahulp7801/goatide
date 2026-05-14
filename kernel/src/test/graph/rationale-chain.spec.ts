/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/rationale-chain.spec.ts — Phase 14 Plan 14-01 (Wave-0) RED suite
// for DEEP-01 composeRationaleChainAt.
//
// Four tests cover the contract Plan 14-02 must satisfy:
//   1. seed-anchored chain returns ConstraintNode + DecisionNode entries only
//   2. (bitemporal) chain at t1 differs from chain at t2 across a supersession event
//   3. has_superseded === true when any chain entry has invalidated_at !== null
//   4. empty anchor returns {chain: [], has_superseded: false}
//
// All four are RED at Wave-0: composeRationaleChainAt throws. Plan 14-02 flips them GREEN
// by landing the composition body.
//
// Pitfalls (pinned via test shape):
//   - Pitfall 1 (asOf drift): test 2 captures two independent asOf timestamps before and
//     after a supersession to prove bitemporal stability.
//   - Pitfall 6 (null successor): test 3 seeds a DecisionNode whose invalidated_at is
//     non-null but successor_id is null and asserts the row still surfaces in the chain
//     (has_superseded fires off invalidated_at, not successor_id).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { composeRationaleChainAt } from '../../graph/rationale-chain.js';

describe('rationale-chain', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
	});

	afterEach(() => {
		handle.close();
		tmp.dispose();
	});

	it('returns ConstraintNode + DecisionNode rows when seeded from an anchored decision', () => {
		const decision = dao.seed({
			payload: {
				kind: 'DecisionNode',
				body: 'Use refresh-token rotation',
				anchor: { file: 'src/auth.ts' },
			},
			provenance: { source: 'cli', actor: 'test' },
		});
		const asOf = new Date(Date.now() + 1).toISOString();
		const result = composeRationaleChainAt(
			{ dao, sqlite: handle.sqlite },
			{ anchor: { kind: 'node_id', id: decision.id }, asOf },
		);
		const kinds = result.chain.map((e) => e.kind).sort();
		// Permit either [DecisionNode] alone OR mixed ConstraintNode/DecisionNode entries.
		expect(kinds.every((k) => k === 'ConstraintNode' || k === 'DecisionNode')).toBe(true);
		expect(result.chain.length).toBeGreaterThanOrEqual(1);
	});

	describe('bitemporal', () => {
		it('chain at t1 differs from chain at t2 when a supersession lands between them', () => {
			// Plan 14-02: Make the test deterministic against Date.now() granularity. Read
			// the original row's valid_from directly from SQLite and use that as t1 — guaranteed
			// to be the seed instant, strictly before any subsequent supersede() call which
			// allocates its own (later) ts via nowIso().
			const original = dao.seed({
				payload: {
					kind: 'DecisionNode',
					body: 'Use cookie session storage',
					anchor: { file: 'src/auth.ts' },
				},
				provenance: { source: 'cli', actor: 'test' },
			});
			const originalRow = handle.sqlite
				.prepare('SELECT valid_from FROM nodes WHERE id = ?')
				.get(original.id) as { valid_from: string };
			const t1 = originalRow.valid_from;
			// Supersede with a new decision pointing to the same anchor. supersede() captures
			// its own ts via nowIso() AFTER t1 is fixed, so the new row's valid_from > t1
			// (modulo SQLite text-ISO sort), making t1 strictly pre-supersession.
			const successor = dao.supersede(
				original.id,
				{
					kind: 'DecisionNode',
					body: 'Use refresh-token rotation',
					anchor: { file: 'src/auth.ts' },
				},
				{ source: 'cli', actor: 'test' },
			);
			const successorRow = handle.sqlite
				.prepare('SELECT valid_from FROM nodes WHERE id = ?')
				.get(successor.newId) as { valid_from: string };
			// t2: strictly after the supersession (lexicographic +1 on the ISO suffix).
			const t2 = successorRow.valid_from;

			const r1 = composeRationaleChainAt({ dao, sqlite: handle.sqlite }, { anchor: { kind: 'file', path: 'src/auth.ts' }, asOf: t1 });
			const r2 = composeRationaleChainAt({ dao, sqlite: handle.sqlite }, { anchor: { kind: 'file', path: 'src/auth.ts' }, asOf: t2 });
			const ids1 = r1.chain.map((e) => e.node_id).sort();
			const ids2 = r2.chain.map((e) => e.node_id).sort();
			// At t1 (pre-supersession): the original is the only file-anchored DecisionNode.
			// At t2 (post-supersession): the successor is the active one for that file.
			expect(ids1).toContain(original.id);
			expect(ids2).toContain(successor.newId);
			// Symmetric difference: the two sets are not identical.
			expect(ids1).not.toEqual(ids2);
		});
	});

	it('has_superseded fires off invalidated_at even when successor_id is null (Pitfall 6)', () => {
		const decision = dao.seed({
			payload: {
				kind: 'DecisionNode',
				body: 'Use redis as queue backend',
				anchor: { file: 'src/queue.ts' },
			},
			provenance: { source: 'cli', actor: 'test' },
		});
		// Plan 14-02: place the invalidation INSTANT in the future (relative to the asOf we
		// query at), so the bitemporal `invalidated_at > @at` gate in traverse() admits the
		// row into the chain. composeRationaleChainAt's has_superseded fires off
		// `invalidated_at !== null` (Pitfall 6) — the row carries a non-null invalidated_at
		// string regardless of whether the asOf is before or after it.
		const futureTs = new Date(Date.now() + 60_000).toISOString();
		handle.sqlite.prepare(`UPDATE nodes SET invalidated_at = ? WHERE id = ?`).run(futureTs, decision.id);
		const asOf = new Date().toISOString();
		const result = composeRationaleChainAt(
			{ dao, sqlite: handle.sqlite },
			{ anchor: { kind: 'node_id', id: decision.id }, asOf },
		);
		expect(result.has_superseded).toBe(true);
		const entry = result.chain.find((e) => e.node_id === decision.id);
		expect(entry?.successor_id).toBeNull();
		expect(entry?.invalidated_at).toBe(futureTs);
	});

	it('empty anchor returns {chain: [], has_superseded: false}', () => {
		const asOf = new Date().toISOString();
		const result = composeRationaleChainAt(
			{ dao, sqlite: handle.sqlite },
			{ anchor: { kind: 'file', path: 'no/such/path.ts' }, asOf },
		);
		expect(result).toEqual({ chain: [], has_superseded: false });
	});
});
