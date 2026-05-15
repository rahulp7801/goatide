/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/constraint-lift.spec.ts — Phase 16 Plan 16-02 Task 2.
// 6-case GREEN suite: runConstraintLiftAnalysis real body (Wave 1 implements).
// All 6 cases flip GREEN from the Wave-0 throw-stub state.
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
			// Seed: 1 ConstraintNode (anchor) + 3 downstream nodes.
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: decisionId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: contractId } = dao.seed({ payload: VALID_PAYLOADS.ContractNode, provenance: VALID_PROVENANCE });
			const { id: openQId } = dao.seed({ payload: VALID_PAYLOADS.OpenQuestion, provenance: VALID_PROVENANCE });

			// Connect them: protects, references, parent_of.
			dao.writeEdge({ kind: 'protects', src_id: constraintId, dst_id: decisionId });
			dao.writeEdge({ kind: 'references', src_id: constraintId, dst_id: contractId });
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: openQId });

			// Capture asOf AFTER all writes to guarantee bitemporal coverage.
			const lastEdge = sqlite.prepare(`SELECT valid_from FROM edges ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

			const result = runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 3,
				asOf,
				dao,
				sqlite,
			});

			// All 3 downstream nodes should appear across both buckets.
			const allRows = [
				...result.hypothetical_impact.definitely_affected,
				...result.hypothetical_impact.potentially_affected,
			];
			expect(allRows.length).toBe(3);
			expect(allRows.some(r => r.node_id === decisionId)).toBe(true);
			expect(allRows.some(r => r.node_id === contractId)).toBe(true);
			expect(allRows.some(r => r.node_id === openQId)).toBe(true);
			// protects edge → definitely_affected.
			expect(result.hypothetical_impact.definitely_affected.some(r => r.node_id === decisionId)).toBe(true);
		} finally {
			close();
		}
	});

	it('honors maxHops literal-union (1 | 2 | 3)', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Build a 4-hop chain: constraint → A → B → C → D via parent_of edges.
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: aId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: bId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: cId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: dId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });

			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: aId });
			dao.writeEdge({ kind: 'parent_of', src_id: aId, dst_id: bId });
			dao.writeEdge({ kind: 'parent_of', src_id: bId, dst_id: cId });
			dao.writeEdge({ kind: 'parent_of', src_id: cId, dst_id: dId });

			const lastEdge = sqlite.prepare(`SELECT valid_from FROM edges ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

			const base = { constraintNodeId: constraintId, asOf, dao, sqlite };

			// maxHops:1 → only A returned (1 hop from anchor).
			const r1 = runConstraintLiftAnalysis({ ...base, maxHops: 1 });
			const all1 = [...r1.hypothetical_impact.definitely_affected, ...r1.hypothetical_impact.potentially_affected];
			expect(all1.some(r => r.node_id === aId)).toBe(true);
			expect(all1.some(r => r.node_id === bId)).toBe(false);

			// maxHops:2 → A + B returned.
			const r2 = runConstraintLiftAnalysis({ ...base, maxHops: 2 });
			const all2 = [...r2.hypothetical_impact.definitely_affected, ...r2.hypothetical_impact.potentially_affected];
			expect(all2.some(r => r.node_id === aId)).toBe(true);
			expect(all2.some(r => r.node_id === bId)).toBe(true);
			expect(all2.some(r => r.node_id === cId)).toBe(false);

			// maxHops:3 → A + B + C, but NOT D (4 hops).
			const r3 = runConstraintLiftAnalysis({ ...base, maxHops: 3 });
			const all3 = [...r3.hypothetical_impact.definitely_affected, ...r3.hypothetical_impact.potentially_affected];
			expect(all3.some(r => r.node_id === aId)).toBe(true);
			expect(all3.some(r => r.node_id === bId)).toBe(true);
			expect(all3.some(r => r.node_id === cId)).toBe(true);
			expect(all3.some(r => r.node_id === dId)).toBe(false);

			// TypeScript type-check: maxHops:4 would be a compile error.
			// @ts-expect-error maxHops must be 1|2|3 literal-union
			runConstraintLiftAnalysis({ ...base, maxHops: 4 });
		} finally {
			close();
		}
	});

	it('sorts Explicit-confidence rows first within each bucket', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed a ConstraintNode anchor + 4 downstream nodes.
			// 2 are seeded with Explicit confidence (default), 2 with Inferred.
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: exp1 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Explicit' });
			const { id: exp2 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Explicit' });
			const { id: inf1 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Inferred' });
			const { id: inf2 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Inferred' });

			// Connect all downstream via parent_of (→ potentially_affected bucket).
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: exp1 });
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: exp2 });
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: inf1 });
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: inf2 });

			const lastEdge = sqlite.prepare(`SELECT valid_from FROM edges ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

			const result = runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 1,
				asOf,
				dao,
				sqlite,
			});

			// All 4 should be in potentially_affected (parent_of first-edge).
			const bucket = result.hypothetical_impact.potentially_affected;
			expect(bucket.length).toBe(4);
			// First two rows must be explicit; last two must be inferred.
			expect(bucket[0]!.confidence_band).toBe('explicit');
			expect(bucket[1]!.confidence_band).toBe('explicit');
			expect(bucket[2]!.confidence_band).toBe('inferred');
			expect(bucket[3]!.confidence_band).toBe('inferred');
		} finally {
			close();
		}
	});

	it('Mandate B — queryByKind("Attempt") count unchanged across the full constraint-lift flow', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed an Attempt node + a ConstraintNode with edges, then verify that
			// runConstraintLiftAnalysis does NOT create any new graph rows.
			dao.seed({ payload: VALID_PAYLOADS.Attempt, provenance: VALID_PROVENANCE });
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: decisionId } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			dao.writeEdge({ kind: 'protects', src_id: constraintId, dst_id: decisionId });

			const lastEdge = sqlite.prepare(`SELECT valid_from FROM edges ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

			// Snapshot counts BEFORE the constraint-lift flow (DAO + raw SQL — two-layer fence).
			const before = dao.queryByKind('Attempt').length;
			const beforeRaw = sqlite.prepare("SELECT COUNT(*) AS c FROM nodes WHERE kind = 'Attempt'").get() as { c: number };

			runConstraintLiftAnalysis({ constraintNodeId: constraintId, maxHops: 3, asOf, dao, sqlite });

			// Snapshot counts AFTER — must be byte-equal.
			const after = dao.queryByKind('Attempt').length;
			const afterRaw = sqlite.prepare("SELECT COUNT(*) AS c FROM nodes WHERE kind = 'Attempt'").get() as { c: number };

			expect(after).toBe(before);
			expect(afterRaw.c).toBe(beforeRaw.c);
		} finally {
			close();
		}
	});

	it('sets truncated=true when nodeCap reached', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Use a small nodeCap:1 to trigger truncation with just 2 downstream nodes.
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: d1 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			const { id: d2 } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE });
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: d1 });
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: d2 });

			const lastEdge = sqlite.prepare(`SELECT valid_from FROM edges ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

			const result = runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 3,
				asOf,
				dao,
				sqlite,
				nodeCap: 1,  // cap at 1 to trigger truncation with 2 downstream nodes
			});

			expect(result.hypothetical_impact.truncated).toBe(true);
		} finally {
			close();
		}
	});

	it('high-confidence-first sort preserves [hops asc, node_id asc] secondary ordering', () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed a ConstraintNode + 4 nodes at hops 1, 1, 2, 2 — all Explicit confidence.
			// We need to control node IDs lexicographically, but ULIDs are not controllable.
			// We can sort by node_id within each hop — test asserts the ordering is correct.
			const { id: constraintId } = dao.seed({ payload: VALID_PAYLOADS.ConstraintNode, provenance: VALID_PROVENANCE });
			const { id: hop1a } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Explicit' });
			const { id: hop1b } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Explicit' });
			const { id: hop2a } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Explicit' });
			const { id: hop2b } = dao.seed({ payload: VALID_PAYLOADS.DecisionNode, provenance: VALID_PROVENANCE, confidence: 'Explicit' });

			// hop1a + hop1b at hop 1 (parent_of from anchor).
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: hop1a });
			dao.writeEdge({ kind: 'parent_of', src_id: constraintId, dst_id: hop1b });
			// hop2a + hop2b at hop 2 (parent_of from hop1a).
			dao.writeEdge({ kind: 'parent_of', src_id: hop1a, dst_id: hop2a });
			dao.writeEdge({ kind: 'parent_of', src_id: hop1a, dst_id: hop2b });

			const lastEdge = sqlite.prepare(`SELECT valid_from FROM edges ORDER BY recorded_at DESC LIMIT 1`).get() as { valid_from: string };
			const asOf = new Date(Date.parse(lastEdge.valid_from) + 1).toISOString();

			const result = runConstraintLiftAnalysis({
				constraintNodeId: constraintId,
				maxHops: 3,
				asOf,
				dao,
				sqlite,
			});

			// All 4 nodes in potentially_affected (parent_of first-edge).
			const bucket = result.hypothetical_impact.potentially_affected;
			expect(bucket.length).toBe(4);

			// All are explicit — confidence sort is tie-breaking.
			for (const r of bucket) {
				expect(r.confidence_band).toBe('explicit');
			}

			// Ordering within the bucket must be [hops asc, node_id asc].
			// First two rows are at hops=1, last two at hops=2.
			expect(bucket[0]!.hops).toBe(1);
			expect(bucket[1]!.hops).toBe(1);
			expect(bucket[2]!.hops).toBe(2);
			expect(bucket[3]!.hops).toBe(2);
			// Within each hop, lexicographic node_id ordering.
			const hop1Ids = [bucket[0]!.node_id, bucket[1]!.node_id].sort();
			expect(bucket[0]!.node_id <= bucket[1]!.node_id).toBe(true);
			expect(hop1Ids[0]).toBe(bucket[0]!.node_id);
			const hop2Ids = [bucket[2]!.node_id, bucket[3]!.node_id].sort();
			expect(bucket[2]!.node_id <= bucket[3]!.node_id).toBe(true);
			expect(hop2Ids[0]).toBe(bucket[2]!.node_id);
		} finally {
			close();
		}
	});
});
