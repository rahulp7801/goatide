/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/constraint-lift.spec.ts — Phase 16 Plan 16-01 Task 3.
// 6-case RED suite at Wave-0 close: runConstraintLiftAnalysis is a throw-stub.
// Wave 1 (Plan 16-02) GREEN-flips all 6 via the real body landing.
// VALIDATION.md task rows 16-00-10..15 grep target: verbatim case-name strings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { runConstraintLiftAnalysis } from '../../drift/constraint-lift.js';
import { VALID_PAYLOADS, VALID_PROVENANCE } from '../helpers/seed-fixtures.js';

describe('runConstraintLiftAnalysis', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('walks outgoing protects+references+parent_of edges from a ConstraintNode seed', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const asOf = new Date().toISOString();
			// Wave-0 throw-stub: Wave 1 (Plan 16-02) GREEN-flips with real BFS walk body.
			expect(() => runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 3,
				asOf,
				dao,
				sqlite,
			})).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});

	it('honors maxHops literal-union (1 | 2 | 3)', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const asOf = new Date().toISOString();
			// maxHops is typed 1|2|3 literal-union — refuse-unbounded-ripple-walk gate enforces.
			// Wave-0 throw-stub: Wave 1 GREEN-flips all hop-depth variants.
			expect(() => runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 1,
				asOf,
				dao,
				sqlite,
			})).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});

	it('sorts Explicit-confidence rows first within each bucket', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const asOf = new Date().toISOString();
			// Wave-0 throw-stub: Wave 1 asserts confidence sort in the real body.
			expect(() => runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 3,
				asOf,
				dao,
				sqlite,
			})).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});

	it('Mandate B — queryByKind("Attempt") count unchanged across the full constraint-lift flow', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const attemptsBefore = dao.queryByKind('Attempt').length;
			const asOf = new Date().toISOString();
			// Wave-0 throw-stub; when Wave 1 fills the body, the real test body verifies
			// Attempt count is unchanged (Mandate B — read-only constraint-lift path).
			try {
				runConstraintLiftAnalysis({ constraintNodeId: constraintId, maxHops: 3, asOf, dao, sqlite });
			} catch {
				// Expected at Wave-0 — throw-stub. Wave 1 GREEN-flips with count assertion.
			}
			const attemptsAfter = dao.queryByKind('Attempt').length;
			expect(attemptsAfter).toBe(attemptsBefore);  // GREEN even at Wave-0 (no write happened)
		} finally {
			close();
		}
	});

	it('sets truncated=true when nodeCap reached', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const asOf = new Date().toISOString();
			// Wave-0 throw-stub: Wave 1 fills truncated=true assertion with nodeCap=1.
			expect(() => runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 3,
				asOf,
				dao,
				sqlite,
				nodeCap: 1,
			})).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});

	it('high-confidence-first sort preserves [hops asc, node_id asc] secondary ordering', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const asOf = new Date().toISOString();
			// Wave-0 throw-stub: Wave 1 fills the secondary-sort assertion.
			expect(() => runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 3,
				asOf,
				dao,
				sqlite,
			})).toThrow('Wave 1 implements');
		} finally {
			close();
		}
	});
});
