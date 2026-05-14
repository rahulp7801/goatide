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
			const original = dao.seed({
				payload: {
					kind: 'DecisionNode',
					body: 'Use cookie session storage',
					anchor: { file: 'src/auth.ts' },
				},
				provenance: { source: 'cli', actor: 'test' },
			});
			// t1: before supersession.
			const t1 = new Date(Date.now() + 1).toISOString();
			// Supersede with a new decision pointing to the same anchor.
			const successor = dao.supersede(
				original.id,
				{
					kind: 'DecisionNode',
					body: 'Use refresh-token rotation',
					anchor: { file: 'src/auth.ts' },
				},
				{ source: 'cli', actor: 'test' },
			);
			// t2: AFTER supersession.
			const t2 = new Date(Date.now() + 2).toISOString();

			const r1 = composeRationaleChainAt({ dao, sqlite: handle.sqlite }, { anchor: { kind: 'file', path: 'src/auth.ts' }, asOf: t1 });
			const r2 = composeRationaleChainAt({ dao, sqlite: handle.sqlite }, { anchor: { kind: 'file', path: 'src/auth.ts' }, asOf: t2 });
			const ids1 = r1.chain.map((e) => e.node_id).sort();
			const ids2 = r2.chain.map((e) => e.node_id).sort();
			expect(ids1).not.toEqual(ids2);
			expect(ids2).toContain(successor.newId);
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
		// Manually invalidate without supersession (null-successor edge case).
		const ts = new Date().toISOString();
		handle.sqlite.prepare(`UPDATE nodes SET invalidated_at = ? WHERE id = ?`).run(ts, decision.id);
		const asOf = new Date(Date.now() + 1).toISOString();
		const result = composeRationaleChainAt(
			{ dao, sqlite: handle.sqlite },
			{ anchor: { kind: 'node_id', id: decision.id }, asOf },
		);
		expect(result.has_superseded).toBe(true);
		const entry = result.chain.find((e) => e.node_id === decision.id);
		expect(entry?.successor_id).toBeNull();
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
